"""Bikram Sambat conversion from one verified month-length table.

The table is ``hrm/data/bs_month_lengths.json`` (also imported by the frontend).
It covers BS 1975-01-01 through Chaitra 2083. Years 2084-2100 are refused:
nepali-datetime 1.0.8.5 and bikram-sambat 0.2.0 disagree on those month
lengths, and the official panchanga for them is not published yet. Returning
a date from either table would risk a wrong day.

Conversion is day-counting from the epoch BS 1975-01-01 = AD 1918-04-13.
There is no month-length formula.
"""

from __future__ import annotations

import datetime
import json
from functools import lru_cache
from pathlib import Path
from typing import List, NamedTuple, Optional, Sequence

_DATA_PATH = Path(__file__).resolve().parent / "data" / "bs_month_lengths.json"

MONTH_NAMES: Sequence[str] = (
    "Baisakh",
    "Jestha",
    "Ashadh",
    "Shrawan",
    "Bhadra",
    "Ashwin",
    "Kartik",
    "Mangsir",
    "Poush",
    "Magh",
    "Falgun",
    "Chaitra",
)

WEEKDAY_NAMES: Sequence[str] = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)

NEPALI_DIGITS = str.maketrans("0123456789", "०१२३४५६७८९")


class CalendarRangeError(ValueError):
    """A BS or AD date is outside the verified calendar, or is not a real day."""


class BSDate(NamedTuple):
    year: int
    month: int
    day: int

    @property
    def month_name(self) -> str:
        return MONTH_NAMES[self.month - 1]


class FormattedDate(NamedTuple):
    bs: str
    ad: str
    bs_date: BSDate
    ad_date: datetime.date


@lru_cache(maxsize=1)
def load_calendar() -> dict:
    with _DATA_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    data["epoch_ad"] = datetime.date.fromisoformat(data["epoch_ad"])
    data["months"] = {int(year): lengths for year, lengths in data["months"].items()}
    return data


def manual_year_lengths() -> dict[int, list[int]]:
    """Official month lengths entered by a Super Admin, after the verified window."""
    from django.db.utils import OperationalError, ProgrammingError

    try:
        from hrm.models import BSYearOverride
    except Exception:
        return {}
    try:
        rows = BSYearOverride.objects.all()
        return {int(row.year): [int(n) for n in row.month_lengths] for row in rows}
    except (OperationalError, ProgrammingError):
        return {}


def covered_max_year() -> int:
    """Last BS year the converter will accept. Manual years must form an unbroken chain."""
    data = load_calendar()
    extras = manual_year_lengths()
    year = int(data["max_year"])
    while (year + 1) in extras:
        year += 1
    return year


def supported_range() -> tuple[BSDate, BSDate]:
    data = load_calendar()
    last_year = covered_max_year()
    last_month_days = _year_lengths(last_year)[11]
    start = BSDate(*data["epoch_bs"])
    end = BSDate(last_year, 12, last_month_days)
    return start, end


def calendar_window(today: datetime.date | None = None) -> dict:
    """How close the supported window is to running out."""
    today = today or datetime.date.today()
    _start, end_bs = supported_range()
    end = bs_to_ad(end_bs.year, end_bs.month, end_bs.day)
    days_remaining = (end - today).days
    return {
        "end": end.isoformat(),
        "end_label_bs": format_bs(end_bs),
        "end_label_ad": format_ad(end),
        "days_remaining": days_remaining,
        "warn": days_remaining < 120,
        "verified_max_year": load_calendar()["max_year"],
        "covered_max_year": end_bs.year,
    }


def validate_manual_year(year: int, lengths: list, *, updating: bool = False) -> list[int]:
    """12 months, each 29-32 days, total 365 or 366, and the next year in sequence."""
    if not isinstance(lengths, (list, tuple)) or len(lengths) != 12:
        raise CalendarRangeError("Enter exactly 12 month lengths, Baisakh through Chaitra.")
    cleaned = []
    for index, raw in enumerate(lengths, start=1):
        try:
            days = int(raw)
        except (TypeError, ValueError):
            raise CalendarRangeError(f"{month_name(index)} must be a whole number of days.")
        if days < 29 or days > 32:
            raise CalendarRangeError(f"{month_name(index)} must be 29 to 32 days, got {days}.")
        cleaned.append(days)
    total = sum(cleaned)
    if total not in (365, 366):
        raise CalendarRangeError(f"A BS year must have 365 or 366 days, got {total}.")
    data = load_calendar()
    if year <= int(data["max_year"]):
        raise CalendarRangeError(
            f"BS {year} is already in the verified calendar. Only years after {data['max_year']} can be entered."
        )
    nxt = covered_max_year() + (0 if updating else 1)
    if updating:
        if year not in manual_year_lengths():
            raise CalendarRangeError(f"BS {year} has not been entered yet.")
    elif year != nxt:
        raise CalendarRangeError(
            f"Enter BS {covered_max_year() + 1} next. A manual year has to follow the last known year with no gap."
        )
    return cleaned


def days_in_bs_month(year: int, month: int) -> int:
    lengths = _year_lengths(year)
    if month < 1 or month > 12:
        raise CalendarRangeError(f"BS month must be 1-12, got {month}.")
    return lengths[month - 1]


def month_name(month: int) -> str:
    if month < 1 or month > 12:
        raise CalendarRangeError(f"BS month must be 1-12, got {month}.")
    return MONTH_NAMES[month - 1]


def to_nepali_digits(value: object) -> str:
    return str(value).translate(NEPALI_DIGITS)


def weekday_name(ad: datetime.date) -> str:
    if not isinstance(ad, datetime.date):
        raise CalendarRangeError("Weekday lookup needs a Gregorian date.")
    return WEEKDAY_NAMES[ad.weekday()]


def bs_month_boundaries(year: int, month: int) -> tuple[datetime.date, datetime.date]:
    """AD start and end dates of one BS calendar month."""
    length = days_in_bs_month(year, month)
    return bs_to_ad(year, month, 1), bs_to_ad(year, month, length)


def ad_to_bs(ad: datetime.date) -> BSDate:
    if isinstance(ad, datetime.datetime):
        ad = ad.date()
    if not isinstance(ad, datetime.date):
        raise CalendarRangeError(f"Expected a Gregorian date, got {ad!r}.")
    data = load_calendar()
    epoch: datetime.date = data["epoch_ad"]
    if ad < epoch:
        raise CalendarRangeError(
            f"{ad.isoformat()} is before the verified calendar, which starts on {epoch.isoformat()} (BS 1975-01-01)."
        )
    remaining = (ad - epoch).days
    last_year = covered_max_year()
    for year in range(data["min_year"], last_year + 1):
        lengths = _year_lengths(year)
        year_days = sum(lengths)
        if remaining < year_days:
            for month, length in enumerate(lengths, start=1):
                if remaining < length:
                    return BSDate(year, month, remaining + 1)
                remaining -= length
        remaining -= year_days
    last = bs_to_ad(last_year, 12, _year_lengths(last_year)[11])
    raise CalendarRangeError(
        f"{ad.isoformat()} is after the verified calendar, which ends on {last.isoformat()} (BS {data['max_year']}-12-{data['months'][data['max_year']][11]})."
    )


def bs_to_ad(year: int, month: int, day: int) -> datetime.date:
    lengths = _year_lengths(year)
    if month < 1 or month > 12:
        raise CalendarRangeError(f"BS month must be 1-12, got {month}.")
    length = lengths[month - 1]
    if day < 1 or day > length:
        raise CalendarRangeError(
            f"BS {year}-{month:02d}-{day:02d} is not a real day. {month_name(month)} {year} has {length} days."
        )
    data = load_calendar()
    offset = 0
    for y in range(data["min_year"], year):
        offset += sum(data["months"][y])
    offset += sum(lengths[: month - 1])
    offset += day - 1
    return data["epoch_ad"] + datetime.timedelta(days=offset)


def format_bs(bs: BSDate, *, nepali_digits: bool = False) -> str:
    text = f"{bs.day} {bs.month_name} {bs.year}"
    return to_nepali_digits(text) if nepali_digits else text


def format_ad(ad: datetime.date) -> str:
    return f"{ad.strftime('%B')} {ad.day}, {ad.year}"


def format_pair(ad: datetime.date, *, nepali_digits: bool = False) -> FormattedDate:
    bs = ad_to_bs(ad)
    return FormattedDate(format_bs(bs, nepali_digits=nepali_digits), format_ad(ad), bs, ad)


def _year_lengths(year: int) -> List[int]:
    data = load_calendar()
    if data["min_year"] <= year <= data["max_year"]:
        return data["months"][year]
    extras = manual_year_lengths()
    if year in extras and data["max_year"] < year <= covered_max_year():
        return extras[year]
    raise CalendarRangeError(
        f"BS {year} is outside the verified calendar ({data['min_year']}-{covered_max_year()}). "
        "Later years are not converted until a Super Admin enters the official month lengths."
    )
