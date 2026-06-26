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
        self._meter_info: dict = {}

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch and aggregate all data."""
        try:
            await self.client.ensure_authenticated()

            today = date.today()
            year_start = date(today.year, 1, 1)

            # Fetch YTD consumption (from Jan 1 to yesterday)
            yesterday = today - timedelta(days=1)
            raw = await self.client.get_consumption(year_start, yesterday)

            if not raw and self._daily_cache:
                _LOGGER.warning("No consumption data returned, using cached data")
                daily = self._daily_cache
            else:
                daily = aggregate_to_daily(raw)
                self._daily_cache = daily

            # Hourly for yesterday
            hourly_raw = await self.client.get_consumption(yesterday, yesterday)
            self._hourly_yesterday = aggregate_to_hourly(hourly_raw)

            # Aggregations
            monthly = aggregate_to_monthly(daily)
            ytd = compute_ytd(daily)
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

            # Unit rate for cost calculations
            unit_rate = self._meter_info.get("unit_rate", 0) or 0
            unit_rate_eur = round(unit_rate / 100, 6) if unit_rate else 0.271915

            return {
                "ytd": ytd,
                "ytd_cost": round(ytd["kwh"] * unit_rate_eur, 2),
                "current_month": current_month,
                "current_month_cost": round(current_month.get("total_kwh", 0) * unit_rate_eur, 2),
                "prev_month": prev_month,
                "prev_month_cost": round(prev_month.get("total_kwh", 0) * unit_rate_eur, 2),
                "yesterday_kwh": yesterday_data["kwh"] if yesterday_data else 0.0,
                "yesterday_cost": round((yesterday_data["kwh"] if yesterday_data else 0) * unit_rate_eur, 2),
                "hourly_yesterday": self._hourly_yesterday,
                "last_30_days": last_30,
                "monthly": monthly,
                "balance": balance,
                "unit_rate": unit_rate_eur,
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
