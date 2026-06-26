"""Sensor platform for Octopus Analytics."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import OctopusAnalyticsCoordinator

_LOGGER = logging.getLogger(__name__)


@dataclass
class OctopusSensorEntityDescription(SensorEntityDescription):
    """Describe an Octopus Analytics sensor."""
    value_fn: Callable[[dict], Any] = lambda d: None
    attr_fn: Callable[[dict], dict] = lambda d: {}


SENSOR_DESCRIPTIONS: list[OctopusSensorEntityDescription] = [
    OctopusSensorEntityDescription(
        key="ytd_kwh",
        name="YTD Verbrauch",
        icon="mdi:lightning-bolt",
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["ytd"]["kwh"],
        attr_fn=lambda d: {
            "days": d["ytd"]["days"],
            "avg_day_kwh": d["ytd"]["avg_day_kwh"],
            "year": d["updated"][:4],
        },
    ),
    OctopusSensorEntityDescription(
        key="ytd_cost",
        name="YTD Kosten",
        icon="mdi:currency-eur",
        native_unit_of_measurement="EUR",
        device_class=SensorDeviceClass.MONETARY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["ytd_cost"],
    ),
    OctopusSensorEntityDescription(
        key="month_kwh",
        name="Monatsverbrauch",
        icon="mdi:calendar-month",
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["current_month"].get("total_kwh", 0),
        attr_fn=lambda d: {
            "avg_day_kwh": d["current_month"].get("avg_day_kwh"),
            "days": d["current_month"].get("days"),
            "peak_kwh": d["current_month"].get("peak_kwh"),
            "peak_date": d["current_month"].get("peak_date"),
            "low_kwh": d["current_month"].get("low_kwh"),
            "low_date": d["current_month"].get("low_date"),
        },
    ),
    OctopusSensorEntityDescription(
        key="month_cost",
        name="Monatskosten",
        icon="mdi:currency-eur",
        native_unit_of_measurement="EUR",
        device_class=SensorDeviceClass.MONETARY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["current_month_cost"],
    ),
    OctopusSensorEntityDescription(
        key="prev_month_kwh",
        name="Vormonat Verbrauch",
        icon="mdi:calendar-arrow-left",
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["prev_month"].get("total_kwh", 0),
        attr_fn=lambda d: {
            "avg_day_kwh": d["prev_month"].get("avg_day_kwh"),
            "days": d["prev_month"].get("days"),
            "peak_kwh": d["prev_month"].get("peak_kwh"),
            "peak_date": d["prev_month"].get("peak_date"),
        },
    ),
    OctopusSensorEntityDescription(
        key="prev_month_cost",
        name="Vormonat Kosten",
        icon="mdi:currency-eur",
        native_unit_of_measurement="EUR",
        device_class=SensorDeviceClass.MONETARY,
        state_class=SensorStateClass.TOTAL,
        value_fn=lambda d: d["prev_month_cost"],
    ),
    OctopusSensorEntityDescription(
        key="yesterday_kwh",
        name="Verbrauch Gestern",
        icon="mdi:lightning-bolt-circle",
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d["yesterday_kwh"],
        attr_fn=lambda d: {
            "cost_eur": d["yesterday_cost"],
            "hourly": d["hourly_yesterday"],
        },
    ),
    OctopusSensorEntityDescription(
        key="yesterday_cost",
        name="Kosten Gestern",
        icon="mdi:currency-eur",
        native_unit_of_measurement="EUR",
        device_class=SensorDeviceClass.MONETARY,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d["yesterday_cost"],
    ),
    OctopusSensorEntityDescription(
        key="balance",
        name="Kontostand",
        icon="mdi:bank",
        native_unit_of_measurement="EUR",
        device_class=SensorDeviceClass.MONETARY,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d["balance"],
    ),
    OctopusSensorEntityDescription(
        key="unit_rate",
        name="Strompreis",
        icon="mdi:tag",
        native_unit_of_measurement="EUR/kWh",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda d: d["unit_rate"],
    ),
    OctopusSensorEntityDescription(
        key="last_30_days",
        name="Letzte 30 Tage JSON",
        icon="mdi:chart-bar",
        value_fn=lambda d: len(d["last_30_days"]),
        attr_fn=lambda d: {"data": d["last_30_days"]},
    ),
    OctopusSensorEntityDescription(
        key="monthly_summary",
        name="Monatszusammenfassung JSON",
        icon="mdi:chart-timeline-variant",
        value_fn=lambda d: len(d["monthly"]),
        attr_fn=lambda d: {"data": d["monthly"]},
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Octopus Analytics sensors."""
    coordinator: OctopusAnalyticsCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        OctopusAnalyticsSensor(coordinator, entry, description)
        for description in SENSOR_DESCRIPTIONS
    )


class OctopusAnalyticsSensor(CoordinatorEntity[OctopusAnalyticsCoordinator], SensorEntity):
    """An Octopus Analytics sensor."""

    entity_description: OctopusSensorEntityDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: OctopusAnalyticsCoordinator,
        entry: ConfigEntry,
        description: OctopusSensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        account_id = entry.unique_id or entry.entry_id
        self._attr_unique_id = f"{account_id}_{description.key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, account_id)},
            "name": "Octopus Analytics",
            "manufacturer": "Octopus Energy Germany",
            "model": "Analytics",
        }

    @property
    def native_value(self) -> Any:
        if not self.coordinator.data:
            return None
        try:
            return self.entity_description.value_fn(self.coordinator.data)
        except (KeyError, TypeError):
            return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if not self.coordinator.data:
            return {}
        try:
            return self.entity_description.attr_fn(self.coordinator.data)
        except (KeyError, TypeError):
            return {}
