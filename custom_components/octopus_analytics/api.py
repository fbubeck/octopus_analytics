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
        self._property_id: str | None = None

    async def _graphql(
        self,
        query: str,
        variables: dict | None = None,
        auth: bool = True,
        url: str = API_URL,
    ) -> dict:
        """Execute a GraphQL query."""
        headers = {"Content-Type": "application/json"}
        if auth and self._token:
            headers["Authorization"] = self._token

        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables

        async with self._session.post(url, json=payload, headers=headers) as resp:
            if resp.status == 401:
                raise OctopusAnalyticsAuthError("Authentication failed")
            data = await resp.json()
            if "errors" in data:
                errors = data["errors"]
                if any(
                    (err.get("extensions") or {}).get("errorType") == "AUTHORIZATION"
                    or (err.get("extensions") or {}).get("errorCode")
                    in ("KT-CT-1112", "KT-CT-1161")
                    for err in errors
                ):
                    raise OctopusAnalyticsAuthError(f"GraphQL auth error: {errors}")
                raise OctopusAnalyticsApiError(f"GraphQL error: {errors}")
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
            url=API_URL,
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
        data = await self._graphql(query, url=API_URL)
        accounts = data.get("viewer", {}).get("accounts", [])
        if not accounts:
            raise OctopusAnalyticsApiError("No accounts found")
        self._account_number = accounts[0]["number"]
        return self._account_number

    async def get_meter_info(self) -> dict:
        """Get electricity meter and tariff info from the Octopus Germany schema."""
        query = """
        query AccountDetails($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                allProperties {
                    id
                    electricityMalos {
                        maloNumber
                        meloNumber
                        meter {
                            id
                            number
                            meterType
                            shouldReceiveSmartMeterData
                        }
                        agreements {
                            product {
                                code
                            }
                            unitRateInformation {
                                ... on SimpleProductUnitRateInformation {
                                    latestGrossUnitRateCentsPerKwh
                                }
                                ... on TimeOfUseProductUnitRateInformation {
                                    rates {
                                        latestGrossUnitRateCentsPerKwh
                                    }
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
        properties = account.get("allProperties") or []
        property_data = next(
            (prop for prop in properties if prop.get("electricityMalos")),
            properties[0] if properties else {},
        )
        self._property_id = property_data.get("id") or self._property_id

        malos = property_data.get("electricityMalos") or []
        malo = malos[0] if malos else {}
        meter = malo.get("meter") or {}
        agreements = malo.get("agreements") or []
        agreement = agreements[0] if agreements else {}
        unit_rate_info = agreement.get("unitRateInformation") or {}
        rates = unit_rate_info.get("rates") or []
        product = agreement.get("product") or {}

        return {
            "serial_number": meter.get("number"),
            "melo_number": malo.get("meloNumber"),
            "mpan": malo.get("maloNumber"),
            "unit_rate": unit_rate_info.get("latestGrossUnitRateCentsPerKwh")
            or (rates[0].get("latestGrossUnitRateCentsPerKwh") if rates else None),
            "standing_charge": None,
            "product_code": product.get("code"),
        }

    async def get_consumption(
        self,
        start: date,
        end: date,
        frequency: str = "THIRTY_MIN_INTERVAL",
    ) -> list[dict]:
        """Get electricity consumption data from property measurements."""
        if not self._property_id:
            await self.get_meter_info()
        if not self._property_id:
            return []

        reading_frequency = {
            "DAY_INTERVAL": "DAY_INTERVAL",
            "THIRTY_MIN_INTERVAL": "RAW_INTERVAL",
            "HOUR_INTERVAL": "HOUR_INTERVAL",
        }.get(frequency, "RAW_INTERVAL")

        query = """
        query ConsumptionData(
            $accountNumber: String!
            $propertyId: ID!
            $startDate: Date!
            $endDate: Date!
            $frequency: ReadingFrequencyType!
            $after: String
        ) {
            account(accountNumber: $accountNumber) {
                property(id: $propertyId) {
                    measurements(
                        utilityFilters: {
                            electricityFilters: {
                                readingFrequencyType: $frequency
                                readingQuality: COMBINED
                            }
                        }
                        startOn: $startDate
                        endOn: $endDate
                        first: 100
                        after: $after
                    ) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        edges {
                            node {
                                ... on IntervalMeasurementType {
                                    startAt
                                    endAt
                                    unit
                                    value
                                }
                                ... on MeasurementType {
                                    readAt
                                    unit
                                    value
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
                    "propertyId": self._property_id,
                    "startDate": start.isoformat(),
                    "endDate": end.isoformat(),
                    "frequency": reading_frequency,
                    "after": after,
                },
            )
            measurements = (
                ((data.get("account") or {}).get("property") or {}).get("measurements")
                or {}
            )
            page_info = measurements.get("pageInfo") or {}
            for edge in measurements.get("edges", []):
                reading = edge.get("node") or {}
                start_dt = reading.get("startAt") or reading.get("readAt")
                if not start_dt:
                    continue
                results.append(
                    {
                        "startDt": start_dt,
                        "endDt": reading.get("endAt") or start_dt,
                        "value": reading.get("value"),
                        "unit": reading.get("unit"),
                    }
                )

            if not page_info.get("hasNextPage") or not page_info.get("endCursor"):
                break
            after = page_info.get("endCursor")

        return results

    async def get_account_balance(self) -> float:
        """Get current account balance in EUR."""
        query = """
        query AccountBalance($accountNumber: String!) {
            account(accountNumber: $accountNumber) {
                balance
                ledgers {
                    balance
                    ledgerType
                }
            }
        }
        """
        data = await self._graphql(query, {"accountNumber": self._account_number})
        account = data.get("account") or {}
        ledgers = account.get("ledgers") or []

        electricity_ledger = next(
            (
                ledger
                for ledger in ledgers
                if ledger.get("ledgerType") == "ELECTRICITY_LEDGER"
            ),
            None,
        )
        if electricity_ledger is not None:
            return round((electricity_ledger.get("balance") or 0) / 100, 2)

        balance = account.get("balance", 0)
        return round(balance / 100, 2)  # API returns cents

    async def ensure_authenticated(self) -> None:
        """Ensure we have a valid token, re-authenticate if needed."""
        if not self._token:
            await self.authenticate()
        if not self._account_number:
            await self.get_account_number()
