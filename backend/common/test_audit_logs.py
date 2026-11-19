from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, UserProfile, ensure_super_admin_role, seed_starter_roles
from common.models import AuditLog, log_audit_event
from crm.models import Customer
from inventory.models import ImportBatch, VehicleModel, VehicleUnit

User = get_user_model()


class AuditLogApiTests(TestCase):
    def setUp(self):
        seed_starter_roles()
        ensure_super_admin_role()

        self.super_admin = User.objects.create_superuser(
            username="audit_admin", email="admin@example.np", password="password123"
        )
        self.super_admin_profile, _ = UserProfile.objects.get_or_create(user=self.super_admin)
        self.super_admin_profile.roles.add(Role.objects.get(name="Super Admin"))

        self.regular_user = User.objects.create_user(
            username="regular_staff", email="staff@example.np", password="password123"
        )
        self.regular_profile, _ = UserProfile.objects.get_or_create(user=self.regular_user)
        self.regular_profile.roles.add(Role.objects.get(name="Sales Executive"))

        # User with explicit view_auditlog permission
        self.auditor = User.objects.create_user(
            username="compliance_auditor", email="auditor@example.np", password="password123"
        )
        self.auditor_profile, _ = UserProfile.objects.get_or_create(user=self.auditor)
        view_audit_perm = Permission.objects.get(
            content_type__app_label="common", codename="view_auditlog"
        )
        auditor_role = Role.objects.create(name="Auditor")
        auditor_role.permissions.add(view_audit_perm)
        self.auditor_profile.roles.add(auditor_role)

        # Create objects and log events
        self.customer = Customer.objects.create(
            name="Kathmandu Logistics", phone="9801112233", type="b2b"
        )
        log_audit_event(
            instance=self.customer,
            field_name="phone",
            old_value="9801112233",
            new_value="9809998877",
            changed_by=self.super_admin,
            source="SERVICING",
        )

        self.model = VehicleModel.objects.create(model_name="AOCHI 10T")
        self.batch = ImportBatch.objects.create(batch_no="BATCH-AUDIT-01")
        self.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-AUDIT-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        log_audit_event(
            instance=self.unit,
            field_name="registration_no",
            old_value="",
            new_value="BA 2 KHA 1234",
            changed_by=self.super_admin,
            source="REGISTRATION_CHANGE",
        )

    def test_audit_log_rbac_permissions(self):
        """Super Admin and users with view_auditlog can view logs; unpermitted users cannot."""
        client = APIClient()

        # 1. Unauthenticated request -> 401
        res = client.get("/api/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Regular staff without view_auditlog -> 403
        client.force_authenticate(user=self.regular_user)
        res = client.get("/api/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Super Admin -> 200
        client.force_authenticate(user=self.super_admin)
        res = client.get("/api/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 4. Auditor with view_auditlog -> 200
        client.force_authenticate(user=self.auditor)
        res = client.get("/api/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_audit_log_filtering(self):
        """Audit logs can be filtered by model, object_id, source, and search query."""
        client = APIClient()
        client.force_authenticate(user=self.super_admin)

        # Filter by model=customer
        res = client.get("/api/audit-logs/?model=customer")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get("results", [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["model_name"], "customer")
        self.assertEqual(results[0]["object_id"], str(self.customer.id))
        self.assertEqual(results[0]["field_name"], "phone")

        # Filter by model=vehicleunit and object_id
        res_unit = client.get(f"/api/audit-logs/?model=vehicleunit&object_id={self.unit.id}")
        self.assertEqual(res_unit.status_code, status.HTTP_200_OK)
        results_unit = res_unit.data if isinstance(res_unit.data, list) else res_unit.data.get("results", [])
        self.assertEqual(len(results_unit), 1)
        self.assertEqual(results_unit[0]["field_name"], "registration_no")
        self.assertEqual(results_unit[0]["new_value"], "BA 2 KHA 1234")

        # Filter by source=SERVICING
        res_source = client.get("/api/audit-logs/?source=SERVICING")
        self.assertEqual(res_source.status_code, status.HTTP_200_OK)
        results_source = res_source.data if isinstance(res_source.data, list) else res_source.data.get("results", [])
        self.assertEqual(len(results_source), 1)
        self.assertEqual(results_source[0]["source"], "SERVICING")

        # Search query matching registration number
        res_search = client.get("/api/audit-logs/?search=KHA")
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        results_search = res_search.data if isinstance(res_search.data, list) else res_search.data.get("results", [])
        self.assertEqual(len(results_search), 1)
        self.assertEqual(results_search[0]["model_name"], "vehicleunit")

    def test_login_and_logout_audit_logging(self):
        """Staff login via /api/auth/token/ and logout via /api/auth/logout/ are logged."""
        client = APIClient()

        # 1. Login
        login_res = client.post(
            "/api/auth/token/",
            {"username": "audit_admin", "password": "password123"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        access_token = login_res.data["access"]

        login_log = AuditLog.objects.filter(
            action=AuditLog.Action.LOGIN,
            changed_by=self.super_admin,
        ).first()
        self.assertIsNotNone(login_log)
        self.assertEqual(login_log.source, "AUTH")
        self.assertIn("logged in", login_log.summary)

        # 2. Logout
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        logout_res = client.post("/api/auth/logout/")
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)

        logout_log = AuditLog.objects.filter(
            action=AuditLog.Action.LOGOUT,
            changed_by=self.super_admin,
        ).first()
        self.assertIsNotNone(logout_log)
        self.assertEqual(logout_log.source, "AUTH")
        self.assertIn("logged out", logout_log.summary)

    def test_generic_model_crud_signals(self):
        """Creating, updating, and deleting an auditable admin model records AuditLog entries."""
        client = APIClient()
        client.force_authenticate(user=self.super_admin)

        # Create Dealer
        create_res = client.post(
            "/api/dealers/",
            {
                "name": "Pokhara EV Hub",
                "contact_person": "Sunil Gurung",
                "phone": "9801122334",
                "email": "pokhara@example.np",
                "address": "Prithvi Chowk",
                "district": "Kaski",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        dealer_id = create_res.data["id"]

        create_log = AuditLog.objects.filter(
            action=AuditLog.Action.CREATE,
            object_id=str(dealer_id),
        ).first()
        self.assertIsNotNone(create_log)
        self.assertEqual(create_log.changed_by, self.super_admin)
        self.assertIn("created Dealer 'Pokhara EV Hub'", create_log.summary)

        # Update Dealer
        update_res = client.patch(
            f"/api/dealers/{dealer_id}/",
            {"contact_person": "Sunil K. Gurung"},
            format="json",
        )
        self.assertEqual(update_res.status_code, status.HTTP_200_OK)
        update_log = AuditLog.objects.filter(
            action=AuditLog.Action.UPDATE,
            object_id=str(dealer_id),
            source="STAFF_ACTIVITY",
        ).first()
        self.assertIsNotNone(update_log)
        self.assertIn("updated Dealer 'Pokhara EV Hub'", update_log.summary)

        # Delete Dealer
        del_res = client.delete(f"/api/dealers/{dealer_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        delete_log = AuditLog.objects.filter(
            action=AuditLog.Action.DELETE,
            object_id=str(dealer_id),
        ).first()
        self.assertIsNotNone(delete_log)
        self.assertIn("deleted Dealer 'Pokhara EV Hub'", delete_log.summary)

    def test_sale_cancellation_duplicate_guard(self):
        """Sale cancellation creates exactly ONE AuditLog row for the sale, not two."""
        from inventory.services.sales import cancel_sale, record_sale
        from inventory.models import PDIInspection, PDITemplate, Sale

        template = PDITemplate.objects.filter(version_no=1).first()
        if not template:
            template = PDITemplate.objects.create(name="Standard PDI", version_no=1)
        PDIInspection.objects.create(
            vehicle=self.unit,
            template=template,
            status=PDIInspection.InspectionStatus.APPROVED,
            overall_rating="GOOD",
        )

        # Mark unit READY_FOR_SALE so it can be sold
        self.unit.status = VehicleUnit.Status.READY_FOR_SALE
        self.unit.save()

        # Record a sale
        sale = record_sale(
            unit_id=self.unit.id,
            customer_id=self.customer.id,
            user=self.super_admin,
            sold_date="2026-09-01",
            sold_price="3500000.00",
            payment_mode="CASH",
        )

        # Now cancel the sale
        cancel_sale(
            sale_id=sale.id,
            cancellation_reason="Customer requested finance cancellation",
            user=self.super_admin,
        )

        # Verify exactly ONE new AuditLog entry was created for the sale cancellation
        final_sale_logs = AuditLog.objects.filter(
            content_type=ContentType.objects.get_for_model(Sale),
            object_id=str(sale.id),
        )
        # Check cancellation entries specifically
        cancel_logs = final_sale_logs.filter(source="SALE_CANCEL")
        self.assertEqual(cancel_logs.count(), 1, "Exactly one SALE_CANCEL entry must exist.")

        # Ensure no duplicate generic STAFF_ACTIVITY UPDATE entry was created for the sale
        duplicate_generic = final_sale_logs.filter(
            source="STAFF_ACTIVITY",
            action=AuditLog.Action.UPDATE,
        )
        self.assertEqual(
            duplicate_generic.count(),
            0,
            "No duplicate generic audit entry should exist for the sale cancellation.",
        )

    def test_purge_old_activity_logs(self):
        """purge_old_activity_logs deletes entries older than retention window, keeps newer."""
        from datetime import timedelta
        from django.core.management import call_command
        from django.utils import timezone

        # Create old entry (70 days ago) and recent entry (5 days ago)
        now = timezone.now()
        old_log = AuditLog.objects.create(
            action=AuditLog.Action.UPDATE,
            source="STAFF_ACTIVITY",
            summary="Old entry 70 days ago",
            timestamp=now - timedelta(days=70),
        )
        new_log = AuditLog.objects.create(
            action=AuditLog.Action.UPDATE,
            source="STAFF_ACTIVITY",
            summary="Recent entry 5 days ago",
            timestamp=now - timedelta(days=5),
        )

        # Dry run does not delete
        call_command("purge_old_activity_logs", dry_run=True, days=60)
        self.assertTrue(AuditLog.objects.filter(id=old_log.id).exists())
        self.assertTrue(AuditLog.objects.filter(id=new_log.id).exists())

        # Real run deletes old entry only
        call_command("purge_old_activity_logs", days=60)
        self.assertFalse(AuditLog.objects.filter(id=old_log.id).exists())
        self.assertTrue(AuditLog.objects.filter(id=new_log.id).exists())

