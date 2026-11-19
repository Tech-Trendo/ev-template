"""
Tests for DailyActivityRollup, performance tracking endpoints,
purge hook preservation, dealer scoping, sensitive field masking, and print audit logs.
"""

from __future__ import annotations

import datetime
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, UserProfile, get_user_profile
from common.models import AuditLog, DailyActivityRollup
from common.services.rollup import rollup_daily_activity
from crm.models import Customer, Lead, Quotation
from dealers.models import Dealer

User = get_user_model()


class PerformanceTrackingTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Dealers
        self.dealer_a = Dealer.objects.create(name="Kathmandu Central Dealer")
        self.dealer_b = Dealer.objects.create(name="Pokhara Branch Dealer")

        # Roles
        self.dealer_role = Role.objects.create(name="Dealer Consultant", is_dealer_role=True)
        self.admin_role = Role.objects.create(name="Central Manager", is_dealer_role=False)

        # Users
        self.user_a = User.objects.create_user(
            username="staff_a", email="staff_a@example.com", password="password123", first_name="Staff", last_name="A"
        )
        p_a = get_user_profile(self.user_a)
        p_a.dealer = self.dealer_a
        p_a.roles.add(self.dealer_role)
        p_a.save()

        self.user_b = User.objects.create_user(
            username="staff_b", email="staff_b@example.com", password="password123", first_name="Staff", last_name="B"
        )
        p_b = get_user_profile(self.user_b)
        p_b.dealer = self.dealer_b
        p_b.roles.add(self.dealer_role)
        p_b.save()

        self.user_dealerless = User.objects.create_user(
            username="dealerless", email="dealerless@example.com", password="password123", first_name="No", last_name="Dealer"
        )
        p_dl = get_user_profile(self.user_dealerless)
        p_dl.dealer = None
        p_dl.roles.add(self.dealer_role)
        p_dl.save()

        self.super_admin = User.objects.create_superuser(
            username="admin_user", email="admin@example.com", password="password123"
        )

    def test_rollup_idempotency(self):
        """Running rollup_daily_activity multiple times produces identical counts and no duplicate rows."""
        target_date = timezone.localdate()

        # Create activities for user_a on target_date
        Lead.objects.create(
            name="Test Lead 1",
            phone="9800000001",
            dealer=self.dealer_a,
            created_by=self.user_a,
        )
        Lead.objects.create(
            name="Test Lead 2",
            phone="9800000002",
            dealer=self.dealer_a,
            created_by=self.user_a,
        )
        Customer.objects.create(
            name="Test Customer 1",
            phone="9800000003",
            dealer=self.dealer_a,
            created_by=self.user_a,
        )

        # First rollup run
        records_1 = rollup_daily_activity(start_date=target_date, end_date=target_date)
        self.assertGreater(records_1, 0)

        lead_rollup_1 = DailyActivityRollup.objects.get(
            user=self.user_a, date=target_date, action_type="LEAD_CREATED"
        )
        self.assertEqual(lead_rollup_1.count, 2)

        customer_rollup_1 = DailyActivityRollup.objects.get(
            user=self.user_a, date=target_date, action_type="CUSTOMER_CREATED"
        )
        self.assertEqual(customer_rollup_1.count, 1)

        total_rows_1 = DailyActivityRollup.objects.filter(date=target_date).count()

        # Second rollup run (idempotency check)
        records_2 = rollup_daily_activity(start_date=target_date, end_date=target_date)
        total_rows_2 = DailyActivityRollup.objects.filter(date=target_date).count()

        # Row count and counts must be identical
        self.assertEqual(total_rows_1, total_rows_2)
        lead_rollup_2 = DailyActivityRollup.objects.get(
            user=self.user_a, date=target_date, action_type="LEAD_CREATED"
        )
        self.assertEqual(lead_rollup_2.count, 2)

    def test_purge_preserves_totals(self):
        """Purging old audit logs preserves previously computed rollups and does not zero them out."""
        old_date = timezone.localdate() - datetime.timedelta(days=90)
        old_datetime = timezone.now() - datetime.timedelta(days=90)

        # Create an old login audit log
        log = AuditLog.objects.create(
            action=AuditLog.Action.LOGIN,
            source="AUTH",
            changed_by=self.user_a,
            summary="User staff_a logged in",
        )
        AuditLog.objects.filter(id=log.id).update(timestamp=old_datetime)

        # Run rollup for old_date
        rollup_daily_activity(start_date=old_date, end_date=old_date)

        rollup_before = DailyActivityRollup.objects.get(
            user=self.user_a, date=old_date, action_type="LOGIN"
        )
        self.assertEqual(rollup_before.count, 1)

        # Purge logs older than 60 days
        call_command("purge_old_activity_logs", days=60)

        # Verify AuditLog was purged
        self.assertFalse(AuditLog.objects.filter(id=log.id).exists())

        # Verify DailyActivityRollup still preserves count=1
        rollup_after = DailyActivityRollup.objects.get(
            user=self.user_a, date=old_date, action_type="LOGIN"
        )
        self.assertEqual(rollup_after.count, 1)

        # Re-run rollup on the purged date — must still preserve count=1
        rollup_daily_activity(start_date=old_date, end_date=old_date)
        rollup_rerun = DailyActivityRollup.objects.get(
            user=self.user_a, date=old_date, action_type="LOGIN"
        )
        self.assertEqual(rollup_rerun.count, 1)

    def test_dealer_scoping_performance_endpoints(self):
        """Dealer-scoped users only see their own dealer metrics; dealerless users see empty lists."""
        target_date = timezone.localdate()

        # Activities for User A (Dealer A)
        Lead.objects.create(
            name="Lead A", phone="9811111111", dealer=self.dealer_a, created_by=self.user_a
        )
        # Activities for User B (Dealer B)
        Lead.objects.create(
            name="Lead B", phone="9822222222", dealer=self.dealer_b, created_by=self.user_b
        )

        rollup_daily_activity(start_date=target_date, end_date=target_date)

        # 1. User A (Dealer A) requests daily performance
        self.client.force_authenticate(user=self.user_a)
        res_a = self.client.get(f"/api/performance/daily/?date={target_date}")
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        user_ids_a = [u["id"] for u in res_a.data["users"]]
        self.assertIn(self.user_a.id, user_ids_a)
        self.assertNotIn(self.user_b.id, user_ids_a)

        # 2. User A attempts to pass dealer_b in query params — must still be scoped to dealer A
        res_a_override = self.client.get(
            f"/api/performance/daily/?date={target_date}&dealer={self.dealer_b.id}"
        )
        self.assertEqual(res_a_override.status_code, status.HTTP_200_OK)
        user_ids_override = [u["id"] for u in res_a_override.data["users"]]
        self.assertIn(self.user_a.id, user_ids_override)
        self.assertNotIn(self.user_b.id, user_ids_override)

        # 3. Dealerless user sees empty data
        self.client.force_authenticate(user=self.user_dealerless)
        res_dl = self.client.get(f"/api/performance/daily/?date={target_date}")
        self.assertEqual(res_dl.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dl.data["users"], [])
        self.assertEqual(res_dl.data["total_actions"], 0)

        # 4. Super Admin sees both Dealer A and Dealer B
        self.client.force_authenticate(user=self.super_admin)
        res_admin = self.client.get(f"/api/performance/daily/?date={target_date}")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        admin_user_ids = [u["id"] for u in res_admin.data["users"]]
        self.assertIn(self.user_a.id, admin_user_ids)
        self.assertIn(self.user_b.id, admin_user_ids)

    def test_sensitive_field_masking(self):
        """User profile masks PAN, citizenship, and DOB unless caller has view_employee_sensitive."""
        target_user = User.objects.create_user(
            username="target_emp", email="target@example.com", password="password123"
        )
        p_target = get_user_profile(target_user)
        p_target.pan_vat_number = "123456789"
        p_target.citizenship_number = "987654321"
        p_target.date_of_birth = datetime.date(1990, 5, 20)
        p_target.save()

        # Regular staff user without sensitive view permission
        from rest_framework.test import APIRequestFactory
        from accounts.serializers import UserSerializer

        staff_caller = User.objects.create_user(
            username="regular_caller", email="caller@example.com", password="password123"
        )
        factory = APIRequestFactory()
        req_masked = factory.get(f"/api/users/{target_user.id}/")
        req_masked.user = staff_caller

        ser_masked = UserSerializer(target_user, context={"request": req_masked})
        self.assertFalse(ser_masked.data.get("can_view_sensitive"))
        self.assertIn("******", ser_masked.data.get("pan_vat_number"))
        self.assertIn("******", ser_masked.data.get("citizenship_number"))
        self.assertIn("****", ser_masked.data.get("date_of_birth"))

        # Sensitive viewer with accounts.view_employee_sensitive
        hr_caller = User.objects.create_user(
            username="hr_caller", email="hr@example.com", password="password123"
        )
        perm = Permission.objects.get(codename="view_employee_sensitive")
        hr_caller.user_permissions.add(perm)

        req_plain = factory.get(f"/api/users/{target_user.id}/")
        req_plain.user = hr_caller

        ser_plain = UserSerializer(target_user, context={"request": req_plain})
        self.assertTrue(ser_plain.data.get("can_view_sensitive"))
        self.assertEqual(ser_plain.data.get("pan_vat_number"), "123456789")
        self.assertEqual(ser_plain.data.get("citizenship_number"), "987654321")
        self.assertEqual(ser_plain.data.get("date_of_birth"), "1990-05-20")

        # Also verify current_user (/api/auth/user/) masks sensitive fields
        self.client.force_authenticate(user=target_user)
        me_res = self.client.get("/api/auth/user/")
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertFalse(me_res.data.get("can_view_sensitive"))
        self.assertIn("******", me_res.data.get("pan_vat_number"))

    def test_print_audit_log_written(self):
        """Calling record-print or exporting CSV creates an AuditLog with action=PRINT."""
        self.client.force_authenticate(user=self.user_a)

        # 1. Direct record-print API
        res = self.client.post(
            "/api/audit-logs/record-print/",
            {
                "document_type": "QUOTATION",
                "object_id": "QT-9999",
                "title": "Quotation QT-9999",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        print_log = AuditLog.objects.filter(
            action=AuditLog.Action.PRINT,
            changed_by=self.user_a,
            object_id="QT-9999",
        ).first()
        self.assertIsNotNone(print_log)
        self.assertEqual(print_log.source, "PRINT")
        self.assertIn("Printed QUOTATION #QT-9999", print_log.summary)

        # 2. Performance CSV Export endpoint
        today = timezone.localdate()
        export_res = self.client.get(
            f"/api/performance/export-csv/?date_from={today}&date_to={today}"
        )
        self.assertEqual(export_res.status_code, status.HTTP_200_OK)
        self.assertEqual(export_res["Content-Type"], "text/csv")

        csv_log = AuditLog.objects.filter(
            action=AuditLog.Action.PRINT,
            changed_by=self.user_a,
            source="PRINT",
            new_value="TEAM_PERFORMANCE_CSV",
        ).first()
        self.assertIsNotNone(csv_log)
