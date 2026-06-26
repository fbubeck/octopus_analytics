"""Config flow for Octopus Analytics."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .api import OctopusAnalyticsApiClient, OctopusAnalyticsAuthError
from .const import CONF_EMAIL, CONF_PASSWORD, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_EMAIL): str,
        vol.Required(CONF_PASSWORD): str,
    }
)


class OctopusAnalyticsConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Octopus Analytics."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                async with aiohttp.ClientSession() as session:
                    client = OctopusAnalyticsApiClient(
                        user_input[CONF_EMAIL],
                        user_input[CONF_PASSWORD],
                        session,
                    )
                    await client.authenticate()
                    account_number = await client.get_account_number()

            except OctopusAnalyticsAuthError:
                errors["base"] = "invalid_auth"
            except Exception:
                _LOGGER.exception("Unexpected error during config flow")
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(account_number)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=f"Octopus Analytics ({user_input[CONF_EMAIL]})",
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )
