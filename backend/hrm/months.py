"""HR month boundaries from the BS calendar and the policy in force on a date.

A policy version applies from its ``effective_from`` AD date onward, until the
next version. Dates before that keep the previous version, so editing the
settings never rewrites an earlier HR month.

Custom start day rule (tested): the HR month labeled as BS month M starts on
day ``min(start_day, days_in_that_month)``. It ends the day before the next
HR month starts. Start day 1 is exactly the BS calendar month. A start day
past the end of a short month clamps to that month's last day, and the
following period still begins on its own clamped day, so the timeline has
no gaps and no overlaps.
"""

from __future__ import annotations

import datetime
from typing import List, NamedTuple, Optional

from hrm.calendar import (
    BSDate,
    CalendarRangeError,
    ad_to_bs,
    bs_to_ad,
    days_in_bs_month,
    format_ad,
    format_bs,
    month_name,
)


class HRMonth(NamedTuple):
    bs_year: int
    bs_month: int
    month_name: str
    start: datetime.date
    end: datetime.date

    def as_dict(self) -> dict:
        return {
            "bs_year": self.bs_year,
            "bs_month": self.bs_month,
            "month_name": self.month_name,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "start_label": _pair(self.start),
            "end_label": _pair(self.end),
            "label": f"{self.month_name} {self.bs_year}",
        }


def _pair(ad: datetime.date) -> dict:
    bs = ad_to_bs(ad)
    return {"bs": format_bs(bs), "ad": format_ad(ad)}


def period_start(year: int, month: int, start_day: int) -> datetime.date:
    if start_day < 1 or start_day > 31:
        raise CalendarRangeError(f"HR month start day must be 1-31, got {start_day}.")
    day = min(start_day, days_in_bs_month(year, month))
    return bs_to_ad(year, month, day)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = (year * 12 + (month - 1)) + delta
    return index // 12, index % 12 + 1


def hr_month_span(year: int, month: int, start_day: int) -> HRMonth:
    start = period_start(year, month, start_day)
    next_year, next_month = _shift_month(year, month, 1)
    try:
        next_start = period_start(next_year, next_month, start_day)
    except CalendarRangeError:
        # The next BS month is outside the verified table. End on the last
        # verified day of this calendar month instead of inventing a date.
        next_start = bs_to_ad(year, month, days_in_bs_month(year, month)) + datetime.timedelta(days=1)
    end = next_start - datetime.timedelta(days=1)
    return HRMonth(year, month, month_name(month), start, end)


def get_hr_month_for_date(ad: datetime.date, policy=None) -> HRMonth:
    """HR month containing ``ad``, using the policy version in force that day."""
    if isinstance(ad, datetime.datetime):
        ad = ad.date()
    if policy is None:
        policy = policy_for_date(ad)
    start_day = 1 if policy.month_mode == policy.MonthMode.BS_MONTH else policy.custom_start_day
    bs = ad_to_bs(ad)
    # A custom period can start mid-month, so the date may belong to the
    # previous labeled month (for example Magh 20 when the next period
    # starts on Falgun 15).
    for delta in (0, -1, 1, -2, 2):
        year, month = _shift_month(bs.year, bs.month, delta)
        try:
            span = hr_month_span(year, month, start_day)
        except CalendarRangeError:
            continue
        if span.start <= ad <= span.end:
            return span
    raise CalendarRangeError(f"No HR month covers {ad.isoformat()} under the current calendar settings.")


def list_hr_months(bs_year: int, policy=None) -> List[HRMonth]:
    """The twelve HR months labeled with ``bs_year``, under the policy in force at Baisakh of that year."""
    if policy is None:
        anchor = bs_to_ad(bs_year, 1, 1)
        policy = policy_for_date(anchor)
    start_day = 1 if policy.month_mode == policy.MonthMode.BS_MONTH else policy.custom_start_day
    return [hr_month_span(bs_year, month, start_day) for month in range(1, 13)]


def policy_for_date(ad: datetime.date):
    from hrm.models import HRCalendarPolicy

    policy = (
        HRCalendarPolicy.objects.filter(effective_from__lte=ad).order_by("-effective_from", "-id").first()
    )
    if policy is None:
        raise CalendarRangeError(
            f"No HR calendar settings are in force on {ad.isoformat()}. Create a settings version first."
        )
    return policy


def add_policy_version(*, effective_bs_year: int, effective_bs_month: int, today: Optional[datetime.date] = None, **fields):
    """Create an immutable settings version starting at an HR month boundary.

    ``effective_from`` is the start of that HR month under the NEW rules.
    It must be today or later, so days already lived stay on the old version.
    """
    from hrm.models import HRCalendarPolicy

    today = today or datetime.date.today()
    mode = fields.get("month_mode", HRCalendarPolicy.MonthMode.BS_MONTH)
    start_day = 1 if mode == HRCalendarPolicy.MonthMode.BS_MONTH else int(fields.get("custom_start_day") or 1)
    calendar_start = period_start(effective_bs_year, effective_bs_month, 1)
    if calendar_start < today:
        raise CalendarRangeError(
            f"{month_name(effective_bs_month)} {effective_bs_year} already started on {calendar_start.isoformat()}. "
            "Choose an HR month that has not started, so earlier months stay unchanged."
        )
    start = period_start(effective_bs_year, effective_bs_month, start_day)
    if start < today:
        raise CalendarRangeError(
            f"{month_name(effective_bs_month)} {effective_bs_year} already started on {start.isoformat()}. "
            "Choose an HR month that has not started, so earlier months stay unchanged."
        )
    latest = HRCalendarPolicy.objects.order_by("-effective_from", "-id").first()
    if latest is not None and start < latest.effective_from:
        raise CalendarRangeError(
            f"A settings version already starts on {latest.effective_from.isoformat()}. "
            "A new version must start on that date or later."
        )
    return HRCalendarPolicy.objects.create(effective_from=start, **fields)
