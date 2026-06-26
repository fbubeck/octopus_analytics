"""Data aggregation and analytics for Octopus consumption data."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any


def aggregate_to_hourly(consumption: list[dict]) -> list[dict]:
    """Aggregate half-hourly slots to hourly values."""
    hourly: dict[str, float] = defaultdict(float)
    for slot in consumption:
        if not slot.get("value"):
            continue
        dt_str = slot["startDt"]
        # Normalize to hour
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        hour_key = dt.strftime("%Y-%m-%dT%H:00:00")
        hourly[hour_key] += float(slot["value"])

    return [
        {"start": k, "kwh": round(v, 4)}
        for k, v in sorted(hourly.items())
    ]


def aggregate_to_daily(consumption: list[dict]) -> list[dict]:
    """Aggregate half-hourly slots to daily values."""
    daily: dict[str, float] = defaultdict(float)
    for slot in consumption:
        if not slot.get("value"):
            continue
        dt_str = slot["startDt"]
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        day_key = dt.strftime("%Y-%m-%d")
        daily[day_key] += float(slot["value"])

    return [
        {"date": k, "kwh": round(v, 4)}
        for k, v in sorted(daily.items())
    ]


def aggregate_to_monthly(daily_data: list[dict]) -> dict[str, Any]:
    """Compute monthly aggregates from daily data."""
    monthly: dict[str, list[dict]] = defaultdict(list)
    for day in daily_data:
        month_key = day["date"][:7]  # YYYY-MM
        monthly[month_key].append(day)

    result = {}
    for month_key, days in sorted(monthly.items()):
        total = sum(d["kwh"] for d in days)
        if not days:
            continue
        peak = max(days, key=lambda d: d["kwh"])
        low = min(days, key=lambda d: d["kwh"])
        result[month_key] = {
            "total_kwh": round(total, 3),
            "avg_day_kwh": round(total / len(days), 3),
            "days": len(days),
            "peak_kwh": round(peak["kwh"], 3),
            "peak_date": peak["date"],
            "low_kwh": round(low["kwh"], 3),
            "low_date": low["date"],
        }
    return result


def compute_ytd(daily_data: list[dict], year: int | None = None) -> dict[str, Any]:
    """Compute year-to-date statistics."""
    if year is None:
        year = date.today().year

    ytd_days = [d for d in daily_data if d["date"].startswith(str(year))]
    if not ytd_days:
        return {"kwh": 0.0, "days": 0, "avg_day_kwh": 0.0}

    total = sum(d["kwh"] for d in ytd_days)
    return {
        "kwh": round(total, 3),
        "days": len(ytd_days),
        "avg_day_kwh": round(total / len(ytd_days), 3),
    }


def get_last_n_days(daily_data: list[dict], n: int = 30) -> list[dict]:
    """Return the last N days of daily data."""
    sorted_data = sorted(daily_data, key=lambda d: d["date"], reverse=True)
    return list(reversed(sorted_data[:n]))


def compute_streak(daily_data: list[dict], threshold: float) -> int:
    """Count consecutive days below a consumption threshold."""
    sorted_days = sorted(daily_data, key=lambda d: d["date"], reverse=True)
    streak = 0
    for day in sorted_days:
        if day["kwh"] <= threshold:
            streak += 1
        else:
            break
    return streak
