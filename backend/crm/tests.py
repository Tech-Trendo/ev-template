import datetime

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from crm.models import Activity, CompanyBranding, Customer, Lead, Opportunity, Quotation, TestDrive
from django.contrib.auth import get_user_model


User = get_user_model()


class LeadConvertNotesTest(APITestCase):
    """Lead notes must be carried over onto the converted Customer."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin", email="admin@example.com", password="pw"
        )
        cls.lead = Lead.objects.create(
            first_name="Bir",
            last_name="Kumar",
            email="bir@example.com",
            phone="+9779801234567",
            vehicle="Pulsar NS200",
            notes="Interested in financing options.",
        )

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "admin", "password": "pw"})
        return resp.json()["access"]

    def test_convert_carries_lead_notes_to_new_customer(self):
        url = reverse("crm-lead-convert", kwargs={"pk": self.lead.pk})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        resp = self.client.post(url, {})
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp.json()["customer"]["notes"], "Interested in financing options.")

        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.CONVERTED)
        # The customer is linked to the lead by lead id — not by email.
        customer = Customer.objects.get(lead=self.lead)
        self.assertIsNotNone(customer.lead_id)
        self.assertEqual(customer.lead_id, self.lead.pk)
        self.assertEqual(customer.notes, "Interested in financing options.")
        self.assertEqual(customer.vehicles, ["Pulsar NS200"])

    def test_convert_does_not_link_customer_by_email(self):
        # A pre-existing customer that shares the same email must NOT be merged:
        # leads and customers are linked exclusively by the lead id.
        pre = Customer.objects.create(
            name="Pre Existing",
            type=Customer.Type.INDIVIDUAL,
            phone="+9779800000000",
            email="bir@example.com",
            notes="Pre-existing customer note.",
        )
        url = reverse("crm-lead-convert", kwargs={"pk": self.lead.pk})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        resp = self.client.post(url, {})
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)

        linked = Customer.objects.get(lead=self.lead)
        self.assertNotEqual(linked.pk, pre.pk)
        self.assertEqual(linked.notes, self.lead.notes)
        # The same-email pre-existing customer stays untouched and unlinked.
        pre.refresh_from_db()
        self.assertIsNone(pre.lead)
        self.assertEqual(pre.notes, "Pre-existing customer note.")

    def test_convert_reuses_existing_customer_for_the_same_lead(self):
        url = reverse("crm-lead-convert", kwargs={"pk": self.lead.pk})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        first = self.client.post(url, {}).json()["customer"]
        second = self.client.post(url, {}).json()["customer"]

        self.assertEqual(first["id"], second["id"])
        self.assertEqual(Customer.objects.filter(lead=self.lead).count(), 1)

    def test_delete_lead_cascades_to_linked_customer_and_downstream(self):
        url = reverse("crm-lead-convert", kwargs={"pk": self.lead.pk})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        self.client.post(url, {})

        customer = Customer.objects.get(lead=self.lead)
        td = TestDrive.objects.create(customer=customer, customer_name=customer.name, vehicle="Pulsar NS200", date=datetime.date(2025, 12, 20))
        qt = Quotation.objects.create(customer=customer, customer_name=customer.name, vehicle="Pulsar NS200", vehicle_price=150000)
        opp = Opportunity.objects.create(title="Test Opp", customer=customer, customer_name=customer.name, vehicle="Pulsar NS200")
        act = Activity.objects.create(customer=customer, lead=self.lead, type=Activity.Type.NOTE, subject="Follow up")

        resp = self.client.delete(f"/api/crm/leads/{self.lead.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT, resp.content)
        self.assertFalse(Lead.objects.filter(pk=self.lead.pk).exists())
        self.assertFalse(Customer.objects.filter(pk=customer.pk).exists())
        self.assertFalse(TestDrive.objects.filter(pk=td.pk).exists())
        self.assertFalse(Quotation.objects.filter(pk=qt.pk).exists())
        self.assertFalse(Opportunity.objects.filter(pk=opp.pk).exists())
        self.assertFalse(Activity.objects.filter(pk=act.pk).exists())

    def test_delete_lead_deletes_test_drives_and_quotations_made_before_conversion(self):
        """Test drives / quotations created from a lead (before it is converted)
        are attributed to the lead directly. Deleting the lead must delete them
        too — they must never survive as orphaned rows."""
        td = TestDrive.objects.create(
            lead=self.lead, customer_name=self.lead.full_name,
            vehicle="Pulsar NS200", date=datetime.date(2025, 12, 20),
        )
        qt = Quotation.objects.create(
            lead=self.lead, customer_name=self.lead.full_name,
            vehicle="Pulsar NS200", vehicle_price=150000,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        resp = self.client.delete(f"/api/crm/leads/{self.lead.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT, resp.content)
        self.assertFalse(Lead.objects.filter(pk=self.lead.pk).exists())
        self.assertFalse(TestDrive.objects.filter(pk=td.pk).exists())
        self.assertFalse(Quotation.objects.filter(pk=qt.pk).exists())

    def test_delete_lead_keeps_unlinked_public_bookings(self):
        """Test drives / quotations with no lead and no customer (walk-in
        website bookings) belong to nobody and must NOT be deleted."""
        unlinked_td = TestDrive.objects.create(
            customer_name="Walk-in Visitor", vehicle="Pulsar NS200",
            date=datetime.date(2025, 12, 20),
        )
        unlinked_qt = Quotation.objects.create(
            customer_name="Walk-in Visitor", vehicle="Pulsar NS200",
            vehicle_price=150000,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        resp = self.client.delete(f"/api/crm/leads/{self.lead.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT, resp.content)
        self.assertTrue(TestDrive.objects.filter(pk=unlinked_td.pk).exists())
        self.assertTrue(Quotation.objects.filter(pk=unlinked_qt.pk).exists())

    def test_quotation_pdf_download(self):
        quote = Quotation.objects.create(
            vehicle="Pulsar NS200",
            vehicle_price=150000,
            accessories=5000,
            discount=10000,
            other_charges=2000,
            vat_rate=13,
            salesperson="Bikash Maharjan",
            notes="Please include extended warranty.",
            valid_until=datetime.date(2025, 12, 31),
        )
        url = reverse("crm-quotation-pdf", kwargs={"pk": quote.pk})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertIn("attachment", resp["Content-Disposition"])
        self.assertIn("QT-", resp["Content-Disposition"])
        self.assertIn(b"%PDF", resp.content)


class LeadSourceApiTest(APITestCase):
    """Lead sources are dynamically managed and drive the CRM dropdowns."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="sadmin", email="sadmin@example.com", password="pw"
        )

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "sadmin", "password": "pw"})
        return resp.json()["access"]

    def test_crm_meta_includes_seeded_sources(self):
        self._auth()
        resp = self.client.get("/api/crm/meta/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("Website", resp.json()["lead_sources"])
        self.assertIn("Other", resp.json()["lead_sources"])

    def test_create_source_shows_up_in_meta_and_dropdown(self):
        self._auth()
        resp = self.client.post(
            "/api/crm/lead-sources/", {"name": "TikTok", "is_active": True}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

        meta = self.client.get("/api/crm/meta/").json()
        self.assertIn("TikTok", meta["lead_sources"])

        listing = self.client.get("/api/crm/lead-sources/").json()
        self.assertTrue(any(s["name"] == "TikTok" for s in listing))

    def test_duplicate_name_rejected_case_insensitive(self):
        self._auth()
        self.client.post("/api/crm/lead-sources/", {"name": "TikTok"}, format="json")
        resp = self.client.post("/api/crm/lead-sources/", {"name": "tiktok"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

    def test_deactivate_hides_source_from_dropdown(self):
        self._auth()
        created = self.client.post(
            "/api/crm/lead-sources/", {"name": "Newspaper", "is_active": True}, format="json"
        ).json()
        self.client.patch(
            f"/api/crm/lead-sources/{created['id']}/",
            {"is_active": False},
            format="json",
        )
        meta = self.client.get("/api/crm/meta/").json()
        self.assertNotIn("Newspaper", meta["lead_sources"])

    def test_delete_blocks_source_with_leads(self):
        self._auth()
        created = self.client.post(
            "/api/crm/lead-sources/", {"name": "Billboard", "is_active": True}, format="json"
        ).json()
        Lead.objects.create(
            name="Billboard Lead", phone="+9779800000000", source="Billboard"
        )

        resp = self.client.delete(f"/api/crm/lead-sources/{created['id']}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

        # Deactivate instead — historical lead stays intact.
        self.client.patch(
            f"/api/crm/lead-sources/{created['id']}/",
            {"is_active": False},
            format="json",
        )
        lead = Lead.objects.filter(source="Billboard").first()
        self.assertIsNotNone(lead)
        self.assertEqual(lead.source, "Billboard")

    def test_lead_can_be_saved_with_new_dynamic_source(self):
        self._auth()
        self.client.post(
            "/api/crm/lead-sources/", {"name": "Trade Show"}, format="json"
        )
        resp = self.client.post(
            "/api/crm/leads/",
            {
                "name": "Trade Show Lead",
                "phone": "+9779801111111",
                "source": "Trade Show",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.json()["source"], "Trade Show")


class ActivityTypeApiTest(APITestCase):
    """Activity types are dynamically managed and drive the Add Activity dropdown."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="sadmin", email="sadmin@example.com", password="pw"
        )

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "sadmin", "password": "pw"})
        return resp.json()["access"]

    def test_crm_meta_includes_seeded_types(self):
        self._auth()
        resp = self.client.get("/api/crm/meta/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn("call", data["activity_types"])
        self.assertEqual(data["activity_labels"]["call"], "Call")
        self.assertEqual(data["activity_labels"]["status_change"], "Status Change")

    def test_create_type_shows_up_in_meta_dropdown(self):
        self._auth()
        resp = self.client.post(
            "/api/crm/activity-types/",
            {"name": "site_visit", "label": "Site Visit", "is_active": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)

        meta = self.client.get("/api/crm/meta/").json()
        self.assertIn("site_visit", meta["activity_types"])
        self.assertEqual(meta["activity_labels"]["site_visit"], "Site Visit")

        listing = self.client.get("/api/crm/activity-types/").json()
        self.assertTrue(any(t["name"] == "site_visit" for t in listing))

    def test_duplicate_name_rejected_case_insensitive(self):
        self._auth()
        self.client.post("/api/crm/activity-types/", {"name": "Site Visit"}, format="json")
        resp = self.client.post("/api/crm/activity-types/", {"name": "site visit"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

    def test_label_defaults_to_name(self):
        self._auth()
        created = self.client.post(
            "/api/crm/activity-types/", {"name": "Follow Up"}, format="json"
        ).json()
        self.assertEqual(created["label"], "")
        meta = self.client.get("/api/crm/meta/").json()
        self.assertEqual(meta["activity_labels"]["Follow Up"], "Follow Up")

    def test_deactivate_hides_type_from_dropdown(self):
        self._auth()
        created = self.client.post(
            "/api/crm/activity-types/", {"name": "Site Visit"}, format="json"
        ).json()
        self.client.patch(
            f"/api/crm/activity-types/{created['id']}/",
            {"is_active": False},
            format="json",
        )
        meta = self.client.get("/api/crm/meta/").json()
        self.assertNotIn("Site Visit", meta["activity_types"])

    def test_delete_blocks_type_with_activities(self):
        self._auth()
        created = self.client.post(
            "/api/crm/activity-types/", {"name": "Site Visit"}, format="json"
        ).json()
        Activity.objects.create(type="Site Visit", subject="Visited showroom")

        resp = self.client.delete(f"/api/crm/activity-types/{created['id']}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

        # Deactivate instead — historical activity keeps its type intact.
        self.client.patch(
            f"/api/crm/activity-types/{created['id']}/",
            {"is_active": False},
            format="json",
        )
        activity = Activity.objects.filter(type="Site Visit").first()
        self.assertIsNotNone(activity)
        self.assertEqual(activity.type, "Site Visit")

    def test_activity_can_be_logged_with_new_dynamic_type(self):
        self._auth()
        self.client.post("/api/crm/activity-types/", {"name": "Site Visit"}, format="json")
        resp = self.client.post(
            "/api/crm/activities/",
            {
                "type": "Site Visit",
                "subject": "Showroom visit",
                "description": "Customer inspected the fleet.",
                "datetime": "2025-06-01T10:00:00",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.json()["type"], "Site Visit")

        self._auth()
        created = self.client.post(
            "/api/crm/lead-sources/", {"name": "Billboard", "is_active": True}, format="json"
        ).json()
        Lead.objects.create(
            name="Billboard Lead", phone="+9779800000000", source="Billboard"
        )

        resp = self.client.delete(f"/api/crm/lead-sources/{created['id']}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)

        # Deactivate instead — historical lead stays intact.
        self.client.patch(
            f"/api/crm/lead-sources/{created['id']}/",
            {"is_active": False},
            format="json",
        )
        self._auth()
        lead = Lead.objects.filter(source="Billboard").first()
        self.assertIsNotNone(lead)
        self.assertEqual(lead.source, "Billboard")

    def test_lead_can_be_saved_with_new_dynamic_source(self):
        self._auth()
        self.client.post(
            "/api/crm/lead-sources/", {"name": "Trade Show"}, format="json"
        )
        resp = self.client.post(
            "/api/crm/leads/",
            {
                "name": "Trade Show Lead",
                "phone": "+9779801111111",
                "source": "Trade Show",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.json()["source"], "Trade Show")


class Phase2SalesChainTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin2", email="admin2@example.com", password="pw"
        )
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit
        cls.v_model = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI 10T",
            vehicle_warranty_months=36,
            vehicle_warranty_km=100000,
            battery_warranty_months=60,
            battery_warranty_km=200000,
            motor_warranty_months=36,
        )
        cls.unconfigured_model = VehicleModel.objects.create(
            brand="VT",
            model_name="Custom Cargo",
        )
        cls.batch = ImportBatch.objects.create(batch_no="B-TEST-01")
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-PHASE2-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        from inventory.models import PDIInspection, PDITemplate
        template = PDITemplate.objects.get(inspection_type="PDI", version_no=1)
        PDIInspection.objects.create(
            vehicle=cls.unit,
            template=template,
            status=PDIInspection.InspectionStatus.APPROVED,
            overall_rating="GOOD",
        )
        cls.lead = Lead.objects.create(
            name="Ramesh Sharma",
            phone="+9779809998888",
            vehicle="VT AOCHI 10T",
            status=Lead.Status.NEW,
        )

    def _auth(self):
        resp = self.client.post("/api/auth/token/", {"username": "admin2", "password": "pw"})
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.json()['access']}")

    def test_test_drive_from_unconverted_lead_without_customer(self):
        self._auth()
        resp = self.client.post(
            "/api/crm/test-drives/",
            {
                "lead": self.lead.id,
                "vehicle": "VT AOCHI 10T",
                "date": "2026-09-25",
                "time": "14:00:00",
                "salesperson": "Sales Rep",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        self.assertEqual(data["lead"], self.lead.id)
        self.assertIsNone(data["customer"])

    def test_quotation_requires_vehicle_model(self):
        self._auth()
        # Missing vehicle_model fails validation
        resp = self.client.post(
            "/api/crm/quotations/",
            {
                "lead": self.lead.id,
                "vehicle_price": 5000000,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # With vehicle_model and optional unit
        resp = self.client.post(
            "/api/crm/quotations/",
            {
                "lead": self.lead.id,
                "vehicle_model": self.v_model.id,
                "unit": self.unit.id,
                "vehicle_price": 5000000,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        self.assertIsNone(data["reserved_unit"])
        self.assertEqual(data["vehicle_model"], self.v_model.id)
        self.assertEqual(data["unit"], self.unit.id)
        self.assertFalse(data["converted_to_order"])

    def test_computed_pipeline_stage(self):
        self._auth()
        # 1. New lead
        resp = self.client.get(f"/api/crm/leads/{self.lead.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["pipeline_stage"], "new")

        # 2. Add test drive -> pipeline_stage becomes test_drive
        TestDrive.objects.create(
            lead=self.lead,
            vehicle="AOCHI 10T",
            date="2026-09-25",
            status=TestDrive.Status.SCHEDULED,
        )
        resp = self.client.get(f"/api/crm/leads/{self.lead.id}/")
        self.assertEqual(resp.json()["pipeline_stage"], "test_drive")

        # 3. Add quotation -> pipeline_stage becomes quotation
        quote = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="VT AOCHI 10T",
            status=Quotation.Status.SENT,
        )
        resp = self.client.get(f"/api/crm/leads/{self.lead.id}/")
        self.assertEqual(resp.json()["pipeline_stage"], "quotation")

        # 4. Accept quotation -> negotiation
        quote.status = Quotation.Status.ACCEPTED
        quote.save(update_fields=["status"])
        resp = self.client.get(f"/api/crm/leads/{self.lead.id}/")
        self.assertEqual(resp.json()["pipeline_stage"], "negotiation")

    def test_sale_syncs_quotation_sold_and_lead_converted(self):
        from inventory.models import Sale
        customer = Customer.objects.create(
            name="Ramesh Sharma",
            phone="+9779809998888",
        )
        quote = Quotation.objects.create(
            lead=self.lead,
            customer=customer,
            vehicle_model=self.v_model,
            status=Quotation.Status.ACCEPTED,
        )
        self.assertFalse(quote.converted_to_order)

        # Record Sale referencing quote and lead via record_sale service
        from inventory.services.sales import record_sale

        record_sale(
            unit_id=self.unit.id,
            customer_id=customer.id,
            lead_id=self.lead.id,
            quotation_id=quote.id,
            sold_date="2026-09-21",
            sold_price=4800000,
            payment_mode="CASH",
        )

        quote.refresh_from_db()
        self.assertTrue(quote.converted_to_order)

        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.CONVERTED)

        self.unit.refresh_from_db()
        from inventory.models import VehicleUnit
        self.assertEqual(self.unit.status, VehicleUnit.Status.SOLD)
        self.assertEqual(self.unit.current_customer, customer)

        # Pipeline stage of lead is now "won"
        from crm.services.pipeline import compute_lead_pipeline_stage
        self.assertEqual(compute_lead_pipeline_stage(self.lead), "won")

    def test_warranty_status_not_configured_when_model_unconfigured(self):
        from inventory.models import VehicleUnit
        unit2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-UNCONFIGURED-001",
            vehicle_model=self.unconfigured_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date="2026-09-21",
        )
        self.assertEqual(unit2.warranty_status, "not_configured")
        self.assertEqual(unit2.vehicle_warranty_status, "not_configured")
        self.assertEqual(unit2.battery_warranty_status, "not_configured")

        # With model configured:
        unit3 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-CONFIGURED-001",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date="2026-09-21",
        )
        self.assertEqual(unit3.warranty_status, "active")
        self.assertEqual(unit3.vehicle_warranty_status, "active")
        self.assertEqual(unit3.battery_warranty_status, "active")

    def test_vehicle_and_battery_warranty_status_computed_separately(self):
        from inventory.models import VehicleUnit

        # Sold 48 months ago: vehicle warranty (36m) is expired, but battery warranty (60m) is active
        unit_split_time = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SPLIT-TIME-001",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date="2022-09-21",
        )
        self.assertEqual(unit_split_time.vehicle_warranty_status, "expired")
        self.assertEqual(unit_split_time.battery_warranty_status, "active")

        # Sold recently, but odometer is 150,000 km:
        # vehicle warranty (100k km limit) is expired, but battery warranty (200k km limit) is active
        unit_split_km = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SPLIT-KM-001",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.SOLD,
            sold_date="2026-09-21",
            odometer_km=150000,
        )
        self.assertEqual(unit_split_km.vehicle_warranty_status, "expired")
        self.assertEqual(unit_split_km.battery_warranty_status, "active")


class CustomerPhoneDuplicateMatchingTest(APITestCase):
    """Test server-enforced customer phone deduplication and override flag."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin_cust", email="admin_cust@example.com", password="pw"
        )
        cls.existing = Customer.objects.create(
            name="Existing Ram",
            company="Ram Traders",
            type=Customer.Type.INDIVIDUAL,
            phone="+977-9841234567",
            email="ram@example.com",
        )

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "admin_cust", "password": "pw"})
        return resp.json()["access"]

    def test_duplicate_phone_returns_409_with_matching_customers(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        resp = self.client.post(
            "/api/crm/customers/",
            {
                "name": "Another Ram",
                "phone": "9841234567",
                "type": "Individual",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        data = resp.json()
        self.assertIn("matching_customers", data)
        self.assertEqual(len(data["matching_customers"]), 1)
        match = data["matching_customers"][0]
        self.assertEqual(match["id"], self.existing.id)
        self.assertEqual(match["name"], "Existing Ram")
        self.assertEqual(match["code"], self.existing.display_id)
        self.assertEqual(match["phone"], "+977-9841234567")
        self.assertEqual(Customer.objects.count(), 1)

    def test_duplicate_phone_with_allow_duplicate_flag_creates_customer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        resp = self.client.post(
            "/api/crm/customers/",
            {
                "name": "Second Ram",
                "phone": "9841234567",
                "type": "Individual",
                "allow_duplicate_phone": True,
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Customer.objects.count(), 2)
        new_cust = Customer.objects.get(name="Second Ram")
        self.assertEqual(new_cust.phone_normalized, self.existing.phone_normalized)

    def test_duplicate_phone_with_string_flag_creates_customer(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        resp = self.client.post(
            "/api/crm/customers/",
            {
                "name": "Third Ram",
                "phone": "9841234567",
                "type": "Individual",
                "allow_duplicate_phone": "true",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Customer.objects.count(), 2)

    def test_unique_phone_creates_customer_without_conflict(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        resp = self.client.post(
            "/api/crm/customers/",
            {
                "name": "Unique Customer",
                "phone": "9801112233",
                "type": "Individual",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Customer.objects.count(), 2)


class TestDriveTransitionAndDoublBookingTest(APITestCase):
    """Part 4: test drive unit allocation, double booking prevention, and pipeline transitions."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin_td", email="admin_td@example.com", password="pw"
        )
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit

        cls.batch = ImportBatch.objects.create(batch_no="TD-BATCH-001")
        cls.v_model = VehicleModel.objects.create(brand="VT", model_name="MegaBus X1")
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-TD-TEST-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        cls.lead = Lead.objects.create(
            first_name="Test", last_name="Driver",
            phone="9820000001", vehicle="MegaBus X1",
        )

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "admin_td", "password": "pw"})
        return resp.json()["access"]

    def _auth(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")

    def test_create_test_drive_with_unit_logs_activity(self):
        self._auth()
        resp = self.client.post("/api/crm/test-drives/", {
            "lead": self.lead.pk,
            "vehicle": "MegaBus X1",
            "unit": self.unit.pk,
            "date": "2027-01-15",
            "time": "10:00",
            "status": "scheduled",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        # Activity must be created for the scheduling
        self.assertTrue(
            Activity.objects.filter(lead=self.lead, type=Activity.Type.TEST_DRIVE).exists()
        )

    def test_double_booking_same_unit_overlapping_window_rejected(self):
        """Two test drives on the same unit at the same time must be rejected."""
        self._auth()
        resp1 = self.client.post("/api/crm/test-drives/", {
            "lead": self.lead.pk,
            "vehicle": "MegaBus X1",
            "unit": self.unit.pk,
            "date": "2027-02-01",
            "time": "11:00",
            "status": "scheduled",
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.content)

        # Second booking at same time on the same unit must fail
        lead2 = Lead.objects.create(
            first_name="Another", last_name="Person",
            phone="9820000002", vehicle="MegaBus X1",
        )
        resp2 = self.client.post("/api/crm/test-drives/", {
            "lead": lead2.pk,
            "vehicle": "MegaBus X1",
            "unit": self.unit.pk,
            "date": "2027-02-01",
            "time": "11:30",  # Within the 60-minute window
            "status": "scheduled",
        })
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST, resp2.content)
        self.assertIn("unit", resp2.json())

    def test_double_booking_outside_window_allowed(self):
        """Booking more than 60 minutes apart must succeed."""
        self._auth()
        resp1 = self.client.post("/api/crm/test-drives/", {
            "lead": self.lead.pk,
            "vehicle": "MegaBus X1",
            "unit": self.unit.pk,
            "date": "2027-03-01",
            "time": "09:00",
            "status": "scheduled",
        })
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED, resp1.content)

        lead3 = Lead.objects.create(
            first_name="Third", last_name="Person",
            phone="9820000003", vehicle="MegaBus X1",
        )
        resp2 = self.client.post("/api/crm/test-drives/", {
            "lead": lead3.pk,
            "vehicle": "MegaBus X1",
            "unit": self.unit.pk,
            "date": "2027-03-01",
            "time": "10:30",  # More than 60 minutes after 09:00
            "status": "scheduled",
        })
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED, resp2.content)

    def test_valid_transition_requested_to_scheduled(self):
        """requested -> scheduled must be accepted."""
        from crm.services.pipeline import validate_test_drive_transition
        # No error should be raised
        validate_test_drive_transition("requested", "scheduled")

    def test_valid_transition_scheduled_to_confirmed(self):
        from crm.services.pipeline import validate_test_drive_transition
        validate_test_drive_transition("scheduled", "confirmed")

    def test_valid_transition_confirmed_to_completed(self):
        from crm.services.pipeline import validate_test_drive_transition
        validate_test_drive_transition("confirmed", "completed")

    def test_invalid_transition_requested_to_completed_rejected(self):
        """requested -> completed must raise ValidationError (not in allowed map)."""
        from crm.services.pipeline import validate_test_drive_transition
        from rest_framework.exceptions import ValidationError as DRFValidationError
        with self.assertRaises(DRFValidationError):
            validate_test_drive_transition("requested", "completed")

    def test_invalid_transition_from_final_status_rejected(self):
        """completed -> scheduled must be rejected."""
        from crm.services.pipeline import validate_test_drive_transition
        from rest_framework.exceptions import ValidationError as DRFValidationError
        with self.assertRaises(DRFValidationError):
            validate_test_drive_transition("completed", "scheduled")

    def test_status_change_via_api_logs_activity(self):
        """Updating test drive status via API logs an Activity with the user."""
        self._auth()
        td = TestDrive.objects.create(
            lead=self.lead,
            vehicle="MegaBus X1",
            date="2027-04-01",
            time="14:00",
            status=TestDrive.Status.REQUESTED,
        )
        resp = self.client.patch(f"/api/crm/test-drives/{td.pk}/", {"status": "scheduled"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertTrue(
            Activity.objects.filter(lead=self.lead, type=Activity.Type.STATUS_CHANGE).exists()
        )


class QuotationRejectionPipelineTest(APITestCase):
    """Part 4: quotation rejection/expiry releases reserved unit and reverts lead pipeline stage."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin_qt2", email="admin_qt2@example.com", password="pw"
        )
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit

        cls.batch = ImportBatch.objects.create(batch_no="QT-BATCH-001")
        cls.v_model = VehicleModel.objects.create(brand="VT", model_name="Compact Z2")
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-QT-TEST-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        cls.lead = Lead.objects.create(
            first_name="Quotation", last_name="Tester",
            phone="9830000001", vehicle="Compact Z2",
            status=Lead.Status.QUALIFIED,
        )

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "admin_qt2", "password": "pw"})
        return resp.json()["access"]

    def test_quotation_rejection_reverts_lead_pipeline_and_logs_activity(self):
        """Rejecting the only active quotation on a lead reverts lead status to contacted."""
        from crm.services.pipeline import handle_quotation_rejection_or_expiry

        qt = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Compact Z2",
            vehicle_price=3500000,
            status=Quotation.Status.SENT,
        )
        # Lead is QUALIFIED; after rejection with no other active quotes, must revert
        qt.status = Quotation.Status.REJECTED
        qt.save(update_fields=["status", "updated_at"])
        handle_quotation_rejection_or_expiry(qt, user=self.user)

        self.lead.refresh_from_db()
        self.assertEqual(self.lead.status, Lead.Status.CONTACTED)
        # Activity logged for pipeline revert
        self.assertTrue(Activity.objects.filter(lead=self.lead).exists())

    def test_quotation_rejection_with_other_active_quote_does_not_revert(self):
        """If another active quotation exists, lead status must not revert."""
        from crm.services.pipeline import handle_quotation_rejection_or_expiry

        # Reset lead to QUALIFIED
        self.lead.status = Lead.Status.QUALIFIED
        self.lead.save(update_fields=["status", "updated_at"])

        qt1 = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Compact Z2",
            vehicle_price=3500000,
            status=Quotation.Status.SENT,
        )
        # Second active quotation
        Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Compact Z2",
            vehicle_price=3600000,
            status=Quotation.Status.DRAFT,
        )
        qt1.status = Quotation.Status.REJECTED
        qt1.save(update_fields=["status", "updated_at"])
        handle_quotation_rejection_or_expiry(qt1, user=self.user)

        self.lead.refresh_from_db()
        # Lead must remain QUALIFIED because a second active quote exists
        self.assertEqual(self.lead.status, Lead.Status.QUALIFIED)


class UnitReservationTest(APITestCase):
    """Part 5: reserve_unit_for_quotation and single-active-reservation constraint."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin_res", email="admin_res@example.com", password="pw"
        )
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit

        cls.batch = ImportBatch.objects.create(batch_no="RES-BATCH-001")
        cls.v_model = VehicleModel.objects.create(brand="VT", model_name="Reserve Test Model")
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RES-TEST-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        cls.lead = Lead.objects.create(
            first_name="Reserv", last_name="Tester",
            phone="9840000001", vehicle="Reserve Test Model",
        )

    def _make_quotation(self, **kwargs):
        defaults = dict(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Reserve Test Model",
            vehicle_price=2000000,
            status=Quotation.Status.DRAFT,
        )
        defaults.update(kwargs)
        return Quotation.objects.create(**defaults)

    def test_reserve_unit_sets_reserved_unit_and_expiry(self):
        from crm.services.pipeline import reserve_unit_for_quotation
        from inventory.models import VehicleUnit

        qt = self._make_quotation()
        reserve_unit_for_quotation(qt, self.unit, user=self.user, days=7)
        qt.refresh_from_db()
        self.unit.refresh_from_db()

        self.assertEqual(qt.reserved_unit_id, self.unit.pk)
        self.assertIsNotNone(qt.reservation_expires_at)
        self.assertEqual(self.unit.status, VehicleUnit.Status.RESERVED)

    def test_reserve_unit_logs_activity(self):
        from crm.services.pipeline import reserve_unit_for_quotation
        from inventory.models import VehicleUnit

        # Use a fresh unit to avoid interference
        unit2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RES-TEST-002",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        qt = self._make_quotation()
        reserve_unit_for_quotation(qt, unit2, user=self.user, days=7)
        self.assertTrue(
            Activity.objects.filter(lead=self.lead).exists()
        )

    def test_double_reservation_same_unit_rejected(self):
        """Reserving a unit already reserved by another active quotation must raise ValidationError."""
        from crm.services.pipeline import reserve_unit_for_quotation
        from inventory.models import VehicleUnit
        from rest_framework.exceptions import ValidationError as DRFValidationError

        unit3 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RES-TEST-003",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        lead2 = Lead.objects.create(
            first_name="Second", last_name="Buyer",
            phone="9840000002", vehicle="Reserve Test Model",
        )
        qt1 = self._make_quotation()
        qt2 = Quotation.objects.create(
            lead=lead2,
            vehicle_model=self.v_model,
            vehicle="Reserve Test Model",
            vehicle_price=2000000,
            status=Quotation.Status.DRAFT,
        )
        reserve_unit_for_quotation(qt1, unit3, user=self.user, days=7)

        # Second quotation trying to reserve the same unit must fail
        with self.assertRaises(DRFValidationError):
            reserve_unit_for_quotation(qt2, unit3, user=self.user, days=7)

    def test_reserve_advances_lead_status_from_new_to_qualified(self):
        from crm.services.pipeline import reserve_unit_for_quotation
        from inventory.models import VehicleUnit

        unit4 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RES-TEST-004",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        fresh_lead = Lead.objects.create(
            first_name="New", last_name="Buyer",
            phone="9840000003", vehicle="Reserve Test Model",
            status=Lead.Status.NEW,
        )
        qt = Quotation.objects.create(
            lead=fresh_lead,
            vehicle_model=self.v_model,
            vehicle="Reserve Test Model",
            vehicle_price=2000000,
            status=Quotation.Status.DRAFT,
        )
        reserve_unit_for_quotation(qt, unit4, user=self.user, days=7)
        fresh_lead.refresh_from_db()
        self.assertEqual(fresh_lead.status, Lead.Status.QUALIFIED)


class ExpireReservationsCommandTest(APITestCase):
    """Part 5: expire_reservations management command behaviour."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="admin_exp", email="admin_exp@example.com", password="pw"
        )
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit

        cls.batch = ImportBatch.objects.create(batch_no="EXP-BATCH-001")
        cls.v_model = VehicleModel.objects.create(brand="VT", model_name="Expiry Test Model")
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-EXP-TEST-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            status=VehicleUnit.Status.RESERVED,
        )
        cls.lead = Lead.objects.create(
            first_name="Expiry", last_name="Test",
            phone="9850000001", vehicle="Expiry Test Model",
        )

    def test_command_expires_overdue_reservation(self):
        from django.utils import timezone
        from inventory.models import VehicleUnit
        from io import StringIO
        from django.core.management import call_command

        # Create a quotation with an expired reservation timestamp
        qt = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Expiry Test Model",
            vehicle_price=1500000,
            status=Quotation.Status.SENT,
            reserved_unit=self.unit,
            reservation_expires_at=timezone.now() - datetime.timedelta(hours=1),
        )

        out = StringIO()
        call_command("expire_reservations", stdout=out)

        qt.refresh_from_db()
        self.unit.refresh_from_db()

        self.assertEqual(qt.status, Quotation.Status.EXPIRED)
        self.assertIsNone(qt.reserved_unit)
        self.assertEqual(self.unit.status, VehicleUnit.Status.READY_FOR_SALE)

    def test_command_dry_run_does_not_modify(self):
        from django.utils import timezone
        from inventory.models import VehicleUnit
        from io import StringIO
        from django.core.management import call_command

        unit2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-EXP-TEST-002",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.RESERVED,
        )
        qt2 = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Expiry Test Model",
            vehicle_price=1500000,
            status=Quotation.Status.SENT,
            reserved_unit=unit2,
            reservation_expires_at=timezone.now() - datetime.timedelta(hours=2),
        )

        out = StringIO()
        call_command("expire_reservations", "--dry-run", stdout=out)

        qt2.refresh_from_db()
        unit2.refresh_from_db()
        # Dry run: nothing must change
        self.assertEqual(qt2.status, Quotation.Status.SENT)
        self.assertEqual(unit2.status, VehicleUnit.Status.RESERVED)

    def test_command_skips_future_reservations(self):
        from django.utils import timezone
        from inventory.models import VehicleUnit
        from io import StringIO
        from django.core.management import call_command

        unit3 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-EXP-TEST-003",
            vehicle_model=self.v_model,
            import_batch=self.batch,
            status=VehicleUnit.Status.RESERVED,
        )
        qt3 = Quotation.objects.create(
            lead=self.lead,
            vehicle_model=self.v_model,
            vehicle="Expiry Test Model",
            vehicle_price=1500000,
            status=Quotation.Status.SENT,
            reserved_unit=unit3,
            reservation_expires_at=timezone.now() + datetime.timedelta(days=5),
        )

        out = StringIO()
        call_command("expire_reservations", stdout=out)

        qt3.refresh_from_db()
        # Not expired yet: status must be unchanged
        self.assertEqual(qt3.status, Quotation.Status.SENT)


class CompanyBrandingApiTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="brandadmin", email="brandadmin@example.com", password="pw"
        )
        cls.plain_user = User.objects.create_user(
            username="plainuser", email="plainuser@example.com", password="pw"
        )
        cls.lead = Lead.objects.create(
            first_name="Test", last_name="Customer", email="test@example.com"
        )
        cls.quote = Quotation.objects.create(
            lead=cls.lead,
            vehicle="VT EV Cargo",
            vehicle_price=2500000,
            vat_rate=13,
            status=Quotation.Status.DRAFT,
        )

    def _token(self, user):
        resp = self.client.post("/api/auth/token/", {"username": user.username, "password": "pw"})
        return resp.json()["access"]

    def test_branding_permissions(self):
        # Anonymous: 401
        resp = self.client.get("/api/crm/branding/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Non-staff / no perm: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.plain_user)}")
        resp = self.client.get("/api/crm/branding/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin: 200
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.admin)}")
        resp = self.client.get("/api/crm/branding/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("letterhead_url", resp.json())

    def test_letterhead_upload_and_pdf_generation(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image
        import io

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.admin)}")

        # 1. PDF generation with NO letterhead (clean fallback)
        branding = CompanyBranding.get_instance()
        branding.letterhead_image = None
        branding.save()

        pdf_url = reverse("crm-quotation-pdf", kwargs={"pk": self.quote.pk})
        resp = self.client.get(pdf_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn(b"%PDF", resp.content)

        # 2. Test rejection of invalid file type
        bad_file = SimpleUploadedFile("script.sh", b"echo 'bad'", content_type="text/plain")
        bad_resp = self.client.post(
            "/api/crm/branding/upload-letterhead/",
            {"letterhead": bad_file},
            format="multipart",
        )
        self.assertEqual(bad_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Upload image letterhead
        img = Image.new("RGB", (200, 200), color=(10, 50, 100))
        img_buf = io.BytesIO()
        img.save(img_buf, format="PNG")
        img_file = SimpleUploadedFile("letterhead.png", img_buf.getvalue(), content_type="image/png")

        upload_resp = self.client.post(
            "/api/crm/branding/upload-letterhead/",
            {"letterhead": img_file},
            format="multipart",
        )
        self.assertEqual(upload_resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(upload_resp.json().get("letterhead_url"))

        # 4. PDF generation WITH image letterhead
        resp_with_img = self.client.get(pdf_url)
        self.assertEqual(resp_with_img.status_code, status.HTTP_200_OK)
        self.assertIn(b"%PDF", resp_with_img.content)

        # 5. Remove letterhead endpoint test
        remove_resp = self.client.post("/api/crm/branding/remove-letterhead/")
        self.assertEqual(remove_resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(remove_resp.json().get("letterhead_url"))
        branding.refresh_from_db()
        self.assertFalse(bool(branding.letterhead_image))

        # 6. Cleanup
        if branding.letterhead_image:
            branding.letterhead_image.delete(save=False)
        branding.letterhead_image = None
        branding.save()


class QuotationReferenceNoTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from inventory.models import VehicleModel
        cls.user = User.objects.create_superuser(
            username="refadmin", email="refadmin@example.com", password="pw"
        )
        cls.lead = Lead.objects.create(
            first_name="Sita", last_name="Sharma", email="sita@example.com"
        )
        cls.v_model = VehicleModel.objects.create(
            brand="VT", model_name="FD-EV-REF"
        )

    def _token(self):
        resp = self.client.post("/api/auth/token/", {"username": "refadmin", "password": "pw"})
        return resp.json()["access"]

    def test_create_and_update_quotation_reference_no(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token()}")
        # 1. Create quotation with reference_no
        payload = {
            "lead": self.lead.pk,
            "vehicle_model": self.v_model.pk,
            "vehicle": "VT FD-EV-REF",
            "vehicle_price": 2000000,
            "reference_no": "PO-KTM-2026-001",
        }
        resp = self.client.post("/api/crm/quotations/", payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        data = resp.json()
        quote_id = data["id"]
        self.assertEqual(data["reference_no"], "PO-KTM-2026-001")

        # 2. Update reference_no via PATCH
        patch_resp = self.client.patch(
            f"/api/crm/quotations/{quote_id}/",
            {"reference_no": "PO-KTM-2026-001-REV"},
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_resp.json()["reference_no"], "PO-KTM-2026-001-REV")

        # 3. Verify PDF generation includes reference_no
        pdf_resp = self.client.get(f"/api/crm/quotations/{quote_id}/pdf/")
        self.assertEqual(pdf_resp.status_code, status.HTTP_200_OK)
        self.assertIn(b"%PDF", pdf_resp.content)
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(pdf_resp.content))
        text = "".join(p.extract_text() for p in reader.pages)
        self.assertIn("PO-KTM-2026-001-REV", text)


class QuotationUuidTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from inventory.models import VehicleModel
        cls.admin = User.objects.create_superuser(
            username="uuidadmin", email="uuidadmin@example.com", password="pw"
        )
        cls.plain_user = User.objects.create_user(
            username="plainuuiduser", email="plainuuiduser@example.com", password="pw"
        )
        cls.lead = Lead.objects.create(
            first_name="Hari", last_name="Prasad", email="hari@example.com"
        )
        cls.v_model = VehicleModel.objects.create(
            brand="VT", model_name="FD-EV-UUID"
        )
        cls.q1 = Quotation.objects.create(
            lead=cls.lead,
            vehicle_model=cls.v_model,
            vehicle="VT FD-EV-UUID",
            vehicle_price=2200000,
        )
        cls.q2 = Quotation.objects.create(
            lead=cls.lead,
            vehicle_model=cls.v_model,
            vehicle="VT FD-EV-UUID",
            vehicle_price=2200000,
        )

    def _token(self, user):
        resp = self.client.post("/api/auth/token/", {"username": user.username, "password": "pw"})
        return resp.json()["access"]

    def test_uuid_generation_and_uniqueness(self):
        self.assertIsNotNone(self.q1.uuid)
        self.assertIsNotNone(self.q2.uuid)
        self.assertNotEqual(self.q1.uuid, self.q2.uuid)

    def test_by_uuid_endpoint_permissions(self):
        uuid_str = str(self.q1.uuid)
        endpoint = f"/api/crm/quotations/by-uuid/{uuid_str}/"

        # Anonymous: 401
        anon_resp = self.client.get(endpoint)
        self.assertEqual(anon_resp.status_code, status.HTTP_401_UNAUTHORIZED)

        # Non-staff without crm.view_quotation: 403
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.plain_user)}")
        forbidden_resp = self.client.get(endpoint)
        self.assertEqual(forbidden_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin: 200
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.admin)}")
        ok_resp = self.client.get(endpoint)
        self.assertEqual(ok_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ok_resp.json()["uuid"], uuid_str)
        self.assertEqual(ok_resp.json()["id"], str(self.q1.pk))

        # Unknown UUID: 404
        import uuid as uuid_lib
        unknown_uuid = str(uuid_lib.uuid4())
        not_found_resp = self.client.get(f"/api/crm/quotations/by-uuid/{unknown_uuid}/")
        self.assertEqual(not_found_resp.status_code, status.HTTP_404_NOT_FOUND)


class QuotationRevisionTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from inventory.models import ImportBatch, VehicleModel, VehicleUnit
        cls.admin = User.objects.create_superuser(
            username="revadmin", email="revadmin@example.com", password="pw"
        )
        cls.staff = User.objects.create_user(
            username="revstaff", email="revstaff@example.com", password="pw", is_staff=True
        )
        from django.contrib.auth.models import Permission
        p_view = Permission.objects.get(codename="view_quotation")
        p_change = Permission.objects.get(codename="change_quotation")
        p_add = Permission.objects.get(codename="add_quotation")
        cls.staff.user_permissions.add(p_view, p_change, p_add)

        cls.lead = Lead.objects.create(
            first_name="Sita", last_name="Sharma", email="sita@example.com"
        )
        cls.batch = ImportBatch.objects.create(batch_no="REV-BATCH-001")
        cls.v_model = VehicleModel.objects.create(
            brand="VT", model_name="FD-EV-REV"
        )
        cls.unit1 = VehicleUnit.objects.create(
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            vin_chassis_no="VINREV001",
            status=VehicleUnit.Status.RESERVED,
        )
        cls.unit_prop = VehicleUnit.objects.create(
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            vin_chassis_no="VINPROP001",
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        # Original quotation with reserved unit
        cls.orig = Quotation.objects.create(
            lead=cls.lead,
            vehicle_model=cls.v_model,
            unit=cls.unit_prop,
            reserved_unit=cls.unit1,
            reservation_expires_at=timezone.now() + timezone.timedelta(days=7),
            vehicle="VT FD-EV-REV",
            vehicle_price=2500000,
            reference_no="PO-REV-001",
            notes="Initial proposal",
        )

    def _token(self, user):
        resp = self.client.post("/api/auth/token/", {"username": user.username, "password": "pw"})
        return resp.json()["access"]

    def test_original_display_id_and_defaults(self):
        self.assertEqual(self.orig.display_id, f"QT-{self.orig.pk:04d}")
        self.assertEqual(self.orig.revision_number, 0)
        self.assertTrue(self.orig.is_latest)
        self.assertIsNone(self.orig.parent)
        self.assertIsNone(self.orig.root)

    def test_revise_creates_new_revision_and_unreserved_start(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        url = f"/api/crm/quotations/{self.orig.pk}/revise/"
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()

        # Check display ID and sequence
        rev1_id = data["id"]
        rev1 = Quotation.objects.get(pk=rev1_id)
        self.assertEqual(rev1.revision_number, 1)
        self.assertEqual(rev1.display_id, f"QT-{self.orig.pk:04d}-R1")
        self.assertTrue(rev1.is_latest)
        self.assertEqual(rev1.parent_id, self.orig.pk)
        self.assertEqual(rev1.root_id, self.orig.pk)
        self.assertEqual(rev1.status, Quotation.Status.DRAFT)
        self.assertEqual(rev1.vehicle_price, self.orig.vehicle_price)
        self.assertEqual(rev1.reference_no, self.orig.reference_no)
        self.assertEqual(rev1.unit_id, self.unit_prop.pk)

        # Per Step 0.4: Starts unreserved, old revision reservation is untouched
        self.assertIsNone(rev1.reserved_unit)
        self.assertIsNone(rev1.reservation_expires_at)

        # Check old quotation: is_latest=False, reserved_unit still intact
        self.orig.refresh_from_db()
        self.assertFalse(self.orig.is_latest)
        self.assertEqual(self.orig.reserved_unit_id, self.unit1.pk)
        self.assertIsNotNone(self.orig.reservation_expires_at)

        # Revise again to create R2
        resp2 = self.client.post(f"/api/crm/quotations/{rev1.pk}/revise/")
        self.assertEqual(resp2.status_code, status.HTTP_201_CREATED)
        rev2_id = resp2.json()["id"]
        rev2 = Quotation.objects.get(pk=rev2_id)
        self.assertEqual(rev2.revision_number, 2)
        self.assertEqual(rev2.display_id, f"QT-{self.orig.pk:04d}-R2")
        self.assertTrue(rev2.is_latest)
        self.assertEqual(rev2.parent_id, rev1.pk)
        self.assertEqual(rev2.root_id, self.orig.pk)

        # rev1 is no longer latest
        rev1.refresh_from_db()
        self.assertFalse(rev1.is_latest)

    def test_revisions_chain_endpoint(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        # Revise orig -> rev1 -> rev2
        self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")
        rev1 = Quotation.objects.filter(root=self.orig, revision_number=1).first()
        self.client.post(f"/api/crm/quotations/{rev1.pk}/revise/")

        # Query /revisions/ on rev1
        resp = self.client.get(f"/api/crm/quotations/{rev1.pk}/revisions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.json()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["display_id"], f"QT-{self.orig.pk:04d}")
        self.assertEqual(rows[1]["display_id"], f"QT-{self.orig.pk:04d}-R1")
        self.assertEqual(rows[2]["display_id"], f"QT-{self.orig.pk:04d}-R2")

    def test_list_filters_to_is_latest_by_default(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")

        # Default list: only is_latest=True
        list_resp = self.client.get("/api/crm/quotations/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.json()
        ids = [str(r["id"]) for r in results]
        self.assertNotIn(str(self.orig.pk), ids)

        # all_revisions=true: includes historical revisions
        all_resp = self.client.get("/api/crm/quotations/?all_revisions=true")
        self.assertEqual(all_resp.status_code, status.HTTP_200_OK)
        all_ids = [str(r["id"]) for r in all_resp.json()]
        self.assertIn(str(self.orig.pk), all_ids)

    def test_historical_revision_is_read_only(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")

        # Attempt to edit old revision
        patch_resp = self.client.patch(
            f"/api/crm/quotations/{self.orig.pk}/",
            {"notes": "Attempted edit on historical revision"},
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Historical quotation revisions are read-only", str(patch_resp.data))

    def test_cannot_delete_quotation_with_child_revisions(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.admin)}")
        self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")

        del_resp = self.client.delete(f"/api/crm/quotations/{self.orig.pk}/")
        self.assertEqual(del_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Quotation.objects.filter(pk=self.orig.pk).exists())

    def test_revise_with_updated_payload_and_status(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        url = f"/api/crm/quotations/{self.orig.pk}/revise/"
        payload = {
            "vehicle_price": 1200000,
            "accessories": 50000,
            "discount": 20000,
            "reference_no": "PO-REVISED-2026",
            "notes": "Updated pricing for client review",
            "status": "sent",
        }
        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        rev = Quotation.objects.get(pk=resp.json()["id"])
        self.assertEqual(rev.revision_number, 1)
        self.assertEqual(rev.status, Quotation.Status.SENT)
        self.assertEqual(float(rev.vehicle_price), 1200000.0)
        self.assertEqual(float(rev.accessories), 50000.0)
        self.assertEqual(float(rev.discount), 20000.0)
        self.assertEqual(rev.reference_no, "PO-REVISED-2026")
        self.assertEqual(rev.notes, "Updated pricing for client review")
        self.assertTrue(rev.is_latest)

    def test_edit_does_not_create_revision_and_writes_audit_log(self):
        from common.models import AuditLog

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.staff)}")
        initial_count = Quotation.objects.count()
        patch_resp = self.client.patch(
            f"/api/crm/quotations/{self.orig.pk}/",
            {"vehicle_price": 2750000, "notes": "Corrected vehicle price error in-place"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        # Verify no new quotation was created
        self.assertEqual(Quotation.objects.count(), initial_count)
        self.orig.refresh_from_db()
        self.assertEqual(self.orig.revision_number, 0)
        self.assertEqual(float(self.orig.vehicle_price), 2750000.0)
        self.assertEqual(self.orig.notes, "Corrected vehicle price error in-place")

        # Verify audit log entries with before and after values and user
        audit_entries = AuditLog.objects.filter(
            object_id=str(self.orig.pk),
            source="QUOTATION_EDIT",
        )
        self.assertTrue(audit_entries.exists())
        price_audit = audit_entries.filter(field_name="vehicle_price").first()
        self.assertIsNotNone(price_audit)
        self.assertEqual(price_audit.old_value, "2500000.00")
        self.assertEqual(price_audit.new_value, "2750000.00")
        self.assertEqual(price_audit.changed_by, self.staff)

        notes_audit = audit_entries.filter(field_name="notes").first()
        self.assertIsNotNone(notes_audit)
        self.assertEqual(notes_audit.old_value, "Initial proposal")
        self.assertEqual(notes_audit.new_value, "Corrected vehicle price error in-place")
        self.assertEqual(notes_audit.changed_by, self.staff)

    def test_permissions_enforced_for_edit_and_revise(self):
        from django.contrib.auth.models import Permission

        limited_user = User.objects.create_user(
            username="limited_quotation_user", password="pw"
        )
        p_view = Permission.objects.get(codename="view_quotation")
        limited_user.user_permissions.add(p_view)
        token = self._token(limited_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Try to edit: denied
        patch_resp = self.client.patch(
            f"/api/crm/quotations/{self.orig.pk}/",
            {"notes": "Unauthorized edit"},
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Try to revise: denied
        revise_resp = self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")
        self.assertEqual(revise_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Grant edit_quotation only
        p_edit = Permission.objects.get(codename="edit_quotation")
        limited_user.user_permissions.add(p_edit)
        if hasattr(limited_user, "_perm_cache"):
            del limited_user._perm_cache

        patch_resp2 = self.client.patch(
            f"/api/crm/quotations/{self.orig.pk}/",
            {"notes": "Authorized edit"},
        )
        self.assertEqual(patch_resp2.status_code, status.HTTP_200_OK)

        # Still cannot revise
        revise_resp2 = self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")
        self.assertEqual(revise_resp2.status_code, status.HTTP_403_FORBIDDEN)

        # Grant revise_quotation
        p_revise = Permission.objects.get(codename="revise_quotation")
        limited_user.user_permissions.add(p_revise)
        if hasattr(limited_user, "_perm_cache"):
            del limited_user._perm_cache

        revise_resp3 = self.client.post(f"/api/crm/quotations/{self.orig.pk}/revise/")
        self.assertEqual(revise_resp3.status_code, status.HTTP_201_CREATED)


class DocumentVaultTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from accounts.models import UserProfile
        from dealers.models import Dealer
        from django.contrib.auth.models import Permission
        from inventory.models import VehicleModel

        cls.admin = User.objects.create_superuser(
            username="vault_admin", email="vault_admin@example.com", password="pw"
        )
        cls.ho_user = User.objects.create_user(
            username="vault_ho_user", email="ho@example.com", password="pw"
        )
        for perm_name in ["view_document", "add_document", "change_document", "delete_document"]:
            cls.ho_user.user_permissions.add(Permission.objects.get(codename=perm_name))

        cls.dealer = Dealer.objects.create(name="Lalitpur Motors")
        cls.dealer_user = User.objects.create_user(
            username="vault_dealer_staff", email="dlr@example.com", password="pw"
        )
        UserProfile.objects.create(user=cls.dealer_user, dealer=cls.dealer)
        for perm_name in ["view_document", "add_document", "change_document", "delete_document"]:
            cls.dealer_user.user_permissions.add(Permission.objects.get(codename=perm_name))

        cls.model = VehicleModel.objects.create(brand="VT", model_name="e-Transit", is_active=True)

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def test_document_upload_validation_and_file_hash(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        # 1. Valid PDF upload
        f = SimpleUploadedFile("bill_of_lading.pdf", b"%PDF-1.4 sample content for doc", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp = self.client.post(
            "/api/crm/documents/",
            {"title": "Sea Waybill", "category": "SHIPPING", "file": f},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["title"], "Sea Waybill")
        self.assertEqual(resp.data["category"], "SHIPPING")
        self.assertIsNotNone(resp.data.get("file_hash"))
        self.assertEqual(resp.data.get("version"), 1)

        # 2. Invalid file type rejected (executable/binary script)
        bad_f = SimpleUploadedFile("danger.exe", b"MZexecutabledata", content_type="application/x-msdownload")
        resp_bad = self.client.post(
            "/api/crm/documents/",
            {"title": "Bad File", "category": "OTHER", "file": bad_f},
            format="multipart",
        )
        self.assertEqual(resp_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Oversized file rejected (> 10MB)
        big_content = b"0" * (10 * 1024 * 1024 + 1024)
        big_f = SimpleUploadedFile("large.pdf", big_content, content_type="application/pdf")
        resp_big = self.client.post(
            "/api/crm/documents/",
            {"title": "Oversized Document", "category": "OTHER", "file": big_f},
            format="multipart",
        )
        self.assertEqual(resp_big.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_hash_warning_and_force(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        content = b"%PDF-1.4 duplicate test content 12345"
        f1 = SimpleUploadedFile("first.pdf", content, content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp1 = self.client.post(
            "/api/crm/documents/",
            {"title": "First Upload", "category": "COMPLIANCE", "file": f1},
            format="multipart",
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        doc1_id = resp1.data["id"]

        # Duplicate upload returns 409 Conflict with duplicate warning
        f2 = SimpleUploadedFile("duplicate.pdf", content, content_type="application/pdf")
        resp2 = self.client.post(
            "/api/crm/documents/",
            {"title": "Duplicate Upload", "category": "COMPLIANCE", "file": f2},
            format="multipart",
        )
        self.assertEqual(resp2.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(resp2.data.get("duplicate_warning"))
        self.assertEqual(resp2.data.get("existing_document", {}).get("id"), doc1_id)

        # Force upload succeeds
        f3 = SimpleUploadedFile("forced.pdf", content, content_type="application/pdf")
        resp3 = self.client.post(
            "/api/crm/documents/",
            {"title": "Forced Duplicate", "category": "COMPLIANCE", "file": f3, "force_duplicate": "true"},
            format="multipart",
        )
        self.assertEqual(resp3.status_code, status.HTTP_201_CREATED)

    def test_multi_record_assignment_attach_and_detach(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from inventory.models import ImportBatch, VehicleUnit
        from crm.models import Document

        f = SimpleUploadedFile("multi_assign.pdf", b"%PDF-1.4 assignment content", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        create_resp = self.client.post(
            "/api/crm/documents/",
            {"title": "Customs Assessment", "category": "CUSTOMS", "file": f},
            format="multipart",
        )
        doc_id = create_resp.data["id"]

        batch = ImportBatch.objects.create()
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DOC-ASSIGN-01", vehicle_model=self.model, import_batch=batch
        )

        # Attach to shipment
        att_shp = self.client.post(
            f"/api/crm/documents/{doc_id}/attach/",
            {"shipment": batch.id},
            format="json",
        )
        self.assertEqual(att_shp.status_code, status.HTTP_200_OK)

        # Attach to unit
        att_unit = self.client.post(
            f"/api/crm/documents/{doc_id}/attach/",
            {"unit": unit.id},
            format="json",
        )
        self.assertEqual(att_unit.status_code, status.HTTP_200_OK)

        doc = Document.objects.get(id=doc_id)
        self.assertEqual(doc.attachments.count(), 2)

        # Detach from shipment
        detach_shp = self.client.post(
            f"/api/crm/documents/{doc_id}/detach/",
            {"shipment": batch.id},
            format="json",
        )
        self.assertEqual(detach_shp.status_code, status.HTTP_200_OK)
        self.assertEqual(doc.attachments.count(), 1)
        self.assertEqual(doc.attachments.first().unit_id, unit.id)

    def test_replace_file_creates_version_history(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from crm.models import Document

        f1 = SimpleUploadedFile("invoice_v1.pdf", b"%PDF-1.4 initial version v1", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp1 = self.client.post(
            "/api/crm/documents/",
            {"title": "Commercial Invoice", "category": "COMMERCIAL", "file": f1},
            format="multipart",
        )
        doc_id = resp1.data["id"]
        old_hash = resp1.data["file_hash"]

        # Replace file with v2
        f2 = SimpleUploadedFile("invoice_v2.pdf", b"%PDF-1.4 updated version v2 content", content_type="application/pdf")
        resp_replace = self.client.post(
            f"/api/crm/documents/{doc_id}/replace-file/",
            {"file": f2, "change_note": "Updated payment terms on page 2"},
            format="multipart",
        )
        self.assertEqual(resp_replace.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_replace.data.get("version"), 2)
        self.assertNotEqual(resp_replace.data.get("file_hash"), old_hash)

        # Verify DocumentVersion in DB
        doc = Document.objects.get(id=doc_id)
        self.assertEqual(doc.versions.count(), 1)
        v1 = doc.versions.first()
        self.assertEqual(v1.version_no, 1)
        self.assertEqual(v1.file_hash, old_hash)
        self.assertEqual(v1.change_note, "Updated payment terms on page 2")

    def test_secure_serving_and_dealer_scoping(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from inventory.models import VehicleUnit
        from crm.models import Document, DocumentAttachment

        f = SimpleUploadedFile("ho_contract.pdf", b"%PDF-1.4 secure ho document", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        create_resp = self.client.post(
            "/api/crm/documents/",
            {"title": "HO Contract", "category": "LEGAL", "file": f},
            format="multipart",
        )
        doc_id = create_resp.data["id"]

        # 1. Unauthenticated request -> 401
        self.client.credentials()
        resp_unauth = self.client.get(f"/api/crm/documents/{doc_id}/preview/")
        self.assertEqual(resp_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. HO user preview -> 200 with inline disposition
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp_prev = self.client.get(f"/api/crm/documents/{doc_id}/preview/")
        self.assertEqual(resp_prev.status_code, status.HTTP_200_OK)
        self.assertIn("inline", resp_prev.headers.get("Content-Disposition", ""))

        # 3. HO user download -> 200 with attachment disposition
        resp_down = self.client.get(f"/api/crm/documents/{doc_id}/download/")
        self.assertEqual(resp_down.status_code, status.HTTP_200_OK)
        self.assertIn("attachment", resp_down.headers.get("Content-Disposition", ""))

        # 4. Dealer user cannot access HO document not linked to their dealership -> 403 / 404
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.dealer_user)}")
        resp_dealer_denied = self.client.get(f"/api/crm/documents/{doc_id}/preview/")
        self.assertIn(resp_dealer_denied.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 5. Attach document to dealer's unit -> Dealer user can now access
        from inventory.models import ImportBatch
        batch = ImportBatch.objects.create()
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DLR-DOC-01",
            vehicle_model=self.model,
            dealer=self.dealer,
            import_batch=batch,
        )
        doc = Document.objects.get(id=doc_id)
        DocumentAttachment.objects.create(document=doc, unit=unit, created_by=self.ho_user)

        resp_dealer_allowed = self.client.get(f"/api/crm/documents/{doc_id}/preview/")
        self.assertEqual(resp_dealer_allowed.status_code, status.HTTP_200_OK)

    def test_soft_delete_with_reason_and_in_use_warning(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from inventory.models import ImportBatch, VehicleUnit
        from crm.models import Document, DocumentAttachment

        f = SimpleUploadedFile("deletable.pdf", b"%PDF-1.4 delete test", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp = self.client.post(
            "/api/crm/documents/",
            {"title": "Pending Scan", "category": "OTHER", "file": f},
            format="multipart",
        )
        doc_id = resp.data["id"]
        doc = Document.objects.get(id=doc_id)

        batch2 = ImportBatch.objects.create()
        unit = VehicleUnit.objects.create(vin_chassis_no="VIN-DEL-01", vehicle_model=self.model, import_batch=batch2)
        DocumentAttachment.objects.create(document=doc, unit=unit)

        # 1. Attempt delete without reason -> 400
        del_no_reason = self.client.delete(f"/api/crm/documents/{doc_id}/")
        self.assertEqual(del_no_reason.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Attempt delete with reason but without confirm_in_use -> 400 with in_use_warning
        del_warn = self.client.delete(f"/api/crm/documents/{doc_id}/?reason=Test+deletion")
        self.assertEqual(del_warn.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(del_warn.data.get("in_use_warning"))

        # 3. Delete with reason and confirm_in_use=true -> 200 OK
        del_ok = self.client.delete(f"/api/crm/documents/{doc_id}/?reason=Obsolete+scan&confirm_in_use=true")
        self.assertEqual(del_ok.status_code, status.HTTP_200_OK)

        doc.refresh_from_db()
        self.assertTrue(doc.is_deleted)
        self.assertEqual(doc.deletion_reason, "Obsolete scan")

        # Excluded from default list
        list_resp = self.client.get("/api/crm/documents/")
        results = list_resp.data if isinstance(list_resp.data, list) else list_resp.data.get("results", [])
        self.assertFalse(any(d["id"] == doc_id for d in results))

    def test_check_document_expiries_command(self):
        import datetime
        from django.core.management import call_command
        from django.core.files.uploadedfile import SimpleUploadedFile
        from common.models import Notification
        from crm.models import Document

        f = SimpleUploadedFile("insurance.pdf", b"%PDF-1.4 insurance policy", content_type="application/pdf")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        create_resp = self.client.post(
            "/api/crm/documents/",
            {
                "title": "Transit Insurance Policy",
                "category": "INSURANCE",
                "file": f,
                "expiry_date": (timezone.localdate() + datetime.timedelta(days=7)).isoformat(),
            },
            format="multipart",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        doc_id = create_resp.data["id"]

        call_command("check_document_expiries")

        # Check notification created for uploaded_by or staff
        notifications = Notification.objects.filter(
            notification_type=Notification.NotificationType.DOCUMENT_EXPIRING
        )
        self.assertTrue(notifications.exists())
        notif = notifications.first()
        self.assertIn("Transit Insurance Policy", notif.title)

    def test_direct_url_guess_to_private_file_returns_404_while_authenticated_endpoint_works(self):
        """Part 0.1: Verify private files are unreachable via public /media/ URL,
        unauthenticated API access is denied (401/403), and authenticated authorized
        API endpoint returns the file."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from crm.models import Document

        f = SimpleUploadedFile("sensitive_contract.pdf", b"%PDF-1.4 Top secret document content", content_type="application/pdf")
        doc = Document.objects.create(
            title="Confidential Corporate Contract",
            category="LEGAL",
            file=f,
            uploaded_by=self.ho_user,
        )

        # 1. Direct public /media/ guess must return 404 (not in public MEDIA_ROOT)
        media_url_guess = f"/media/{doc.file.name}"
        res_direct = self.client.get(media_url_guess)
        self.assertEqual(res_direct.status_code, 404)

        # 2. Unauthenticated request to preview/download endpoints must fail
        self.client.credentials()  # Clear credentials
        res_anon_preview = self.client.get(f"/api/crm/documents/{doc.id}/preview/")
        self.assertIn(res_anon_preview.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        res_anon_download = self.client.get(f"/api/crm/documents/{doc.id}/download/")
        self.assertIn(res_anon_download.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 3. Authenticated request with permission works
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        res_auth_preview = self.client.get(f"/api/crm/documents/{doc.id}/preview/")
        self.assertEqual(res_auth_preview.status_code, status.HTTP_200_OK)
        self.assertIn(b"%PDF-1.4 Top secret document content", b"".join(res_auth_preview.streaming_content))

        res_auth_download = self.client.get(f"/api/crm/documents/{doc.id}/download/")
        self.assertEqual(res_auth_download.status_code, status.HTTP_200_OK)
        self.assertIn(b"%PDF-1.4 Top secret document content", b"".join(res_auth_download.streaming_content))




class BankCatalogApiTest(APITestCase):
    """Banks and branches are managed from CRM settings and drive quotation dropdowns."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_superuser(
            username="bankadmin", email="bankadmin@example.com", password="pw"
        )

    def _auth(self):
        token = self.client.post(
            "/api/auth/token/", {"username": "bankadmin", "password": "pw"}
        ).json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_create_list_and_filter_branches(self):
        self._auth()
        bank = self.client.post(
            "/api/crm/banks/",
            {"name": "Sample Bank Limited", "code": "99001", "category": "Commercial Bank (Class A)"},
            format="json",
        )
        self.assertEqual(bank.status_code, status.HTTP_201_CREATED, bank.content)
        bank_id = bank.json()["id"]

        duplicate = self.client.post(
            "/api/crm/banks/", {"name": "sample bank limited"}, format="json"
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST, duplicate.content)

        branch = self.client.post(
            "/api/crm/bank-branches/",
            {
                "bank": bank_id,
                "name": "Kuleshwor Branch",
                "district": "Kathmandu",
                "address": "Kuleshwor",
            },
            format="json",
        )
        self.assertEqual(branch.status_code, status.HTTP_201_CREATED, branch.content)

        listing = self.client.get(
            f"/api/crm/bank-branches/?bank={bank_id}&search=Kuleshwor&page=1&page_size=10"
        )
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.content)
        body = listing.json()
        self.assertEqual(body["count"], 1)
        self.assertEqual(body["results"][0]["bank_name"], "Sample Bank Limited")

        exact = self.client.get(
            "/api/crm/banks/?exact_name=sample%20bank%20limited&page=1&page_size=5"
        )
        self.assertEqual(exact.json()["count"], 1)

    def test_delete_bank_used_on_quotation_is_blocked(self):
        self._auth()
        bank = self.client.post(
            "/api/crm/banks/", {"name": "Quoted Bank"}, format="json"
        ).json()
        Quotation.objects.create(
            vehicle="VT",
            vehicle_price=1000,
            bank_name="Quoted Bank",
            bank_address="Main Branch",
        )
        resp = self.client.delete(f"/api/crm/banks/{bank['id']}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
