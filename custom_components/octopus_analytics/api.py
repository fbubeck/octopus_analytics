"""Octopus Energy Germany GraphQL API client."""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
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
        """Get electricity meter and product info.

        Avoid account.property and supplyPoint.devices here because some Octopus
        Germany accounts return an internal Kraken error for those fields. The
        market supply agreement path is enough for stable product metadata.
        """
        query = """
        query AccountDetails($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                marketSupplyAgreements(active: true, first: 3) {
                    edges {
                        node {
                            isActive
                            product {
                                code
                            }
                            supplyPoint {
                                marketName
                                externalIdentifier
                            }
                        }
                    }
                }
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        account = data.get("account") or {}
        agreements = (account.get("marketSupplyAgreements") or {}).get("edges", [])
        electricity_agreement = next(
            (
                edge.get("node") or {}
                for edge in agreements
                if (edge.get("node") or {})
                .get("supplyPoint", {})
                .get("marketName")
                == "DEU_ELECTRICITY"
            ),
            (agreements[0].get("node") or {}) if agreements else {},
        )
        supply_point = electricity_agreement.get("supplyPoint") or {}
        product = electricity_agreement.get("product") or {}

        return {
            "serial_number": None,
            "melo_number": None,
            "mpan": supply_point.get("externalIdentifier"),
            "unit_rate": None,
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
        granularity = {
            "DAY_INTERVAL": "DAY",
            "THIRTY_MIN_INTERVAL": "THIRTY_MIN",
            "HOUR_INTERVAL": "HOUR",
        }.get(frequency, "THIRTY_MIN")
        start_at = datetime.combine(start, time.min).isoformat()
        end_at = datetime.combine(end + timedelta(days=1), time.min).isoformat()

        query = """
        query ConsumptionData(
            $accountNumber: String!
            $startAt: DateTime!
            $endAt: DateTime!
            $granularity: TimeGranularities!
            $after: String
        ) {
            account(accountNumber: $accountNumber) {
                marketSupplyAgreements(active: true, first: 3) {
                    edges {
                        node {
                            supplyPoint {
                                marketName
                                readings(
                                    startAt: $startAt
                                    endAt: $endAt
                                    readingType: INTERVAL
                                    timeGranularity: $granularity
                                    timezone: "Europe/Berlin"
                                    units: [KILOWATT_HOURS]
                                ) {
                                    importReadings(first: 100, after: $after) {
                                        pageInfo {
                                            hasNextPage
                                            endCursor
                                        }
                                        edges {
                                            node {
                                                value
                                                units
                                                intervalStart
                                                intervalEnd
                                            }
                                        }
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
                    "endAt": end_at,
                    "granularity": granularity,
                    "after": after,
                },
            )
            account = data.get("account") or {}
            agreement_edges = (account.get("marketSupplyAgreements") or {}).get(
                "edges", []
            )
            next_after = None
            has_next_page = False
            found_electricity = False

            for agreement_edge in agreement_edges:
                node = agreement_edge.get("node") or {}
                supply_point = node.get("supplyPoint") or {}
                if supply_point.get("marketName") != "DEU_ELECTRICITY":
                    continue

                found_electricity = True
                readings = supply_point.get("readings") or {}
                import_readings = readings.get("importReadings") or {}
                page_info = import_readings.get("pageInfo") or {}
                has_next_page = bool(page_info.get("hasNextPage"))
                next_after = page_info.get("endCursor")

                for reading_edge in import_readings.get("edges", []):
                    reading = reading_edge.get("node") or {}
                    start_dt = reading.get("intervalStart")
                    if not start_dt:
                        continue
                    results.append(
                        {
                            "startDt": start_dt,
                            "endDt": reading.get("intervalEnd") or start_dt,
                            "value": reading.get("value"),
                            "unit": reading.get("units"),
                        }
                    )

            if not found_electricity or not has_next_page or not next_after:
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
