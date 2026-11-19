from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role, UserProfile, ensure_super_admin_role, seed_starter_roles
from common.models import Notification
from common.notifications import (
    create_notification,
    get_recipients_for_event,
)
from crm.models import Customer
from dealers.models import Dealer
from inventory.models import ImportBatch, Sale, VehicleModel, VehicleUnit

User = get_user_model()


class NotificationSystemTests(TestCase):
    def setUp(self):
        seed_starter_roles()
        ensure_super_admin_role()

        self.dealer_a = Dealer.objects.create(
            name="Kathmandu Dealership",
            status=Dealer.Status.ACTIVE,
        )
        self.dealer_b = Dealer.objects.create(
            name="Pokhara Dealership",
            status=Dealer.Status.ACTIVE,
        )

        # Users
        self.super_admin = User.objects.create_superuser(
            username="super_admin", email="admin@example.np", password="password123"
        )
        self.super_admin_profile, _ = UserProfile.objects.get_or_create(user=self.super_admin)
        self.super_admin_profile.roles.add(Role.objects.get(name="Super Admin"))

        self.service_manager = User.objects.create_user(
            username="service_mgr", email="sm@example.np", password="password123"
        )
        self.service_mgr_profile, _ = UserProfile.objects.get_or_create(user=self.service_manager)
        self.service_mgr_profile.roles.add(Role.objects.get(name="Service Manager"))

        self.dealer_staff_a = User.objects.create_user(
            username="dealer_staff_a", email="staff_a@example.np", password="password123"
        )
        self.dealer_a_profile, _ = UserProfile.objects.get_or_create(
            user=self.dealer_staff_a, dealer=self.dealer_a
        )
        self.dealer_a_profile.roles.add(Role.objects.get(name="Dealer Staff"))

        self.dealer_staff_b = User.objects.create_user(
            username="dealer_staff_b", email="staff_b@example.np", password="password123"
        )
        self.dealer_b_profile, _ = UserProfile.objects.get_or_create(
            user=self.dealer_staff_b, dealer=self.dealer_b
        )
        self.dealer_b_profile.roles.add(Role.objects.get(name="Dealer Staff"))

        self.sales_exec = User.objects.create_user(
            username="sales_exec", email="sales@example.np", password="password123"
        )
        self.sales_profile, _ = UserProfile.objects.get_or_create(user=self.sales_exec)
        self.sales_profile.roles.add(Role.objects.get(name="Sales Executive"))

        # Vehicle model with intervals and warranty
        self.model_10t = VehicleModel.objects.create(
            model_name="AOCHI 10T",
            vehicle_warranty_months=36,
            battery_warranty_months=60,
            service_interval_months=6,
            service_interval_km=10000,
        )

        self.batch = ImportBatch.objects.create(
            batch_no="IMP-2026-001",
        )

        # Customer
        self.customer = Customer.objects.create(
            name="Himalayan Logistics",
            phone="9801234567",
            type="b2b",
        )

        # Unit sold so next service is due in 5 days at dealer A
        self.today = timezone.localdate()
        from inventory.models import add_months
        sale_date = add_months(self.today, -6) + timedelta(days=5)
        self.unit_a = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-SOON-01",
            vehicle_model=self.model_10t,
            import_batch=self.batch,
            status=VehicleUnit.Status.SOLD,
            odometer_km=9200,
            customer=self.customer,
            current_customer=self.customer,
        )
        self.sale_a = Sale.objects.create(
            unit=self.unit_a,
            customer=self.customer,
            dealer=self.dealer_a,
            sale_date=sale_date,
            selling_price=5000000,
            is_current=True,
        )

    def test_notification_dispatch_and_idempotency(self):
        """Creating notification with dedup_key prevents duplicates."""
        notif1 = create_notification(
            recipient=self.service_manager,
            notification_type=Notification.NotificationType.SERVICE_DUE_SOON,
            title="Service due soon",
            message="Unit VIN-DUE-SOON-01 is due soon.",
            dedup_key="TEST:DUE:01",
        )
        self.assertIsNotNone(notif1)

        # Duplicate attempt returns None and does not create a row
        notif2 = create_notification(
            recipient=self.service_manager,
            notification_type=Notification.NotificationType.SERVICE_DUE_SOON,
            title="Service due soon",
            message="Unit VIN-DUE-SOON-01 is due soon.",
            dedup_key="TEST:DUE:01",
        )
        self.assertIsNone(notif2)
        self.assertEqual(Notification.objects.filter(recipient=self.service_manager).count(), 1)

    def test_routing_respects_dealer_scoping_and_roles(self):
        """Dealer staff only receive notifications for their own dealer."""
        # For an event at dealer A, recipients should include:
        # dealer_staff_a (assigned to dealer A), service_manager (unscoped), super_admin (unscoped)
        # dealer_staff_b (assigned to dealer B) must NOT receive it.
        # sales_exec (has no servicing permission) must NOT receive it.
        recipients = get_recipients_for_event("servicing.view_servicerecord", dealer_id=self.dealer_a.id)
        recipient_ids = {u.id for u in recipients}

        self.assertIn(self.dealer_staff_a.id, recipient_ids)
        self.assertIn(self.service_manager.id, recipient_ids)
        self.assertIn(self.super_admin.id, recipient_ids)
        self.assertNotIn(self.dealer_staff_b.id, recipient_ids)
        self.assertNotIn(self.sales_exec.id, recipient_ids)

    def test_generate_notifications_service_due(self):
        """generate_notifications creates service due notifications and is idempotent."""
        # Run command
        call_command("generate_notifications")

        notifs_a = Notification.objects.filter(recipient=self.dealer_staff_a)
        notifs_b = Notification.objects.filter(recipient=self.dealer_staff_b)

        # Staff A received notification for unit_a
        self.assertTrue(notifs_a.filter(notification_type=Notification.NotificationType.SERVICE_DUE_SOON).exists())
        # Staff B received none
        self.assertEqual(notifs_b.count(), 0)

        count_before = Notification.objects.count()

        # Run command second time in same window
        call_command("generate_notifications")
        count_after = Notification.objects.count()

        # No duplicates created
        self.assertEqual(count_before, count_after)

    def test_generate_notifications_service_overdue_weekly_recurrence(self):
        """Overdue units generate once per ISO week."""
        # Set unit to overdue (sold 8 months ago, odometer 15000 km)
        self.sale_a.sale_date = self.today - timedelta(days=240)
        self.sale_a.save()
        self.unit_a.odometer_km = 15000
        self.unit_a.save()

        call_command("generate_notifications")
        overdue_count = Notification.objects.filter(
            notification_type=Notification.NotificationType.SERVICE_OVERDUE,
            recipient=self.service_manager,
        ).count()
        self.assertEqual(overdue_count, 1)

        # Running back-to-back in same week creates no duplicate
        call_command("generate_notifications")
        overdue_count_again = Notification.objects.filter(
            notification_type=Notification.NotificationType.SERVICE_OVERDUE,
            recipient=self.service_manager,
        ).count()
        self.assertEqual(overdue_count_again, 1)

    def test_generate_notifications_warranty_expiring(self):
        """Warranty expiring in <= 30 days generates notification."""
        # Set warranty end to 20 days from today
        self.unit_a.warranty_end_date = self.today + timedelta(days=20)
        self.unit_a.save()

        call_command("generate_notifications")
        warranty_notifs = Notification.objects.filter(
            notification_type=Notification.NotificationType.WARRANTY_EXPIRING
        )
        self.assertTrue(warranty_notifs.exists())

        # Running again creates no duplicate
        count_before = warranty_notifs.count()
        call_command("generate_notifications")
        count_after = Notification.objects.filter(
            notification_type=Notification.NotificationType.WARRANTY_EXPIRING
        ).count()
        self.assertEqual(count_before, count_after)

    def test_reservation_expiring_and_expired(self):
        """Reservation expiring within 2 days creates notification, and expire_reservations creates expired notification."""
        now = timezone.now()
        unit_res = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RESERVED-01",
            vehicle_model=self.model_10t,
            import_batch=self.batch,
            status=VehicleUnit.Status.RESERVED,
            reservation_expires_at=now + timedelta(hours=24),
        )

        # 1. Expiring soon
        call_command("generate_notifications")
        self.assertTrue(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.RESERVATION_EXPIRING
            ).exists()
        )

        # 2. Expired
        unit_res.reservation_expires_at = now - timedelta(hours=1)
        unit_res.save()
        call_command("expire_reservations")

        unit_res.refresh_from_db()
        self.assertEqual(unit_res.status, VehicleUnit.Status.READY_FOR_SALE)
        self.assertTrue(
            Notification.objects.filter(
                notification_type=Notification.NotificationType.RESERVATION_EXPIRED
            ).exists()
        )

    def test_notification_api_endpoints(self):
        """Test GET /api/notifications/, unread-count, read, and mark-all-read."""
        client = APIClient()
        client.force_authenticate(user=self.service_manager)

        # Create two notifications for service manager
        n1 = create_notification(
            recipient=self.service_manager,
            notification_type=Notification.NotificationType.SERVICE_DUE_SOON,
            title="Service Due 1",
            message="Msg 1",
            dedup_key="K1",
        )
        create_notification(
            recipient=self.service_manager,
            notification_type=Notification.NotificationType.SERVICE_OVERDUE,
            title="Service Overdue 2",
            message="Msg 2",
            dedup_key="K2",
        )

        # Unread count
        res_count = client.get("/api/notifications/unread-count/")
        self.assertEqual(res_count.status_code, status.HTTP_200_OK)
        self.assertEqual(res_count.data["unread_count"], 2)

        # List
        res_list = client.get("/api/notifications/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        results = res_list.data if isinstance(res_list.data, list) else res_list.data.get("results", [])
        self.assertEqual(len(results), 2)

        # Mark n1 as read
        res_read = client.post(f"/api/notifications/{n1.id}/read/")
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)
        self.assertTrue(res_read.data["is_read"])

        # Unread count is now 1
        res_count2 = client.get("/api/notifications/unread-count/")
        self.assertEqual(res_count2.data["unread_count"], 1)

        # Mark all as read
        res_mark_all = client.post("/api/notifications/mark-all-read/")
        self.assertEqual(res_mark_all.status_code, status.HTTP_200_OK)
        self.assertEqual(res_mark_all.data["marked_read"], 1)

        # Unread count is now 0
        res_count3 = client.get("/api/notifications/unread-count/")
        self.assertEqual(res_count3.data["unread_count"], 0)
