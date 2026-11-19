"""Bikram Sambat engine, HR month versions, settings permissions, and BS import."""

import datetime
import io
from pathlib import Path

import openpyxl
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, UserProfile
from hrm.calendar import (
    CalendarRangeError,
    ad_to_bs,
    bs_month_boundaries,
    bs_to_ad,
    days_in_bs_month,
    format_ad,
    format_bs,
    format_pair,
    to_nepali_digits,
    weekday_name,
)
from hrm.models import HRCalendarPolicy
from hrm.months import (
    add_policy_version,
    get_hr_month_for_date,
    hr_month_span,
    list_hr_months,
    period_start,
)
from inventory.services.historical_import import execute_dry_run, parse_ad_date

User = get_user_model()

# Pairs taken from nepali-datetime 1.0.8.5 (calendar_bs.csv). The tests do not
# import that library. Month lengths for these years also match bikram-sambat 0.2.0.
REFERENCE_DATES = [
    (1975, 1, 1, "1918-04-13"),
    (1975, 1, 31, "1918-05-13"),
    (1975, 2, 1, "1918-05-14"),
    (1975, 12, 30, "1919-04-12"),
    (2000, 1, 1, "1943-04-14"),
    (2000, 9, 17, "1944-01-01"),
    (2040, 1, 1, "1983-04-14"),
    (2060, 6, 15, "2003-10-02"),
    (2070, 1, 1, "2013-04-14"),
    (2070, 12, 30, "2014-04-13"),
    (2072, 2, 32, "2015-06-15"),
    (2074, 8, 1, "2017-11-17"),
    (2078, 8, 15, "2021-12-01"),
    (2079, 1, 1, "2022-04-14"),
    (2079, 6, 15, "2022-10-01"),
    (2080, 1, 1, "2023-04-14"),
    (2080, 2, 32, "2023-06-15"),
    (2080, 3, 1, "2023-06-16"),
    (2081, 1, 1, "2024-04-13"),
    (2081, 1, 31, "2024-05-13"),
    (2081, 9, 29, "2025-01-13"),
    (2081, 10, 1, "2025-01-14"),
    (2081, 10, 15, "2025-01-28"),
    (2082, 1, 1, "2025-04-14"),
    (2082, 4, 1, "2025-07-17"),
    (2082, 12, 30, "2026-04-13"),
    (2083, 1, 1, "2026-04-14"),
    (2083, 1, 31, "2026-05-14"),
    (2083, 6, 1, "2026-09-17"),
    (2083, 9, 1, "2026-12-16"),
    (2083, 10, 1, "2027-01-15"),
    (2083, 10, 15, "2027-01-29"),
    (2083, 11, 1, "2027-02-13"),
    (2083, 12, 1, "2027-03-15"),
]


class CalendarEngineTests(TestCase):
    def test_reference_dates_match_nepali_datetime(self):
        self.assertGreaterEqual(len(REFERENCE_DATES), 30)
        for year, month, day, iso in REFERENCE_DATES:
            ad = datetime.date.fromisoformat(iso)
            self.assertEqual(bs_to_ad(year, month, day), ad, f"BS {year}-{month}-{day}")
            self.assertEqual(ad_to_bs(ad), (year, month, day))

    def test_month_length_boundaries(self):
        self.assertEqual(days_in_bs_month(2080, 2), 32)
        self.assertEqual(bs_to_ad(2080, 2, 32), datetime.date(2023, 6, 15))
        self.assertEqual(bs_to_ad(2080, 3, 1), datetime.date(2023, 6, 16))
        start, end = bs_month_boundaries(2080, 2)
        self.assertEqual(end, datetime.date(2023, 6, 15))
        self.assertEqual(start, bs_to_ad(2080, 2, 1))

        self.assertEqual(days_in_bs_month(2081, 9), 29)
        self.assertEqual(bs_to_ad(2081, 9, 29), datetime.date(2025, 1, 13))
        self.assertEqual(bs_to_ad(2081, 10, 1), datetime.date(2025, 1, 14))

    def test_year_boundary_chaitra_to_baisakh(self):
        self.assertEqual(bs_to_ad(2082, 12, 30), datetime.date(2026, 4, 13))
        self.assertEqual(ad_to_bs(datetime.date(2026, 4, 13)).month_name, "Chaitra")
        self.assertEqual(bs_to_ad(2083, 1, 1), datetime.date(2026, 4, 14))
        self.assertEqual(ad_to_bs(datetime.date(2026, 4, 14)).month_name, "Baisakh")

    def test_round_trip_ten_years(self):
        ad = bs_to_ad(2074, 1, 1)
        end = bs_to_ad(2083, 12, days_in_bs_month(2083, 12))
        previous = None
        count = 0
        while ad <= end:
            bs = ad_to_bs(ad)
            self.assertEqual(bs_to_ad(bs.year, bs.month, bs.day), ad)
            if previous is not None:
                if previous.day < days_in_bs_month(previous.year, previous.month):
                    self.assertEqual((bs.year, bs.month, bs.day), (previous.year, previous.month, previous.day + 1))
                elif previous.month < 12:
                    self.assertEqual((bs.year, bs.month, bs.day), (previous.year, previous.month + 1, 1))
                else:
                    self.assertEqual((bs.year, bs.month, bs.day), (previous.year + 1, 1, 1))
            previous = bs
            ad += datetime.timedelta(days=1)
            count += 1
        self.assertGreater(count, 3600)

    def test_invalid_dates_raise_and_do_not_guess(self):
        with self.assertRaises(CalendarRangeError):
            bs_to_ad(2080, 0, 1)
        with self.assertRaises(CalendarRangeError):
            bs_to_ad(2080, 13, 1)
        with self.assertRaises(CalendarRangeError):
            bs_to_ad(2080, 1, 0)
        with self.assertRaises(CalendarRangeError) as too_long:
            bs_to_ad(2080, 1, 32)
        self.assertIn("31", str(too_long.exception))
        with self.assertRaises(CalendarRangeError) as early:
            bs_to_ad(1960, 1, 1)
        self.assertIn("1975", str(early.exception))
        with self.assertRaises(CalendarRangeError) as late:
            bs_to_ad(2084, 1, 1)
        self.assertIn("official month lengths", str(late.exception))
        with self.assertRaises(CalendarRangeError):
            ad_to_bs(datetime.date(1918, 4, 12))
        last = bs_to_ad(2083, 12, days_in_bs_month(2083, 12))
        with self.assertRaises(CalendarRangeError):
            ad_to_bs(last + datetime.timedelta(days=1))

    def test_formatting(self):
        bs = ad_to_bs(datetime.date(2027, 1, 29))
        self.assertEqual(format_bs(bs), "15 Magh 2083")
        self.assertEqual(format_ad(datetime.date(2027, 1, 29)), "January 29, 2027")
        pair = format_pair(datetime.date(2027, 1, 29))
        self.assertEqual(pair.bs, "15 Magh 2083")
        self.assertEqual(pair.ad, "January 29, 2027")
        self.assertEqual(to_nepali_digits("15 Magh 2083"), "१५ Magh २०८३")
        self.assertEqual(weekday_name(datetime.date(1918, 4, 13)), "Saturday")

    def test_frontend_table_is_the_same_file(self):
        backend = Path(__file__).resolve().parent / "data" / "bs_month_lengths.json"
        frontend = (
            Path(__file__).resolve().parents[2]
            / "frontend"
            / "src"
            / "lib"
            / "hrm"
            / "bs_month_lengths.json"
        )
        self.assertEqual(backend.read_bytes(), frontend.read_bytes())


class HRMonthTests(TestCase):
    def test_default_policy_uses_bs_calendar_months(self):
        # 7 Oct 2026 is inside Ashwin 2083 (Baisakh 1 2083 is 14 Apr 2026).
        ad = datetime.date(2026, 10, 7)
        span = get_hr_month_for_date(ad)
        self.assertEqual((span.bs_year, span.month_name), (2083, "Ashwin"))
        start, end = bs_month_boundaries(2083, 6)
        self.assertEqual((span.start, span.end), (start, end))
        self.assertLessEqual(span.start, ad)
        self.assertGreaterEqual(span.end, ad)

    def test_custom_start_day_labels_the_month_where_the_period_starts(self):
        policy = HRCalendarPolicy(month_mode=HRCalendarPolicy.MonthMode.CUSTOM_START, custom_start_day=15)
        # Magh 10 2083 is 24 Jan 2027. A period starting on the 15th still belongs to Poush.
        magh_10 = bs_to_ad(2083, 10, 10)
        span = get_hr_month_for_date(magh_10, policy)
        self.assertEqual(span.month_name, "Poush")
        self.assertEqual(span.start, bs_to_ad(2083, 9, 15))
        self.assertEqual(span.end, bs_to_ad(2083, 10, 14))

        magh_15 = bs_to_ad(2083, 10, 15)
        magh = get_hr_month_for_date(magh_15, policy)
        self.assertEqual(magh.month_name, "Magh")
        self.assertEqual(magh.start, datetime.date(2027, 1, 29))

    def test_short_month_clamps_start_day_without_gaps(self):
        # Mangsir 2083 has 29 days, Poush has 30, Magh has 29.
        self.assertEqual(days_in_bs_month(2083, 8), 29)
        self.assertEqual(period_start(2083, 8, 31), bs_to_ad(2083, 8, 29))
        self.assertEqual(period_start(2083, 9, 31), bs_to_ad(2083, 9, 30))
        mangsir = hr_month_span(2083, 8, 31)
        poush = hr_month_span(2083, 9, 31)
        self.assertEqual(mangsir.end + datetime.timedelta(days=1), poush.start)
        self.assertEqual(mangsir.month_name, "Mangsir")

    def test_months_of_a_year_partition_the_timeline(self):
        for start_day in (1, 15, 31):
            months = [hr_month_span(2082, month, start_day) for month in range(1, 13)]
            for current, nxt in zip(months, months[1:]):
                self.assertEqual(current.end + datetime.timedelta(days=1), nxt.start)
            self.assertEqual(months[0].start, period_start(2082, 1, start_day))

    def test_year_boundary_with_calendar_months(self):
        chaitra = get_hr_month_for_date(datetime.date(2026, 4, 13))
        baisakh = get_hr_month_for_date(datetime.date(2026, 4, 14))
        self.assertEqual((chaitra.bs_year, chaitra.month_name), (2082, "Chaitra"))
        self.assertEqual((baisakh.bs_year, baisakh.month_name), (2083, "Baisakh"))
        self.assertEqual(chaitra.end + datetime.timedelta(days=1), baisakh.start)

    def test_new_version_does_not_rewrite_earlier_months(self):
        today = timezone.localdate()
        current = get_hr_month_for_date(today)
        past = current.start - datetime.timedelta(days=1)
        past_before = get_hr_month_for_date(past)
        today_before = get_hr_month_for_date(today)

        from hrm.months import _shift_month

        year, month = _shift_month(current.bs_year, current.bs_month, 1)
        add_policy_version(
            effective_bs_year=year,
            effective_bs_month=month,
            today=today,
            month_mode=HRCalendarPolicy.MonthMode.CUSTOM_START,
            custom_start_day=15,
            weekly_off_days=["saturday"],
            fiscal_year_start_month=4,
            fiscal_year_start_day=1,
            hours_per_day="8.00",
        )
        past_after = get_hr_month_for_date(past)
        today_after = get_hr_month_for_date(today)
        self.assertEqual((past_after.bs_year, past_after.bs_month, past_after.start, past_after.end), (
            past_before.bs_year, past_before.bs_month, past_before.start, past_before.end,
        ))
        self.assertEqual(today_after.start, today_before.start)
        inside = period_start(year, month, 15)
        shifted = get_hr_month_for_date(inside)
        self.assertEqual(shifted.start, inside)
        self.assertEqual(shifted.bs_month, month)

    def test_version_for_a_month_already_started_is_rejected(self):
        today = timezone.localdate()
        current = get_hr_month_for_date(today)
        with self.assertRaises(CalendarRangeError):
            add_policy_version(
                effective_bs_year=current.bs_year,
                effective_bs_month=current.bs_month,
                today=today,
                month_mode=HRCalendarPolicy.MonthMode.CUSTOM_START,
                custom_start_day=10,
            )

    def test_list_hr_months_returns_twelve(self):
        months = list_hr_months(2083)
        self.assertEqual(len(months), 12)
        self.assertEqual(months[0].month_name, "Baisakh")
        self.assertEqual(months[9].month_name, "Magh")
        self.assertEqual(months[9].start, datetime.date(2027, 1, 15))

    def test_last_verified_month_does_not_invent_2084(self):
        span = hr_month_span(2083, 12, 15)
        self.assertEqual(span.end, bs_to_ad(2083, 12, days_in_bs_month(2083, 12)))


def _token(user):
    return str(RefreshToken.for_user(user).access_token)


class HRSettingsApiTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser("hrsuper", "hrsuper@example.test", "pass1234")
        self.hr_user = User.objects.create_user("hradmin", "hr@example.test", "pass1234")
        profile = UserProfile.objects.create(user=self.hr_user, phone="9841000091")
        profile.roles.add(Role.objects.get(name="HR/Admin"))
        self.plain = User.objects.create_user("plainstaff", "plain@example.test", "pass1234")
        UserProfile.objects.create(user=self.plain, phone="9841000092")

    def _future_month(self):
        today = timezone.localdate()
        current = get_hr_month_for_date(today)
        from hrm.months import _shift_month

        return _shift_month(current.bs_year, current.bs_month, 1)

    def test_hr_and_superuser_can_read_and_plain_user_cannot(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.hr_user)}")
        response = self.client.get("/api/hrm/settings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["policy"]["month_mode"], "bs_month")
        self.assertIn("current", response.data)
        self.assertIn("next", response.data)
        self.assertEqual(response.data["policy"]["weekly_off_days"], ["saturday"])

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.superuser)}")
        self.assertEqual(self.client.get("/api/hrm/settings/").status_code, 200)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.plain)}")
        self.assertEqual(self.client.get("/api/hrm/settings/").status_code, 403)
        self.assertEqual(self.client.post("/api/hrm/settings/", {}, format="json").status_code, 403)

    def test_hr_role_holds_settings_permission(self):
        role = Role.objects.get(name="HR/Admin")
        labels = set(role.permissions.values_list("content_type__app_label", "codename"))
        self.assertIn(("hrm", "view_hrm"), labels)
        self.assertIn(("hrm", "manage_hr_settings"), labels)
        super_admin = Role.objects.get(name="Super Admin")
        super_labels = set(super_admin.permissions.values_list("content_type__app_label", "codename"))
        self.assertIn(("hrm", "manage_hr_settings"), super_labels)

    def test_create_future_version_and_reject_started_month(self):
        year, month = self._future_month()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.hr_user)}")
        current = get_hr_month_for_date(timezone.localdate())
        rejected = self.client.post(
            "/api/hrm/settings/",
            {
                "month_mode": "custom_start",
                "custom_start_day": 15,
                "effective_bs_year": current.bs_year,
                "effective_bs_month": current.bs_month,
                "weekly_off_days": ["saturday"],
                "hours_per_day": "8",
            },
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)

        created = self.client.post(
            "/api/hrm/settings/",
            {
                "month_mode": "custom_start",
                "custom_start_day": 15,
                "effective_bs_year": year,
                "effective_bs_month": month,
                "weekly_off_days": ["Saturday", "sunday"],
                "hours_per_day": "8",
                "fiscal_year_start_month": 4,
                "fiscal_year_start_day": 1,
                "note": "Payroll month starts on the 15th.",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["weekly_off_days"], ["saturday", "sunday"])
        self.assertEqual(created.data["effective_from"], period_start(year, month, 15).isoformat())
        self.assertEqual(HRCalendarPolicy.objects.count(), 2)

    def test_preview_uses_draft_rules(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.hr_user)}")
        year, month = self._future_month()
        response = self.client.post(
            "/api/hrm/settings/preview/",
            {
                "month_mode": "custom_start",
                "custom_start_day": 15,
                "effective_bs_year": year,
                "effective_bs_month": month,
                "sample_date": "2027-01-29",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["effective_from"], period_start(year, month, 15).isoformat())
        self.assertIn("bs", response.data["effective_from_label"])
        self.assertIn("ad", response.data["effective_from_label"])
        self.assertEqual(response.data["sample"]["month_name"], "Magh")
        self.assertEqual(response.data["sample"]["start"], "2027-01-29")

    def test_calendar_data_requires_login(self):
        self.assertIn(self.client.get("/api/hrm/calendar-data/").status_code, (401, 403))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.plain)}")
        response = self.client.get("/api/hrm/calendar-data/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["min_year"], 1975)
        self.assertEqual(response.data["max_year"], 2083)
        self.assertEqual(response.data["months"]["2083"][9], 29)

    def test_invalid_hours_rejected(self):
        year, month = self._future_month()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.superuser)}")
        response = self.client.post(
            "/api/hrm/settings/",
            {
                "month_mode": "bs_month",
                "effective_bs_year": year,
                "effective_bs_month": month,
                "hours_per_day": "0",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class HistoricalImportCalendarTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser("importcal", "importcal@example.test", "pass1234")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(self.user)}")

    def _csv(self, registration_date):
        return (
            "name,phone,email,district,province,registration_date\n"
            f"Valid User,9841112233,v@test.com,Kathmandu,,{registration_date}\n"
        ).encode("utf-8")

    def test_bs_registration_date_is_stored_as_ad(self):
        result = execute_dry_run(
            "customers",
            self._csv("2080-01-01"),
            "customers.csv",
            {"calendar": "bs"},
        )
        self.assertEqual(result["rows_error"], 0, result["errors"])
        self.assertEqual(result["preview_rows"][0]["data"]["registration_date"], "2023-04-14")

        fp = io.BytesIO(self._csv("01/01/2080"))
        fp.name = "customers.csv"
        response = self.client.post(
            "/api/inventory/import-jobs/dry-run/",
            {"import_type": "customers", "file": fp, "calendar": "bs"},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["rows_error"], 0, response.data["errors"])
        self.assertEqual(response.data["preview_rows"][0]["data"]["registration_date"], "2023-04-14")

    def test_ad_file_is_unchanged(self):
        result = execute_dry_run(
            "customers",
            self._csv("2023-04-14"),
            "customers.csv",
            {"calendar": "ad"},
        )
        self.assertEqual(result["rows_error"], 0, result["errors"])
        self.assertEqual(result["preview_rows"][0]["data"]["registration_date"], "2023-04-14")
        rejected = execute_dry_run("customers", self._csv("2080-01-01"), "customers.csv", {"calendar": "ad"})
        self.assertEqual(rejected["rows_error"], 1)
        self.assertIn("Bikram Sambat", rejected["errors"][0]["message"])

    def test_invalid_bs_dates_name_the_row_and_column(self):
        for raw in ("2084-01-01", "2080-01-32"):
            result = execute_dry_run("customers", self._csv(raw), "customers.csv", {"calendar": "bs"})
            self.assertEqual(result["rows_error"], 1, raw)
            self.assertEqual(result["errors"][0]["field"], "registration_date")
            self.assertEqual(result["errors"][0]["row"], 2)

    def test_excel_datetime_cell_is_rejected_in_bs_mode(self):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["name", "phone", "email", "district", "province", "registration_date"])
        ws.append(["Valid User", "9841112233", "v@test.com", "Kathmandu", None, datetime.date(2023, 4, 14)])
        buffer = io.BytesIO()
        wb.save(buffer)
        result = execute_dry_run("customers", buffer.getvalue(), "customers.xlsx", {"calendar": "bs"})
        self.assertEqual(result["rows_error"], 1)
        self.assertIn("text", result["errors"][0]["message"])

    def test_calendar_must_be_ad_or_bs(self):
        with self.assertRaises(Exception):
            execute_dry_run("customers", self._csv("2023-04-14"), "customers.csv", {"calendar": "foo"})
        # Context is reset, so a later AD parse still rejects a BS year.
        parsed, error = parse_ad_date("2080-01-01")
        self.assertIsNone(parsed)
        self.assertIn("Bikram Sambat", error)

    def test_unused_permission_import(self):
        self.assertTrue(Permission.objects.filter(codename="manage_hr_settings").exists())
