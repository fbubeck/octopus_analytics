"""Octopus Energy Germany GraphQL API client."""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

API_URL = "https://api.oeg-kraken.energy/v1/graphql/"


class OctopusAnalyticsApiError(Exception):
    """Raised when the API returns an error."""


class OctopusAnalyticsAuthError(OctopusAnalyticsApiError):
    """Raised when authentication fails."""


class OctopusAnalyticsApiClient:
    """Async GraphQL client for Octopus Energy Germany."""

    def __init__(self, email: str, password: str, session: aiohttp.ClientSession) -> None:
        self._email = email
        self._password = password
        self._session = session
        self._token: str | None = None
        self._account_number: str | None = None

    async def _graphql(self, query: str, variables: dict | None = None, auth: bool = True) -> dict:
        """Execute a GraphQL query."""
        headers = {"Content-Type": "application/json"}
        if auth and self._token:
            headers["Authorization"] = f"JWT {self._token}"

        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables

        async with self._session.post(API_URL, json=payload, headers=headers) as resp:
            if resp.status == 401:
                raise OctopusAnalyticsAuthError("Authentication failed")
            data = await resp.json()
            if "errors" in data:
                raise OctopusAnalyticsApiError(f"GraphQL error: {data['errors']}")
            return data.get("data", {})

    async def authenticate(self) -> str:
        """Authenticate and return JWT token."""
        query = """
        mutation ObtainKrakenToken($input: ObtainJSONWebTokenInput!) {
            obtainKrakenToken(input: $input) {
                token
            }
        }
        """
        data = await self._graphql(
            query,
            {"input": {"email": self._email, "password": self._password}},
            auth=False,
        )
        token = data.get("obtainKrakenToken", {}).get("token")
        if not token:
            raise OctopusAnalyticsAuthError("No token returned")
        self._token = token
        return token

    async def get_account_number(self) -> str:
        """Get the account number for the authenticated user."""
        query = """
        query {
            viewer {
                accounts {
                    number
                }
            }
        }
        """
        data = await self._graphql(query)
        accounts = data.get("viewer", {}).get("accounts", [])
        if not accounts:
            raise OctopusAnalyticsApiError("No accounts found")
        self._account_number = accounts[0]["number"]
        return self._account_number

    async def get_meter_info(self) -> dict:
        """Get electricity meter and tariff info.

        Octopus Energy Germany exposes electricity data via the account property
        and MaLo model, not via the UK-style electricityAgreements field.
        """
        query = """
        query AccountDetails($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                property {
                    electricityMalos {
                        maloNumber
                        meters {
                            number
                            meloNumber
                            hasSmartMeterGateway
                        }
                        agreements {
                            isActive
                            product {
                                code
                            }
                            unitRateInformation {
                                ... on SimpleProductUnitRateInformation {
                                    latestGrossUnitRateCentsPerKwh
                                }
                            }
                        }
                    }
                }
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        account = data.get("account") or {}
        property_data = account.get("property") or {}
        malos = property_data.get("electricityMalos", [])
        if not malos:
            return {}

        malo = malos[0]
        meters = malo.get("meters", [])
        agreements = malo.get("agreements", [])
        active_agreement = next(
            (agreement for agreement in agreements if agreement.get("isActive")),
            agreements[0] if agreements else {},
        )
        unit_rate_info = active_agreement.get("unitRateInformation") or {}
        product = active_agreement.get("product") or {}

        return {
            "serial_number": meters[0].get("number") if meters else None,
            "melo_number": meters[0].get("meloNumber") if meters else None,
            "mpan": malo.get("maloNumber"),
            "unit_rate": unit_rate_info.get("latestGrossUnitRateCentsPerKwh"),
            "standing_charge": None,
            "product_code": product.get("code"),
        }

    async def get_consumption(
        self,
        start: date,
        end: date,
        frequency: str = "THIRTY_MIN_INTERVAL",
    ) -> list[dict]:
        """Get electricity consumption data between two dates."""
        query = """
        query ConsumptionData(
            $accountNumber: String!
            $startDate: Date!
            $endDate: Date!
            $frequency: ReadingFrequencyType!
        ) {
            account(accountNumber: $accountNumber) {
                property {
                    measurements(
                        startOn: $startDate
                        endOn: $endDate
                        timezone: "Europe/Berlin"
                        utilityFilters: {
                            electricityFilters: {
                                readingFrequencyType: $frequency
                                readingDirection: CONSUMPTION
                                readingQuality: COMBINED
                            }
                        }
                        first: 10000
                    ) {
                        edges {
                            node {
                                value
                                unit
                                readAt
                                ... on IntervalMeasurementType {
                                    startAt
                                    endAt
                                }
                            }
                        }
                    }
                }
            }
        }
        """
        data = await self._graphql(
            query,
            {
                "accountNumber": self._account_number,
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "frequency": frequency,
            },
        )
        account = data.get("account") or {}
        property_data = account.get("property") or {}
        measurements = property_data.get("measurements") or {}
        edges = measurements.get("edges", [])
        results = []
        for edge in edges:
            node = edge.get("node") or {}
            start_at = node.get("startAt") or node.get("readAt")
            if not start_at:
                continue

            value = node.get("value")
            unit = node.get("unit")
            if value is not None and unit in ("WATT_HOURS", "Wh"):
                value = float(value) / 1000
                unit = "KILOWATT_HOURS"

            results.append(
                {
                    "startDt": start_at,
                    "endDt": node.get("endAt") or start_at,
                    "value": value,
                    "unit": unit,
                }
            )
        return results

    async def get_account_balance(self) -> float:
        """Get current account balance in EUR."""
        query = """
        query AccountBalance($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                balance
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        balance = data.get("account", {}).get("balance", 0)
        return round(balance / 100, 2)  # API returns cents

    async def ensure_authenticated(self) -> None:
        """Ensure we have a valid token, re-authenticate if needed."""
        if not self._token:
            await self.authenticate()
        if not self._account_number:
            await self.get_account_number()
