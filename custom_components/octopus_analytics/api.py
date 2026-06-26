"""Octopus Energy Germany GraphQL API client."""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)

API_URL = "https://api.octopus.energy/v1/graphql/"


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
        """Get electricity meter and tariff info."""
        query = """
        query AccountDetails($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                electricityAgreements {
                    meterPoint {
                        meters {
                            serialNumber
                        }
                        mpan
                    }
                    tariff {
                        ... on StandardTariff {
                            unitRate
                            productCode
                        }
                        ... on DayNightTariff {
                            dayRate
                            productCode
                        }
                        ... on ThreeRateTariff {
                            dayRate
                            productCode
                        }
                        ... on HalfHourlyTariff {
                            productCode
                        }
                    }
                }
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        account = data.get("account") or {}
        agreements = account.get("electricityAgreements") or []
        agreement = agreements[0] if agreements else {}
        meter_point = agreement.get("meterPoint") or {}
        meters = meter_point.get("meters") or []
        tariff = agreement.get("tariff") or {}

        return {
            "serial_number": meters[0].get("serialNumber") if meters else None,
            "melo_number": None,
            "mpan": meter_point.get("mpan"),
            "unit_rate": tariff.get("unitRate") or tariff.get("dayRate"),
            "standing_charge": None,
            "product_code": tariff.get("productCode"),
        }

    async def get_consumption(
        self,
        start: date,
        end: date,
        frequency: str = "THIRTY_MIN_INTERVAL",
    ) -> list[dict]:
        """Get electricity consumption data between two dates."""
        grouping = {
            "DAY_INTERVAL": "DAY",
            "THIRTY_MIN_INTERVAL": "HALF_HOUR",
            "HOUR_INTERVAL": "HOUR",
        }.get(frequency, "HALF_HOUR")
        start_at = datetime.combine(start, time.min).isoformat()

        query = """
        query ConsumptionData(
            $accountNumber: String!
            $startAt: DateTime!
            $grouping: ConsumptionGroupings!
            $after: String
        ) {
            account(accountNumber: $accountNumber) {
                electricityAgreements {
                    meterPoint {
                        meters {
                            consumption(
                                startAt: $startAt
                                grouping: $grouping
                                timezone: "Europe/Berlin"
                                first: 100
                                after: $after
                            ) {
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                                edges {
                                    node {
                                        startAt
                                        endAt
                                        value
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        """

        results = []
        after: str | None = None
        for _ in range(50):
            data = await self._graphql(
                query,
                {
                    "accountNumber": self._account_number,
                    "startAt": start_at,
                    "grouping": grouping,
                    "after": after,
                },
            )
            has_next_page = False
            next_after = None
            account = data.get("account") or {}
            agreements = account.get("electricityAgreements") or []
            for agreement in agreements:
                meter_point = agreement.get("meterPoint") or {}
                for meter in meter_point.get("meters") or []:
                    consumption = meter.get("consumption") or {}
                    page_info = consumption.get("pageInfo") or {}
                    has_next_page = bool(page_info.get("hasNextPage"))
                    next_after = page_info.get("endCursor")

                    for edge in consumption.get("edges", []):
                        reading = edge.get("node") or {}
                        start_dt = reading.get("startAt")
                        if not start_dt:
                            continue
                        results.append(
                            {
                                "startDt": start_dt,
                                "endDt": reading.get("endAt") or start_dt,
                                "value": reading.get("value"),
                                "unit": "kWh",
                            }
                        )

            if not has_next_page or not next_after:
                break
            after = next_after

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
