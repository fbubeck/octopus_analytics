"""Octopus Analytics integration."""
from __future__ import annotations

import logging
from pathlib import Path

import aiohttp
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:  # pragma: no cover - compatibility fallback
    try:
        from homeassistant.components.http.static import StaticPathConfig
    except ImportError:
        StaticPathConfig = None

from .api import OctopusAnalyticsApiClient
from .const import CONF_EMAIL, CONF_PASSWORD, DOMAIN
from .coordinator import OctopusAnalyticsCoordinator

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.SENSOR]
STATIC_URL_PATH = f"/{DOMAIN}_static"
STATIC_DIR = Path(__file__).parent / "www"


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Expose the bundled Lovelace card as a static asset."""
    if hasattr(hass.http, "async_register_static_paths") and StaticPathConfig:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL_PATH, str(STATIC_DIR), True)]
        )
    elif hasattr(hass.http, "register_static_path"):
        hass.http.register_static_path(STATIC_URL_PATH, str(STATIC_DIR), True)
    else:
        _LOGGER.warning(
            "Could not register Octopus Analytics card static path on this Home Assistant version"
        )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Octopus Analytics from a config entry."""
    await _async_register_frontend(hass)

    session = async_get_clientsession(hass)
    client = OctopusAnalyticsApiClient(
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
        session,
    )

    coordinator = OctopusAnalyticsCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
