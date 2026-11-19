"""Employees, departments, scope, and manual BS years."""

import datetime
import importlib

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role, UserProfile, get_user_profile
from common.models import AuditLog
from hrm.calendar import CalendarRangeError, ad_to_bs, bs_to_ad, days_in_bs_month
from hrm.models import (
    BSYearOverride,
    Department,
    Employee,
    EmployeeChangeLog,
    EmployeeNumbering,
    EmployeeStatusHistory,
    EmploymentType,
)
from hrm.scope import employee_queryset_for

User = get_user_model()

LENGTHS_2084 = [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]


def token(user):
    return str(RefreshToken.for_user(user).access_token)


class ManualYearTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser("calsuper", "cal@example.test", "pass1234")
        self.hr = User.objects.create_user("calhr", "calhr@example.test", "pass1234")
        profile = UserProfile.objects.create(user=self.hr, phone="9841000101")
        profile.roles.add(Role.objects.get(name="HR/Admin"))

    def test_validation_and_round_trip(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        denied = self.client.post(
            "/api/hrm/calendar-years/",
            {"year": 2084, "month_lengths": LENGTHS_2084},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.superuser)}")
        bad_count = self.client.post(
            "/api/hrm/calendar-years/",
            {"year": 2084, "month_lengths": LENGTHS_2084[:11]},
            format="json",
        )
        self.assertEqual(bad_count.status_code, 400)
        short = list(LENGTHS_2084)
        short[0] = 28
        self.assertEqual(
            self.client.post("/api/hrm/calendar-years/", {"year": 2084, "month_lengths": short}, format="json").status_code,
            400,
        )
        wrong_total = [30] * 12
        self.assertEqual(
            self.client.post(
                "/api/hrm/calendar-years/", {"year": 2084, "month_lengths": wrong_total}, format="json"
            ).status_code,
            400,
        )
        skipped = self.client.post(
            "/api/hrm/calendar-years/", {"year": 2086, "month_lengths": LENGTHS_2084}, format="json"
        )
        self.assertEqual(skipped.status_code, 400)

        created = self.client.post(
            "/api/hrm/calendar-years/",
            {"year": 2084, "month_lengths": LENGTHS_2084, "note": "Official panchanga"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        row = BSYearOverride.objects.get(year=2084)
        self.assertEqual(row.entered_by, self.superuser)
        self.assertIsNotNone(row.entered_at)

        last_2083 = bs_to_ad(2083, 12, days_in_bs_month(2083, 12))
        self.assertEqual(bs_to_ad(2084, 1, 1), last_2083 + datetime.timedelta(days=1))
        day = bs_to_ad(2084, 1, 1)
        end = bs_to_ad(2084, 12, 30)
        while day <= end:
            bs = ad_to_bs(day)
            self.assertEqual(bs_to_ad(bs.year, bs.month, bs.day), day)
            day += datetime.timedelta(days=1)
        with self.assertRaises(CalendarRangeError):
            bs_to_ad(2085, 1, 1)

        audit = AuditLog.objects.filter(summary__icontains="2084").first()
        self.assertIsNotNone(audit)


class EmployeeDirectoryTests(APITestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser("empsuper", "empsuper@example.test", "pass1234")
        self.hr = self._user("emphr", "HR/Admin")
        self.manager_user = self._user("mgr", "Manager")
        self.employee_user = self._user("empuser", "Employee")
        self.plain = self._user("plainhr", None)
        self.full_time = EmploymentType.objects.get(code="FULL_TIME")
        self.dept = Department.objects.create(name="Workshop", code="WORKSHOP")
        self.child = Department.objects.create(name="Body shop", code="BODY", parent=self.dept)
        self.boss = Employee.objects.create(full_name="Boss", department=self.dept, employment_type=self.full_time, user=self.manager_user)
        self.mid = Employee.objects.create(full_name="Mid", department=self.dept, reports_to=self.boss, employment_type=self.full_time)
        self.leaf = Employee.objects.create(
            full_name="Leaf",
            department=self.child,
            reports_to=self.mid,
            employment_type=self.full_time,
            basic_salary="40000.00",
            user=self.employee_user,
        )
        self.dept.head = self.boss
        self.dept.save(update_fields=["head"])

    def _user(self, username, role_name):
        user = User.objects.create_user(username, f"{username}@example.test", "pass1234")
        profile = UserProfile.objects.create(user=user, phone="9841000" + str(abs(hash(username)) % 1000).zfill(3)[:3])
        if role_name:
            profile.roles.add(Role.objects.get(name=role_name))
        return user

    def test_department_and_employment_type_crud(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        created = self.client.post(
            "/api/hrm/departments/",
            {"name": "Accounts", "code": "ACC", "parent": self.dept.id, "head": self.boss.id, "is_active": True},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertGreaterEqual(created.data["employee_count"], 0)
        listed = self.client.get("/api/hrm/departments/")
        self.assertTrue(any(row["code"] == "ACC" for row in listed.data))
        types = self.client.get("/api/hrm/employment-types/")
        names = {row["name"] for row in types.data}
        self.assertTrue({"Full-time", "Part-time", "Contract", "Probation", "Intern", "Daily wage"} <= names)
        added = self.client.post(
            "/api/hrm/employment-types/",
            {"name": "Consultant", "code": "CONSULTANT", "sort_order": 9},
            format="json",
        )
        self.assertEqual(added.status_code, 201, added.data)

    def test_employee_ids_are_unique_and_not_reused(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        first = self.client.post("/api/hrm/employees/", {"full_name": "One"}, format="json")
        second = self.client.post("/api/hrm/employees/", {"full_name": "Two"}, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertRegex(first.data["employee_code"], r"^EMP-\d{4}$")
        self.assertRegex(second.data["employee_code"], r"^EMP-\d{4}$")
        self.assertNotEqual(first.data["employee_code"], second.data["employee_code"])
        numbering = EmployeeNumbering.objects.get(pk=1)
        self.assertGreaterEqual(numbering.last_number, 2)
        Employee.objects.filter(employee_code=second.data["employee_code"]).delete()
        third = self.client.post("/api/hrm/employees/", {"full_name": "Three"}, format="json")
        self.assertNotEqual(third.data["employee_code"], second.data["employee_code"])

    def test_reports_to_cycle_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        response = self.client.patch(
            f"/api/hrm/employees/{self.boss.id}/",
            {"reports_to": self.leaf.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_profile_migration_is_idempotent(self):
        from django.apps import apps

        user = User.objects.create_user("migrated", "migrated@example.test", "pass1234", is_staff=True, first_name="Mina")
        profile = get_user_profile(user)
        profile.department = "Stores"
        profile.designation = "Helper"
        profile.phone = "9841230099"
        profile.employment_status = "probation"
        profile.pan_vat_number = "123456789"
        profile.save()
        before = Employee.objects.filter(user=user).count()
        seed_hr_people = importlib.import_module("hrm.migrations.0002_hr_employees").seed_hr_people
        seed_hr_people(apps, None)
        seed_hr_people(apps, None)
        employees = Employee.objects.filter(user=user)
        self.assertEqual(employees.count(), 1)
        self.assertEqual(before, 0)
        employee = employees.get()
        self.assertEqual(employee.department.name, "Stores")
        self.assertEqual(employee.employment_status, "active")
        self.assertEqual(employee.employment_type.code, "PROBATION")
        self.assertEqual(employee.pan_vat_number, "123456789")
        self.assertEqual(Department.objects.filter(name="Stores").count(), 1)

    def test_users_screen_writes_the_employee_record(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.superuser)}")
        user = User.objects.create_user("writer", "writer@example.test", "pass1234", is_staff=True)
        get_user_profile(user)
        response = self.client.patch(
            f"/api/users/{user.id}/",
            {"pan_vat_number": "908172635", "department": "Finance", "designation": "Clerk"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        employee = Employee.objects.get(user=user)
        self.assertEqual(employee.pan_vat_number, "908172635")
        self.assertEqual(employee.department.name, "Finance")
        profile = get_user_profile(user)
        self.assertEqual(profile.pan_vat_number, "")
        from accounts.serializers import UserSerializer
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        req = factory.get(f"/api/users/{user.id}/")
        req.user = self.plain
        masked = UserSerializer(user, context={"request": req})
        self.assertIn("*", masked.data["pan_vat_number"])
        self.assertNotIn("908172635", masked.data["pan_vat_number"])

    def test_salary_is_hidden_without_permission(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.manager_user)}")
        response = self.client.get(f"/api/hrm/employees/{self.leaf.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["basic_salary"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        visible = self.client.get(f"/api/hrm/employees/{self.leaf.id}/")
        self.assertEqual(visible.data["basic_salary"], "40000.00")

    def test_status_change_history_and_account_deactivation(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        missing = self.client.post(
            f"/api/hrm/employees/{self.leaf.id}/status/",
            {"employment_status": "resigned", "effective_date": "2026-10-01", "reason": "Left"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        done = self.client.post(
            f"/api/hrm/employees/{self.leaf.id}/status/",
            {
                "employment_status": "resigned",
                "effective_date": "2026-10-01",
                "reason": "Left",
                "deactivate_user": True,
            },
            format="json",
        )
        self.assertEqual(done.status_code, 200, done.data)
        self.leaf.refresh_from_db()
        self.employee_user.refresh_from_db()
        self.assertEqual(self.leaf.employment_status, "resigned")
        self.assertFalse(self.employee_user.is_active)
        self.assertTrue(EmployeeStatusHistory.objects.filter(employee=self.leaf, status="resigned").exists())

    def test_user_link_is_one_to_one(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        other = User.objects.create_user("spare", "spare@example.test", "pass1234")
        get_user_profile(other)
        linked = self.client.post(
            f"/api/hrm/employees/{self.mid.id}/account/",
            {"action": "link", "user_id": other.id},
            format="json",
        )
        self.assertEqual(linked.status_code, 200, linked.data)
        again = self.client.post(
            f"/api/hrm/employees/{self.boss.id}/account/",
            {"action": "link", "user_id": other.id},
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.superuser)}")
        taken = self.client.patch(f"/api/users/{other.id}/", {"employee_id": self.leaf.id}, format="json")
        self.assertEqual(taken.status_code, 400)

    def test_queryset_scope(self):
        self.assertEqual(employee_queryset_for(self.plain).count(), 0)
        self.assertEqual(set(employee_queryset_for(self.employee_user).values_list("id", flat=True)), {self.leaf.id})
        manager_ids = set(employee_queryset_for(self.manager_user).values_list("id", flat=True))
        self.assertEqual(manager_ids, {self.boss.id, self.mid.id, self.leaf.id})
        outsider = Employee.objects.create(full_name="Other dept", employment_type=self.full_time)
        self.assertNotIn(outsider.id, employee_queryset_for(self.manager_user).values_list("id", flat=True))
        self.assertGreaterEqual(employee_queryset_for(self.hr).count(), 4)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.manager_user)}")
        listing = self.client.get("/api/hrm/employees/")
        self.assertEqual({row["id"] for row in listing.data}, manager_ids)

    def test_me_returns_only_the_linked_employee(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.employee_user)}")
        response = self.client.get("/api/hrm/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.leaf.id)
        self.assertIsNone(response.data["basic_salary"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.plain)}")
        self.assertEqual(self.client.get("/api/hrm/me/").status_code, 404)

    def test_change_log_survives_audit_purge(self):
        EmployeeChangeLog.objects.create(
            employee=self.leaf,
            field_name="designation",
            old_value="Helper",
            new_value="Driver",
        )
        row = EmployeeChangeLog.objects.get(employee=self.leaf, field_name="designation")
        EmployeeChangeLog.objects.filter(pk=row.pk).update(changed_at=timezone.now() - datetime.timedelta(days=90))
        call_command("purge_old_activity_logs", days=60)
        self.assertTrue(EmployeeChangeLog.objects.filter(pk=row.pk).exists())

    def test_csv_export_permission_and_salary_column(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.manager_user)}")
        denied = self.client.get("/api/hrm/employees/export-csv/")
        self.assertEqual(denied.status_code, 403)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.hr)}")
        exported = self.client.get("/api/hrm/employees/export-csv/")
        self.assertEqual(exported.status_code, 200)
        text = exported.content.decode()
        self.assertIn("Basic salary", text)
        self.assertIn("40000.00", text)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditLog.Action.PRINT, changed_by=self.hr, source="PRINT").exists()
        )
        role = Role.objects.get(name="HR/Admin")
        role.permissions.remove(Permission.objects.get(codename="view_employee_salary"))
        hidden = self.client.get("/api/hrm/employees/export-csv/")
        self.assertNotIn("Basic salary", hidden.content.decode())

    def test_login_is_created_for_an_existing_employee(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token(self.superuser)}")
        role = Role.objects.get(name="Employee")
        missing = self.client.post(
            "/api/users/",
            {"username": "nobody", "password": "pass12345", "roles": [role.id], "first_name": "Nobody", "phone": "9800000001"},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        # Login-only payload — name/phone already live on the employee.
        created = self.client.post(
            "/api/users/",
            {
                "username": self.mid.employee_code,
                "password": "pass12345",
                "employee_id": self.mid.id,
                "roles": [role.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.mid.refresh_from_db()
        self.assertEqual(self.mid.user.username, self.mid.employee_code)
        self.assertEqual(self.mid.user.first_name, "Mid")
        self.assertEqual(Employee.objects.filter(full_name="Mid").count(), 1)


class CalendarWindowTests(TestCase):
    def test_warning_when_the_window_ends_within_120_days(self):
        from hrm.calendar import calendar_window

        quiet = calendar_window(datetime.date(2026, 10, 7))
        self.assertGreater(quiet["days_remaining"], 120)
        self.assertFalse(quiet["warn"])
        close = calendar_window(datetime.date(2027, 1, 1))
        self.assertLess(close["days_remaining"], 120)
        self.assertTrue(close["warn"])
