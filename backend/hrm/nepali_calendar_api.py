"""Fetch Bikram Sambat month lengths from free public calendar data.

Primary source: community month-length dataset (sonill/nepali-dates),
BS 2000–2100, published as open JSON with no API key.

Always review lengths before saving — community tables can disagree with
the official Nepal Rashtriya Panchang.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from hrm.calendar import MONTH_NAMES, CalendarRangeError

COMMUNITY_DATA_URL = (
    "https://raw.githubusercontent.com/sonill/nepali-dates/main/data/calendar-data.json"
)
SOURCE_LABEL = "Free Nepali calendar dataset (sonill/nepali-dates)"
# Bound how long a process keeps the remote dataset before re-fetching.
DATASET_CACHE_TTL_SECONDS = 6 * 60 * 60

_dataset_cache: dict[str, list[int]] | None = None
_dataset_cache_loaded_at = 0.0


class NepaliCalendarApiError(RuntimeError):
    """External calendar provider failed or returned unusable data."""


def clear_community_dataset_cache() -> None:
    """Drop the in-memory dataset so the next fetch reloads from the network."""
    global _dataset_cache, _dataset_cache_loaded_at
    _dataset_cache = None
    _dataset_cache_loaded_at = 0.0


def fetch_bs_year_month_lengths(year: int) -> dict[str, Any]:
    """Return validated month lengths for one BS year.

    Shape: ``{year, month_lengths, source, source_label, warning}``.
    """
    year = int(year)
    if year < 2000 or year > 2100:
        raise CalendarRangeError(f"BS {year} is outside the free dataset range (2000–2100).")

    lengths = _from_community_dataset(year)
    return {
        "year": year,
        "month_lengths": lengths,
        "source": "community_dataset",
        "source_label": SOURCE_LABEL,
        "warning": (
            "Review these lengths against the official Nepal Rashtriya Panchang "
            "before saving. Community datasets can differ for future years."
        ),
    }


def _as_whole_day_count(raw: Any, *, label: str) -> int:
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        raise NepaliCalendarApiError(f"{label} must be a whole number of days.")
    if isinstance(raw, float) and not raw.is_integer():
        raise NepaliCalendarApiError(f"{label} must be a whole number of days, got {raw}.")
    if isinstance(raw, str):
        text = raw.strip()
        if not text or any(ch in text for ch in ".,"):
            raise NepaliCalendarApiError(f"{label} must be a whole number of days, got {raw!r}.")
        try:
            value = int(text)
        except ValueError as exc:
            raise NepaliCalendarApiError(f"{label} must be a whole number of days, got {raw!r}.") from exc
    else:
        value = int(raw)
    return value


def _validate_lengths(year: int, lengths: list[int]) -> list[int]:
    if len(lengths) != 12:
        raise NepaliCalendarApiError(f"Expected 12 month lengths for BS {year}, got {len(lengths)}.")
    cleaned: list[int] = []
    for index, days in enumerate(lengths, start=1):
        label = f"{MONTH_NAMES[index - 1]} {year}"
        value = _as_whole_day_count(days, label=label)
        if value < 29 or value > 32:
            raise NepaliCalendarApiError(f"{label} has {value} days; expected 29–32.")
        cleaned.append(value)
    total = sum(cleaned)
    if total not in (365, 366):
        raise NepaliCalendarApiError(f"BS {year} totals {total} days; expected 365 or 366.")
    return cleaned


def _load_community_dataset(*, force: bool = False) -> dict[str, list[int]]:
    global _dataset_cache, _dataset_cache_loaded_at
    now = time.monotonic()
    if (
        not force
        and _dataset_cache is not None
        and (now - _dataset_cache_loaded_at) < DATASET_CACHE_TTL_SECONDS
    ):
        return _dataset_cache

    payload = _http_json(COMMUNITY_DATA_URL)
    if not isinstance(payload, dict):
        raise NepaliCalendarApiError("Community calendar dataset was not a JSON object.")
    months: dict[str, list[int]] = {}
    for key, value in payload.items():
        if not str(key).isdigit():
            continue
        if not isinstance(value, list) or len(value) != 12:
            continue
        try:
            months[str(key)] = [
                _as_whole_day_count(n, label=f"BS {key} month {index}")
                for index, n in enumerate(value, start=1)
            ]
        except NepaliCalendarApiError:
            continue
    if not months:
        raise NepaliCalendarApiError("Community calendar dataset contained no year rows.")
    _dataset_cache = months
    _dataset_cache_loaded_at = now
    return months


def _from_community_dataset(year: int) -> list[int]:
    months = _load_community_dataset()
    row = months.get(str(year))
    if not row:
        raise NepaliCalendarApiError(f"Free dataset has no month lengths for BS {year}.")
    return _validate_lengths(year, row)


def _http_json(url: str, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Vehicle-Template-HR/1.0",
            **(headers or {}),
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise NepaliCalendarApiError(f"Calendar API HTTP {exc.code}: {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise NepaliCalendarApiError(f"Calendar API unreachable: {exc.reason}") from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise NepaliCalendarApiError("Calendar API returned non-JSON data.") from exc
