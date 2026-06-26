"""Octopus Energy Germany GraphQL API client."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
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
        """Get electricity meter info."""
        query = """
        query AccountDetails($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                electricityAgreements(active: true) {
                    meterPoint {
                        meters(includeInactive: false) {
                            serialNumber
                        }
                        mpan
                    }
                    tariff {
                        ... on SimpleProductTariff {
                            unitRate
                            standingCharge
                            productCode
                        }
                    }
                }
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        agreements = data.get("account", {}).get("electricityAgreements", [])
        if not agreements:
            return {}
        agreement = agreements[0]
        meter_point = agreement.get("meterPoint", {})
        meters = meter_point.get("meters", [])
        tariff = agreement.get("tariff", {})
        return {
            "serial_number": meters[0]["serialNumber"] if meters else None,
            "mpan": meter_point.get("mpan"),
            "unit_rate": tariff.get("unitRate"),
            "standing_charge": tariff.get("standingCharge"),
            "product_code": tariff.get("productCode"),
        }

    async def get_consumption(self, start: date, end: date) -> list[dict]:
        """Get half-hourly consumption data between two dates."""
        query = """
        query ConsumptionData(
            $accountNumber: String!
            $startDate: Date!
            $endDate: Date!
        ) {
            account(accountNumber: $accountNumber) {
                electricityAgreements(active: false) {
                    meterPoint {
                        consumption(
                            startDate: $startDate
                            endDate: $endDate
                            grouping: HALF_HOUR
                        ) {
                            startDt
                            endDt
                            value
                            unit
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
            },
        )
        results = []
        agreements = data.get("account", {}).get("electricityAgreements", [])
        for agreement in agreements:
            consumption = agreement.get("meterPoint", {}).get("consumption", [])
            results.extend(consumption)
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
