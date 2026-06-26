"""DataUpdateCoordinator for Octopus Analytics."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .analytics import (
    aggregate_to_daily,
    aggregate_to_hourly,
    aggregate_to_monthly,
    compute_ytd,
    get_last_n_days,
)
from .api import OctopusAnalyticsApiClient, OctopusAnalyticsApiError, OctopusAnalyticsAuthError
from .const import DOMAIN, UPDATE_INTERVAL

_LOGGER = logging.getLogger(__name__)


class OctopusAnalyticsCoordinator(DataUpdateCoordinator):
    """Coordinator that fetches and aggregates Octopus consumption data."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: OctopusAnalyticsApiClient,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=UPDATE_INTERVAL,
        )
        self.client = client
        self._daily_cache: list[dict] = []
        self._hourly_yesterday: list[dict] = []
        self._hourly_history: list[dict] = []
        self._meter_info: dict = {}

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch and aggregate all data."""
        try:
            await self.client.ensure_authenticated()

            today = date.today()
            history_start = today - timedelta(days=365)

            # Fetch rolling 12 months of daily consumption. YTD is still computed
            # from this data by filtering to the current calendar year.
            yesterday = today - timedelta(days=1)
            raw = await self.client.get_consumption(
                history_start, yesterday, "DAY_INTERVAL"
            )

            if not raw and self._daily_cache:
                _LOGGER.warning("No consumption data returned, using cached data")
                daily = self._daily_cache
            else:
                daily = aggregate_to_daily(raw)
                self._daily_cache = daily

            # Hourly data for yesterday and recent history for day navigation.
            hourly_raw = await self.client.get_consumption(
                yesterday, yesterday, "THIRTY_MIN_INTERVAL"
            )
            self._hourly_yesterday = aggregate_to_hourly(hourly_raw)

            hourly_history_start = today - timedelta(days=30)
            hourly_history_raw = await self.client.get_consumption(
                hourly_history_start, yesterday, "THIRTY_MIN_INTERVAL"
            )
            self._hourly_history = aggregate_to_hourly(hourly_history_raw)

            # Aggregations
            monthly = aggregate_to_monthly(daily)
            ytd = compute_ytd(daily)
            daily_history = get_last_n_days(daily, 365)
            last_30 = get_last_n_days(daily, 30)

            # Current month data
            current_month_key = today.strftime("%Y-%m")
            current_month = monthly.get(current_month_key, {
                "total_kwh": 0.0,
                "avg_day_kwh": 0.0,
                "days": 0,
                "peak_kwh": 0.0,
                "peak_date": None,
                "low_kwh": 0.0,
                "low_date": None,
            })

            # Previous month
            first_of_month = today.replace(day=1)
            prev_month_date = first_of_month - timedelta(days=1)
            prev_month_key = prev_month_date.strftime("%Y-%m")
            prev_month = monthly.get(prev_month_key, {})

            # Yesterday
            yesterday_str = yesterday.isoformat()
            yesterday_data = next(
                (d for d in daily if d["date"] == yesterday_str), None
            )

            # Balance
            balance = await self.client.get_account_balance()

            # Meter info (cached after first fetch)
            if not self._meter_info:
                self._meter_info = await self.client.get_meter_info()

            # Cost calculations. Octopus returns rates in cents; the integration
            # exposes EUR/kWh and EUR/day. Total costs are estimated from the
            # available consumption days and do not include payments/credits.
            unit_rate = self._meter_info.get("unit_rate")
            unit_rate_eur = round(float(unit_rate) / 100, 6) if unit_rate else 0.271915
            standing_charge = self._meter_info.get("standing_charge")
            standing_charge_eur = (
                round(float(standing_charge) / 100, 6) if standing_charge else 0.0
            )

            ytd_energy_cost = round(ytd["kwh"] * unit_rate_eur, 2)
            ytd_standing_cost = round(ytd["days"] * standing_charge_eur, 2)
            current_month_energy_cost = round(
                current_month.get("total_kwh", 0) * unit_rate_eur, 2
            )
            current_month_standing_cost = round(
                current_month.get("days", 0) * standing_charge_eur, 2
            )
            prev_month_energy_cost = round(
                prev_month.get("total_kwh", 0) * unit_rate_eur, 2
            )
            prev_month_standing_cost = round(
                prev_month.get("days", 0) * standing_charge_eur, 2
            )
            yesterday_energy_cost = round(
                (yesterday_data["kwh"] if yesterday_data else 0) * unit_rate_eur, 2
            )
            yesterday_standing_cost = round(
                standing_charge_eur if yesterday_data else 0.0, 2
            )

            return {
                "ytd": ytd,
                "ytd_energy_cost": ytd_energy_cost,
                "ytd_standing_cost": ytd_standing_cost,
                "ytd_cost": round(ytd_energy_cost + ytd_standing_cost, 2),
                "current_month": current_month,
                "current_month_energy_cost": current_month_energy_cost,
                "current_month_standing_cost": current_month_standing_cost,
                "current_month_cost": round(
                    current_month_energy_cost + current_month_standing_cost, 2
                ),
                "prev_month": prev_month,
                "prev_month_energy_cost": prev_month_energy_cost,
                "prev_month_standing_cost": prev_month_standing_cost,
                "prev_month_cost": round(
                    prev_month_energy_cost + prev_month_standing_cost, 2
                ),
                "yesterday_kwh": yesterday_data["kwh"] if yesterday_data else 0.0,
                "yesterday_energy_cost": yesterday_energy_cost,
                "yesterday_standing_cost": yesterday_standing_cost,
                "yesterday_cost": round(
                    yesterday_energy_cost + yesterday_standing_cost, 2
                ),
                "hourly_yesterday": self._hourly_yesterday,
                "hourly_history": self._hourly_history,
                "last_30_days": last_30,
                "daily_history": daily_history,
                "monthly": monthly,
                "balance": balance,
                "unit_rate": unit_rate_eur,
                "standing_charge": standing_charge_eur,
                "meter_info": self._meter_info,
                "updated": date.today().isoformat(),
            }

        except OctopusAnalyticsAuthError as err:
            raise UpdateFailed(f"Authentication error: {err}") from err
        except OctopusAnalyticsApiError as err:
            raise UpdateFailed(f"API error: {err}") from err
        except Exception as err:
            _LOGGER.exception("Unexpected error fetching Octopus data")
            raise UpdateFailed(f"Unexpected error: {err}") from err
