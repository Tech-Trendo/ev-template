from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, get_user_profile, seed_starter_roles
from common.models import AuditLog
from dealers.models import Dealer

User = get_user_model()


class ServiceRecordApiTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username="admin", password="pw123456", is_staff=True)
        seed_starter_roles()
        cls.dealer = Dealer.objects.create(name="KTM Motors", district="Kathmandu")
        cls.other_dealer = Dealer.objects.create(name="Pokhara Autos", district="Kaski")

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _create(self, **overrides):
        payload = {
            "chassis_number": "CH-001",
            "dealer": self.dealer.id,
            "status": "received",
            "service_notes": "first visit",
            "odometer_reading": 1200,
            "parts": [
                {"part_name": "Brake pad", "quantity": 2, "cost": "1500.00"},
                {"part_name": "Oil filter", "part_number": "OF-9"},
            ],
        }
        payload.update(overrides)
        return self.client.post("/api/servicing/records/", payload, format="json")

    def test_anon_denied(self):
        self.client.force_authenticate(None)
        resp = self.client.get("/api/servicing/records/")
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_create_with_nested_parts(self):
        resp = self._create()
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(len(resp.json()["parts"]), 2)

    def test_update_replaces_parts_only_when_key_present(self):
        rec_id = self._create().json()["id"]
        resp = self.client.patch(
            f"/api/servicing/records/{rec_id}/",
            {"status": "completed", "parts": [{"part_name": "Chain", "quantity": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.json()["parts"]), 1)

        resp = self.client.patch(
            f"/api/servicing/records/{rec_id}/", {"status": "delivered"}, format="json"
        )
        self.assertEqual(len(resp.json()["parts"]), 1)

    def test_filters(self):
        self._create()
        self.assertEqual(len(self.client.get("/api/servicing/records/?status=received").json()), 1)
        self.assertEqual(len(self.client.get("/api/servicing/records/?chassis_number=ch-00").json()), 1)
        self.assertEqual(
            len(self.client.get(f"/api/servicing/records/?dealer={self.dealer.id}").json()), 1
        )
        self.assertEqual(len(self.client.get("/api/servicing/records/?search=first").json()), 1)
        self.assertEqual(
            len(self.client.get(f"/api/servicing/records/?dealer={self.other_dealer.id}").json()), 0
        )

    def test_technician_can_update_but_not_delete_or_create(self):
        rec_id = self._create().json()["id"]
        tech = User.objects.create_user(username="tech", password="pw123456", is_staff=True)
        get_user_profile(tech).roles.set(Role.objects.filter(name="Technician"))
        self.client.force_authenticate(tech)
        self.assertEqual(self.client.get("/api/servicing/records/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch(
                f"/api/servicing/records/{rec_id}/", {"status": "completed"}, format="json"
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.delete(f"/api/servicing/records/{rec_id}/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_dealer_staff_scoped_to_own_dealer(self):
        self._create(chassis_number="CH-001", dealer=self.dealer.id)
        self._create(chassis_number="CH-002", dealer=self.other_dealer.id)
        staff = User.objects.create_user(username="dstaff", password="pw123456", is_staff=True)
        profile = get_user_profile(staff)
        profile.roles.set(Role.objects.filter(name="Dealer Staff"))
        profile.dealer = self.other_dealer
        profile.save()
        self.client.force_authenticate(staff)
        rows = self.client.get("/api/servicing/records/").json()
        self.assertEqual([r["chassis_number"] for r in rows], ["CH-002"])


class TrackServiceTest(APITestCase):
    """Public chassis lookup exposes status/parts/dates only — no PII."""

    @classmethod
    def setUpTestData(cls):
        User.objects.create_user(username="admin", password="pw123456", is_staff=True)
        seed_starter_roles()
        dealer = Dealer.objects.create(name="KTM Motors", district="Kathmandu")
        tech = User.objects.create_user(username="tech", password="pw123456", is_staff=True)
        from servicing.models import ServiceRecord, ServiceRecordPart

        rec = ServiceRecord.objects.create(
            chassis_number="CH-TRACK-1",
            dealer=dealer,
            technician=tech,
            status="completed",
            service_notes="internal secret note",
            odometer_reading=5000,
        )
        ServiceRecordPart.objects.create(
            record=rec, part_name="Brake pad", part_number="BP-1", quantity=2, cost=1500
        )

    def test_public_lookup_ok(self):
        resp = self.client.get("/api/servicing/track/?chassis_number=ch-track-1")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        data = resp.json()
        self.assertEqual(data["chassis_number"], "CH-TRACK-1")
        self.assertEqual(data["current_status"], "completed")
        self.assertEqual(len(data["visits"]), 1)
        visit = data["visits"][0]
        self.assertEqual(visit["dealer_name"], "KTM Motors")
        self.assertEqual(visit["parts"][0]["part_name"], "Brake pad")

    def test_no_pii_leaked(self):
        body = self.client.get("/api/servicing/track/?chassis_number=CH-TRACK-1").content.decode()
        for secret in ("internal secret note", "tech", "1500", "cost", "service_notes", "technician"):
            self.assertNotIn(secret, body)

    def test_missing_param_400(self):
        resp = self.client.get("/api/servicing/track/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_chassis_404(self):
        resp = self.client.get("/api/servicing/track/?chassis_number=NOPE-1")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ServiceSpineApiTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        seed_starter_roles()
        cls.admin = User.objects.create_user(
            username="admin_spine", password="pw123456", is_staff=True, is_superuser=True
        )
        cls.dealer_ktm = Dealer.objects.create(name="KTM Dealer", district="Kathmandu")
        cls.dealer_pkr = Dealer.objects.create(name="PKR Dealer", district="Kaski")

        from crm.models import Customer
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit, Sale

        cls.model = VehicleModel.objects.create(
            brand="VT",
            model_name="E-Trike King",
            battery_power_kw=15.0,
            motor_power_kw=10.0,
            vehicle_warranty_months=36,
        )
        cls.batch = ImportBatch.objects.create(batch_no="B-SPINE-01")

        cls.cust = Customer.objects.create(
            name="Hari Bahadur",
            phone="+977-9851000111",
            location="Kathmandu",
        )

        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SPINE-001",
            motor_no="MOT-9988",
            registration_no="BA-02-PA-1234",
            color="Blue",
            import_batch=cls.batch,
            vehicle_model=cls.model,
            current_customer=cls.cust,
            status=VehicleUnit.Status.SOLD,
            sold_date="2026-01-15",
            sold_price="4500000.00",
        )

        cls.sale = Sale.objects.create(
            unit=cls.unit,
            customer=cls.cust,
            sale_date="2026-01-15",
            selling_price="4500000.00",
            payment_mode="CASH",
            dealer=cls.dealer_ktm,
            is_current=True,
        )

    def test_prefill_service_manager_access_without_crm_perms(self):
        mgr = User.objects.create_user(username="mgr_spine", password="pw123456", is_staff=True)
        get_user_profile(mgr).roles.set(Role.objects.filter(name="Service Manager"))
        self.client.force_authenticate(mgr)

        # Confirm Service Manager has no CRM permissions
        crm_resp = self.client.get("/api/crm/customers/")
        self.assertEqual(crm_resp.status_code, status.HTTP_403_FORBIDDEN)

        # But can search prefill
        resp = self.client.get("/api/servicing/prefill/?q=VIN-SPINE")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(len(data), 1)
        item = data[0]
        self.assertEqual(item["unit"]["vin"], "VIN-SPINE-001")
        self.assertEqual(item["unit"]["registration"], "BA-02-PA-1234")
        self.assertEqual(item["customer"]["name"], "Hari Bahadur")
        self.assertEqual(item["customer"]["phone"], "+977-9851000111")
        self.assertEqual(item["warranty"]["status"], "active")
        self.assertEqual(item["warranty"]["vehicle"]["status"], "active")
        self.assertEqual(item["warranty"]["battery"]["status"], "not_configured")
        self.assertEqual(item["sale"]["dealer"], "KTM Dealer")

        # Also search by phone
        resp_phone = self.client.get("/api/servicing/prefill/?q=9851000111")
        self.assertEqual(resp_phone.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_phone.json()), 1)

    def test_create_service_record_snapshots_and_owner_validation(self):
        from crm.models import Customer
        from servicing.models import ServiceRecord

        self.client.force_authenticate(self.admin)

        # 1. Mismatched customer without override should fail
        other_cust = Customer.objects.create(name="Shyam Kumar", phone="9841999999")
        fail_resp = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": other_cust.id,
                "service_notes": "test",
            },
            format="json",
        )
        self.assertEqual(fail_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer", fail_resp.json())

        # 2. Mismatched customer with override_customer=True succeeds
        ok_resp = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": other_cust.id,
                "override_customer": True,
                "service_notes": "override test",
            },
            format="json",
        )
        self.assertEqual(ok_resp.status_code, status.HTTP_201_CREATED)
        rec_id = ok_resp.json()["id"]
        rec = ServiceRecord.objects.get(pk=rec_id)
        # Snapshot values populated server-side
        self.assertEqual(rec.chassis_number, "VIN-SPINE-001")
        self.assertEqual(rec.motor_no, "MOT-9988")
        self.assertEqual(rec.v_reg_no, "BA-02-PA-1234")
        self.assertEqual(rec.customer_name, "Shyam Kumar")

    def test_create_service_record_updates_customer_contact_and_logs_audit(self):
        self.client.force_authenticate(self.admin)
        orig_name = self.cust.name
        resp = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": self.cust.id,
                "customer_mobile": "9851000222",
                "customer_email": "hari.new@example.com",
                "customer_address": "Lalitpur",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.cust.refresh_from_db()
        self.assertEqual(self.cust.phone, "9851000222")
        self.assertEqual(self.cust.phone_normalized, "9851000222")
        self.assertEqual(self.cust.email, "hari.new@example.com")
        self.assertEqual(self.cust.location, "Lalitpur")
        self.assertEqual(self.cust.name, orig_name)

        # AuditLog written for customer contact edits
        audits = AuditLog.objects.filter(source="SERVICING", object_id=str(self.cust.id))
        self.assertTrue(audits.filter(field_name="phone", new_value="9851000222").exists())
        self.assertTrue(audits.filter(field_name="email", new_value="hari.new@example.com").exists())
        self.assertTrue(audits.filter(field_name="location", new_value="Lalitpur").exists())

    def test_service_record_customer_name_read_only_rejects_with_400(self):
        self.client.force_authenticate(self.admin)

        # 1. Attempting to change customer_name on create with linked customer returns 400
        resp_post = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": self.cust.id,
                "customer_name": "Hacked Name",
                "service_notes": "Attempt hack",
            },
            format="json",
        )
        self.assertEqual(resp_post.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer_name", resp_post.json())

        # 2. Creating with valid linked customer or matching customer_name succeeds
        ok_post = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": self.cust.id,
                "customer_name": self.cust.name,
                "service_notes": "Legit service",
            },
            format="json",
        )
        self.assertEqual(ok_post.status_code, status.HTTP_201_CREATED)
        rec_id = ok_post.json()["id"]

        # 3. Attempting to change customer_name via PATCH returns 400
        resp_patch = self.client.patch(
            f"/api/servicing/records/{rec_id}/",
            {"customer_name": "Another Name"},
            format="json",
        )
        self.assertEqual(resp_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer_name", resp_patch.json())

        # 4. For external vehicles (is_external=True), arbitrary customer_name is allowed
        resp_ext = self.client.post(
            "/api/servicing/records/",
            {
                "is_external": True,
                "chassis_number": "EXT-CHASSIS-999",
                "customer_name": "External Owner",
                "customer_mobile": "9800000000",
                "service_notes": "External vehicle job",
            },
            format="json",
        )
        self.assertEqual(resp_ext.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_ext.json()["customer_name"], "External Owner")

    def test_registration_number_sync_and_difference_confirmation(self):
        from inventory.models import VehicleUnit

        self.client.force_authenticate(self.admin)

        # 1. Setting registration on a unit with blank registration saves without conflict
        unreg_unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-UNREG-999",
            import_batch=self.batch,
            vehicle_model=self.model,
            current_customer=self.cust,
            status=VehicleUnit.Status.SOLD,
            registration_no="",
        )
        resp1 = self.client.post(
            "/api/servicing/records/",
            {
                "unit": unreg_unit.id,
                "customer": self.cust.id,
                "v_reg_no": "BA-01-PA-5555",
            },
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        unreg_unit.refresh_from_db()
        self.assertEqual(unreg_unit.registration_no, "BA-01-PA-5555")
        self.assertTrue(
            AuditLog.objects.filter(
                source="REGISTRATION_CHANGE",
                object_id=str(unreg_unit.id),
                field_name="registration_no",
                new_value="BA-01-PA-5555",
            ).exists()
        )

        # 2. Entering differing registration on a unit that already has one fails without confirm
        resp2 = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": self.cust.id,
                "v_reg_no": "DIFFERENT-REG-999",
            },
            format="json",
        )
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("v_reg_no", resp2.json())
        self.assertIn("differs", resp2.json()["v_reg_no"][0])

        # 3. Entering differing registration with confirm_registration_change=True succeeds
        resp3 = self.client.post(
            "/api/servicing/records/",
            {
                "unit": self.unit.id,
                "customer": self.cust.id,
                "v_reg_no": "DIFFERENT-REG-999",
                "confirm_registration_change": True,
            },
            format="json",
        )
        self.assertEqual(resp3.status_code, status.HTTP_201_CREATED)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.registration_no, "DIFFERENT-REG-999")
        self.assertTrue(
            AuditLog.objects.filter(
                source="REGISTRATION_CHANGE",
                object_id=str(self.unit.id),
                field_name="registration_no",
                new_value="DIFFERENT-REG-999",
            ).exists()
        )


class ServiceDueTrackingTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from datetime import timedelta
        from django.utils import timezone
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit, Sale
        from crm.models import Customer
        from servicing.models import ServiceRecord

        seed_starter_roles()
        cls.admin = User.objects.create_user(username="admin_due", password="pw", is_staff=True)
        cls.super_role = Role.objects.get(name="Super Admin")
        get_user_profile(cls.admin).roles.add(cls.super_role)

        cls.dealer_ktm = Dealer.objects.create(name="KTM Central", district="Kathmandu")
        cls.dealer_pkr = Dealer.objects.create(name="Pokhara West", district="Kaski")

        # Dealer staff user
        cls.dealer_staff = User.objects.create_user(username="dealer_staff_ktm", password="pw")
        ds_profile = get_user_profile(cls.dealer_staff)
        ds_profile.roles.add(Role.objects.get(name="Dealer Staff"))
        ds_profile.dealer = cls.dealer_ktm
        ds_profile.save()

        # Regular user with no permissions
        cls.plain_user = User.objects.create_user(username="plain_user", password="pw")

        # Models
        cls.model_configured = VehicleModel.objects.create(
            brand="VT",
            model_name="T1_DUE",
            service_interval_months=6,
            service_interval_km=5000,
        )
        cls.model_unconfigured = VehicleModel.objects.create(
            brand="VT",
            model_name="T1_NOCONFIG",
            service_interval_months=None,
            service_interval_km=None,
        )

        cls.batch = ImportBatch.objects.create(batch_no="BATCH-DUE-01")
        cls.cust_ktm = Customer.objects.create(name="Hari Sharma", phone="9841000001")
        cls.cust_pkr = Customer.objects.create(name="Sita Gurung", phone="9841000002")

        today = timezone.localdate()

        # Unit 1: KTM dealer, sold 7 months ago, odometer 2000 -> overdue by date
        cls.unit_overdue_date = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-001",
            vehicle_model=cls.model_configured,
            import_batch=cls.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date=today - timedelta(days=210),
            sold_price=2500000,
            odometer_km=2000,
            customer=cls.cust_ktm,
        )
        Sale.objects.create(
            unit=cls.unit_overdue_date,
            customer=cls.cust_ktm,
            dealer=cls.dealer_ktm,
            sale_date=today - timedelta(days=210),
            selling_price=2500000,
            is_current=True,
        )

        # Unit 2: KTM dealer, sold 2 months ago, odometer 6000 -> overdue by km (5000 km limit)
        cls.unit_overdue_km = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-002",
            vehicle_model=cls.model_configured,
            import_batch=cls.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date=today - timedelta(days=60),
            sold_price=2500000,
            odometer_km=6000,
            customer=cls.cust_ktm,
        )
        Sale.objects.create(
            unit=cls.unit_overdue_km,
            customer=cls.cust_ktm,
            dealer=cls.dealer_ktm,
            sale_date=today - timedelta(days=60),
            selling_price=2500000,
            is_current=True,
        )

        # Unit 3: Pokhara dealer, sold 1 month ago, odometer 1000 -> ok / not overdue
        cls.unit_ok_pkr = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-003",
            vehicle_model=cls.model_configured,
            import_batch=cls.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date=today - timedelta(days=30),
            sold_price=2500000,
            odometer_km=1000,
            customer=cls.cust_pkr,
        )
        Sale.objects.create(
            unit=cls.unit_ok_pkr,
            customer=cls.cust_pkr,
            dealer=cls.dealer_pkr,
            sale_date=today - timedelta(days=30),
            selling_price=2500000,
            is_current=True,
        )

        # Unit 4: Unconfigured model
        cls.unit_unconfigured = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-004",
            vehicle_model=cls.model_unconfigured,
            import_batch=cls.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date=today - timedelta(days=300),
            sold_price=2500000,
            odometer_km=15000,
            customer=cls.cust_ktm,
        )

        # Unit 5: In warehouse (unsold, never serviced)
        cls.unit_unsold = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DUE-005",
            vehicle_model=cls.model_configured,
            import_batch=cls.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
            odometer_km=50,
        )

    def test_service_due_computation_status(self):
        # 1. Unconfigured model returns "not_configured"
        due_unconf = self.unit_unconfigured.next_service_due
        self.assertEqual(due_unconf["status"], "not_configured")
        self.assertIsNone(due_unconf["due_date"])

        # 2. Unsold unit with no service history returns "none"
        due_unsold = self.unit_unsold.next_service_due
        self.assertEqual(due_unsold["status"], "none")

        # 3. Overdue by date
        due_date = self.unit_overdue_date.next_service_due
        self.assertEqual(due_date["status"], "overdue")
        self.assertTrue(due_date["is_overdue"])
        self.assertTrue(due_date["overdue_by_date"])
        self.assertFalse(due_date["overdue_by_km"])
        self.assertLess(due_date["days_until_due"], 0)

        # 4. Overdue by km (whichever comes first)
        due_km = self.unit_overdue_km.next_service_due
        self.assertEqual(due_km["status"], "overdue")
        self.assertTrue(due_km["is_overdue"])
        self.assertTrue(due_km["overdue_by_km"])
        self.assertFalse(due_km["overdue_by_date"])

        # 5. OK unit
        due_ok = self.unit_ok_pkr.next_service_due
        self.assertEqual(due_ok["status"], "ok")
        self.assertFalse(due_ok["is_overdue"])

    def test_service_record_resets_base(self):
        from datetime import timedelta
        from django.utils import timezone
        from servicing.models import ServiceRecord

        today = timezone.localdate()
        # Create an in-progress service record: should NOT reset
        sr_prog = ServiceRecord.objects.create(
            chassis_number=self.unit_overdue_date.vin_chassis_no,
            vehicle_unit=self.unit_overdue_date,
            status=ServiceRecord.Status.IN_PROGRESS,
            date_received=today,
            odometer_reading=2000,
        )
        self.assertTrue(self.unit_overdue_date.next_service_due["is_overdue"])

        # Once completed, it resets the interval base
        sr_prog.status = ServiceRecord.Status.COMPLETED
        sr_prog.date_completed = today
        sr_prog.odometer_reading = 2100
        sr_prog.save()

        due_after = self.unit_overdue_date.next_service_due
        self.assertEqual(due_after["status"], "ok")
        self.assertFalse(due_after["is_overdue"])
        self.assertEqual(due_after["last_service_km"], 2100)
        self.assertEqual(due_after["due_km"], 2100 + 5000)

    def test_service_due_endpoint_filters_and_scoping(self):
        # 1. Admin can list all due units
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/servicing/due/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        vins = [u["vin_chassis_no"] for u in resp.json()]
        self.assertIn("VIN-DUE-001", vins)
        self.assertIn("VIN-DUE-002", vins)

        # Overdue only filter
        resp_od = self.client.get("/api/servicing/due/?overdue_only=true")
        self.assertEqual(resp_od.status_code, status.HTTP_200_OK)
        od_vins = [u["vin_chassis_no"] for u in resp_od.json()]
        self.assertIn("VIN-DUE-001", od_vins)
        self.assertIn("VIN-DUE-002", od_vins)
        self.assertNotIn("VIN-DUE-003", od_vins)

        # 2. Dealer staff is scoped to KTM Central
        self.client.force_authenticate(self.dealer_staff)
        resp_dealer = self.client.get("/api/servicing/due/")
        self.assertEqual(resp_dealer.status_code, status.HTTP_200_OK)
        dealer_vins = [u["vin_chassis_no"] for u in resp_dealer.json()]
        self.assertIn("VIN-DUE-001", dealer_vins)
        self.assertIn("VIN-DUE-002", dealer_vins)
        # Pokhara unit must not be visible to KTM dealer staff
        self.assertNotIn("VIN-DUE-003", dealer_vins)

        # 3. Plain user without servicing permission is denied
        self.client.force_authenticate(self.plain_user)
        resp_denied = self.client.get("/api/servicing/due/")
        self.assertEqual(resp_denied.status_code, status.HTTP_403_FORBIDDEN)
