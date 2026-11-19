from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Role, get_user_profile, seed_starter_roles
from dealers.models import Dealer
from hrm.models import Employee
from inventory.models import ImportBatch, Sale, StockMovement, VehicleModel, VehicleUnit
from crm.models import Activity, Customer, Lead, Opportunity, Quotation, TestDrive

User = get_user_model()


class DealerScopingIntegrationTest(APITestCase):
    """Verifies strict dealer scoping across dealers, inventory, and CRM APIs.

    A user assigned to Dealer A:
    - Can list and retrieve only Dealer A records.
    - Cannot list, retrieve, update or delete Dealer B records.
    - New records automatically record dealer and created_by.
    Head office staff see all records and can optionally filter by ?dealer=.
    """

    @classmethod
    def setUpTestData(cls):
        seed_starter_roles()

        # Dealerships
        cls.dealer_a = Dealer.objects.create(
            name="Dealer Alpha KTM", district="Kathmandu", phone="01-4444444"
        )
        cls.dealer_b = Dealer.objects.create(
            name="Dealer Beta Pokhara", district="Kaski", phone="061-555555"
        )

        # Users
        cls.dealer_a_user = User.objects.create_user(
            username="dealer_a_staff", password="password123", is_staff=True
        )
        cls.dealer_b_user = User.objects.create_user(
            username="dealer_b_staff", password="password123", is_staff=True
        )
        cls.head_office_user = User.objects.create_user(
            username="head_office_staff", password="password123", is_staff=True
        )

        # Assign home dealers to profiles
        prof_a = get_user_profile(cls.dealer_a_user)
        prof_a.dealer = cls.dealer_a
        prof_a.save()

        prof_b = get_user_profile(cls.dealer_b_user)
        prof_b.dealer = cls.dealer_b
        prof_b.save()

        prof_ho = get_user_profile(cls.head_office_user)
        prof_ho.dealer = None
        prof_ho.save()

        # Create a comprehensive role for all tested APIs
        all_perms = Permission.objects.filter(
            codename__in=[
                "view_dealer", "add_dealer", "change_dealer", "delete_dealer",
                "view_vehiclemodel", "add_vehiclemodel",
                "view_importbatch", "add_importbatch",
                "view_vehicleunit", "add_vehicleunit", "change_vehicleunit", "delete_vehicleunit",
                "view_stockmovement",
                "view_sale", "add_sale", "change_sale", "delete_sale",
                "view_lead", "add_lead", "change_lead", "delete_lead",
                "view_customer", "add_customer", "change_customer", "delete_customer",
                "view_opportunity", "add_opportunity", "change_opportunity", "delete_opportunity",
                "view_testdrive", "add_testdrive", "change_testdrive", "delete_testdrive",
                "view_quotation", "add_quotation", "edit_quotation", "revise_quotation", "change_quotation", "delete_quotation",
                "view_activity", "add_activity", "change_activity", "delete_activity",
            ]
        )
        full_role, _ = Role.objects.get_or_create(
            name="Scoping Full Role",
            defaults={"description": "Full access role for scoping testing."}
        )
        full_role.permissions.set(all_perms)

        prof_a.roles.add(full_role)
        prof_b.roles.add(full_role)
        prof_ho.roles.add(full_role)

        # Inventory baseline
        cls.v_model = VehicleModel.objects.create(
            brand="VT", model_name="Alpha EV"
        )
        cls.batch = ImportBatch.objects.create(
            batch_no="BATCH-SCOPE-001",
            total_units=4,
            shipped_date=date.today(),
            eta_date=date.today() + timedelta(days=10),
        )

        cls.unit_a = VehicleUnit.objects.create(
            import_batch=cls.batch,
            vehicle_model=cls.v_model,
            vin_chassis_no="VIN-ALPHA-001",
            status=VehicleUnit.Status.READY_FOR_SALE,
            dealer=cls.dealer_a,
        )
        cls.unit_b = VehicleUnit.objects.create(
            import_batch=cls.batch,
            vehicle_model=cls.v_model,
            vin_chassis_no="VIN-BETA-002",
            status=VehicleUnit.Status.READY_FOR_SALE,
            dealer=cls.dealer_b,
        )

        cls.movement_a = StockMovement.objects.create(
            vehicle=cls.unit_a,
            movement_type=StockMovement.MovementType.IMPORTED,
            quantity=1,
            reference_note="Alpha arrival",
            created_by=cls.dealer_a_user,
        )
        cls.movement_b = StockMovement.objects.create(
            vehicle=cls.unit_b,
            movement_type=StockMovement.MovementType.IMPORTED,
            quantity=1,
            reference_note="Beta arrival",
            created_by=cls.dealer_b_user,
        )

        # Sold units for Sales testing
        cls.unit_a_sold = VehicleUnit.objects.create(
            import_batch=cls.batch,
            vehicle_model=cls.v_model,
            vin_chassis_no="VIN-ALPHA-SOLD-003",
            status=VehicleUnit.Status.SOLD,
            dealer=cls.dealer_a,
        )
        cls.unit_b_sold = VehicleUnit.objects.create(
            import_batch=cls.batch,
            vehicle_model=cls.v_model,
            vin_chassis_no="VIN-BETA-SOLD-004",
            status=VehicleUnit.Status.SOLD,
            dealer=cls.dealer_b,
        )

        # CRM baseline
        cls.lead_a = Lead.objects.create(
            name="Alpha Lead",
            phone="9801111111",
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.lead_b = Lead.objects.create(
            name="Beta Lead",
            phone="9802222222",
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

        cls.cust_a = Customer.objects.create(
            name="Alpha Customer",
            phone="9841111111",
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.cust_b = Customer.objects.create(
            name="Beta Customer",
            phone="9842222222",
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

        cls.sale_a = Sale.objects.create(
            unit=cls.unit_a_sold,
            customer=cls.cust_a,
            dealer=cls.dealer_a,
            selling_price=3500000,
            sale_date=date.today(),
            tax_invoice_no="INV-A-001",
            receipt_no="REC-A-001",
            created_by=cls.dealer_a_user,
        )
        cls.sale_b = Sale.objects.create(
            unit=cls.unit_b_sold,
            customer=cls.cust_b,
            dealer=cls.dealer_b,
            selling_price=3500000,
            sale_date=date.today(),
            tax_invoice_no="INV-B-002",
            receipt_no="REC-B-002",
            created_by=cls.dealer_b_user,
        )

        cls.opp_a = Opportunity.objects.create(
            customer=cls.cust_a,
            title="Alpha Deal",
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.opp_b = Opportunity.objects.create(
            customer=cls.cust_b,
            title="Beta Deal",
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

        cls.td_a = TestDrive.objects.create(
            customer=cls.cust_a,
            vehicle="Alpha EV",
            date=date.today(),
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.td_b = TestDrive.objects.create(
            customer=cls.cust_b,
            vehicle="Alpha EV",
            date=date.today(),
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

        cls.quote_a = Quotation.objects.create(
            customer=cls.cust_a,
            vehicle_model=cls.v_model,
            vehicle="Alpha EV",
            vehicle_price=3500000,
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.quote_b = Quotation.objects.create(
            customer=cls.cust_b,
            vehicle_model=cls.v_model,
            vehicle="Alpha EV",
            vehicle_price=3500000,
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

        cls.act_a = Activity.objects.create(
            customer=cls.cust_a,
            type=Activity.Type.NOTE,
            subject="Alpha Follow-up",
            dealer=cls.dealer_a,
            created_by=cls.dealer_a_user,
        )
        cls.act_b = Activity.objects.create(
            customer=cls.cust_b,
            type=Activity.Type.NOTE,
            subject="Beta Follow-up",
            dealer=cls.dealer_b,
            created_by=cls.dealer_b_user,
        )

    # ---------------------------------------------------------
    # 1. DealerViewSet Scoping
    # ---------------------------------------------------------
    def test_dealer_viewset_scoping(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List: only sees Dealer A
        resp = self.client.get("/api/dealers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        dealer_ids = [d["id"] for d in resp.json()]
        self.assertIn(self.dealer_a.id, dealer_ids)
        self.assertNotIn(self.dealer_b.id, dealer_ids)

        # Retrieve: can open own, cannot open other
        resp_own = self.client.get(f"/api/dealers/{self.dealer_a.id}/")
        self.assertEqual(resp_own.status_code, status.HTTP_200_OK)

        resp_other = self.client.get(f"/api/dealers/{self.dealer_b.id}/")
        self.assertEqual(resp_other.status_code, status.HTTP_404_NOT_FOUND)

        # Update: cannot update other dealer
        resp_patch = self.client.patch(
            f"/api/dealers/{self.dealer_b.id}/", {"phone": "061-999999"}, format="json"
        )
        self.assertIn(resp_patch.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN))

        # Create: dealer staff cannot create dealerships
        resp_create = self.client.post(
            "/api/dealers/", {"name": "Dealer Gamma", "district": "Lalitpur"}, format="json"
        )
        self.assertEqual(resp_create.status_code, status.HTTP_403_FORBIDDEN)

        # Delete: dealer staff cannot delete dealerships
        resp_del = self.client.delete(f"/api/dealers/{self.dealer_a.id}/")
        self.assertEqual(resp_del.status_code, status.HTTP_403_FORBIDDEN)

    # ---------------------------------------------------------
    # 2. VehicleUnitViewSet Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_vehicle_unit_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List: sees unit_a, excludes unit_b
        resp = self.client.get("/api/inventory/units/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        unit_ids = [u["id"] for u in data]
        self.assertIn(self.unit_a.id, unit_ids)
        self.assertNotIn(self.unit_b.id, unit_ids)

        # Retrieve: unit_b returns 404
        resp_other = self.client.get(f"/api/inventory/units/{self.unit_b.id}/")
        self.assertEqual(resp_other.status_code, status.HTTP_404_NOT_FOUND)

        # Create: auto-assigns home dealer
        resp_create = self.client.post(
            "/api/inventory/units/",
            {
                "import_batch": self.batch.id,
                "vehicle_model": self.v_model.id,
                "vin_chassis_no": "VIN-NEW-AUTO-A",
                "motor_no": "MOT-001",
                "battery_no": "BAT-001",
            },
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED, resp_create.content)
        new_unit = VehicleUnit.objects.get(vin_chassis_no="VIN-NEW-AUTO-A")
        self.assertEqual(new_unit.dealer_id, self.dealer_a.id)

    # ---------------------------------------------------------
    # 3. StockMovementViewSet Scoping
    # ---------------------------------------------------------
    def test_stock_movement_scoping(self):
        # Dealer A user sees only Dealer A movements
        self.client.force_authenticate(self.dealer_a_user)
        resp = self.client.get("/api/inventory/movements/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        mov_ids = [m["id"] for m in data]
        self.assertIn(self.movement_a.id, mov_ids)
        self.assertNotIn(self.movement_b.id, mov_ids)

        # Head office sees all and can filter by ?dealer=
        self.client.force_authenticate(self.head_office_user)
        resp_ho = self.client.get("/api/inventory/movements/")
        data_ho = resp_ho.json()["results"] if isinstance(resp_ho.json(), dict) else resp_ho.json()
        ho_ids = [m["id"] for m in data_ho]
        self.assertIn(self.movement_a.id, ho_ids)
        self.assertIn(self.movement_b.id, ho_ids)

        resp_filtered = self.client.get(f"/api/inventory/movements/?dealer={self.dealer_a.id}")
        data_filt = resp_filtered.json()["results"] if isinstance(resp_filtered.json(), dict) else resp_filtered.json()
        filt_ids = [m["id"] for m in data_filt]
        self.assertIn(self.movement_a.id, filt_ids)
        self.assertNotIn(self.movement_b.id, filt_ids)

    # ---------------------------------------------------------
    # 4. SaleViewSet Scoping
    # ---------------------------------------------------------
    def test_sale_scoping(self):
        self.client.force_authenticate(self.dealer_a_user)
        resp = self.client.get("/api/inventory/sales/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        sale_ids = [s["id"] for s in data]
        self.assertIn(self.sale_a.id, sale_ids)
        self.assertNotIn(self.sale_b.id, sale_ids)

        # Cannot retrieve other dealer's sale
        resp_other = self.client.get(f"/api/inventory/sales/{self.sale_b.id}/")
        self.assertEqual(resp_other.status_code, status.HTTP_404_NOT_FOUND)

    # ---------------------------------------------------------
    # 5. CRM Leads Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_leads_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List: only sees lead_a
        resp = self.client.get("/api/crm/leads/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        lead_ids = [str(l["id"]) for l in data]
        self.assertIn(str(self.lead_a.id), lead_ids)
        self.assertNotIn(str(self.lead_b.id), lead_ids)

        # Retrieve, update, delete on other dealer's lead return 404
        self.assertEqual(self.client.get(f"/api/crm/leads/{self.lead_b.id}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.patch(f"/api/crm/leads/{self.lead_b.id}/", {"notes": "hack"}).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.delete(f"/api/crm/leads/{self.lead_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/leads/",
            {"name": "Created Lead A", "phone": "9819999999"},
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED)
        new_lead = Lead.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_lead.dealer_id, self.dealer_a.id)
        self.assertEqual(new_lead.created_by_id, self.dealer_a_user.id)

    # ---------------------------------------------------------
    # 6. CRM Customers Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_customers_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List: only sees cust_a
        resp = self.client.get("/api/crm/customers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        cust_ids = [str(c["id"]) for c in data]
        self.assertIn(str(self.cust_a.id), cust_ids)
        self.assertNotIn(str(self.cust_b.id), cust_ids)

        # Cannot retrieve other customer
        self.assertEqual(self.client.get(f"/api/crm/customers/{self.cust_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/customers/",
            {"name": "Created Cust A", "phone": "9818888888"},
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED)
        new_cust = Customer.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_cust.dealer_id, self.dealer_a.id)
        self.assertEqual(new_cust.created_by_id, self.dealer_a_user.id)

    # ---------------------------------------------------------
    # 7. CRM Opportunities Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_opportunities_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List
        resp = self.client.get("/api/crm/opportunities/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        opp_ids = [str(o["id"]) for o in data]
        self.assertIn(str(self.opp_a.id), opp_ids)
        self.assertNotIn(str(self.opp_b.id), opp_ids)

        # Cannot retrieve other opportunity
        self.assertEqual(self.client.get(f"/api/crm/opportunities/{self.opp_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/opportunities/",
            {"title": "New Deal A", "customer": self.cust_a.id, "value": 3500000},
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED, resp_create.content)
        new_opp = Opportunity.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_opp.dealer_id, self.dealer_a.id)
        self.assertEqual(new_opp.created_by_id, self.dealer_a_user.id)

    # ---------------------------------------------------------
    # 8. CRM TestDrives Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_test_drives_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List
        resp = self.client.get("/api/crm/test-drives/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        td_ids = [str(t["id"]) for t in data]
        self.assertIn(str(self.td_a.id), td_ids)
        self.assertNotIn(str(self.td_b.id), td_ids)

        # Cannot retrieve other test drive
        self.assertEqual(self.client.get(f"/api/crm/test-drives/{self.td_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/test-drives/",
            {
                "customer": self.cust_a.id,
                "vehicle": "Alpha EV",
                "date": str(date.today()),
            },
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED)
        new_td = TestDrive.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_td.dealer_id, self.dealer_a.id)
        self.assertEqual(new_td.created_by_id, self.dealer_a_user.id)

    # ---------------------------------------------------------
    # 9. CRM Quotations Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_quotations_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List
        resp = self.client.get("/api/crm/quotations/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        quote_ids = [str(q["id"]) for q in data]
        self.assertIn(str(self.quote_a.id), quote_ids)
        self.assertNotIn(str(self.quote_b.id), quote_ids)

        # Cannot retrieve other quotation
        self.assertEqual(self.client.get(f"/api/crm/quotations/{self.quote_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/quotations/",
            {
                "customer": self.cust_a.id,
                "vehicle_model": self.v_model.id,
                "vehicle": "Alpha EV",
                "vehicle_price": 3500000,
            },
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED)
        new_quote = Quotation.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_quote.dealer_id, self.dealer_a.id)
        self.assertEqual(new_quote.created_by_id, self.dealer_a_user.id)

    # ---------------------------------------------------------
    # 10. CRM Activities Scoping and Auto-assign
    # ---------------------------------------------------------
    def test_crm_activities_scoping_and_creation(self):
        self.client.force_authenticate(self.dealer_a_user)

        # List
        resp = self.client.get("/api/crm/activities/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()["results"] if isinstance(resp.json(), dict) else resp.json()
        act_ids = [str(a["id"]) for a in data]
        self.assertIn(str(self.act_a.id), act_ids)
        self.assertNotIn(str(self.act_b.id), act_ids)

        # Cannot retrieve other activity
        self.assertEqual(self.client.get(f"/api/crm/activities/{self.act_b.id}/").status_code, status.HTTP_404_NOT_FOUND)

        # Create auto-assigns dealer and created_by
        resp_create = self.client.post(
            "/api/crm/activities/",
            {
                "customer": self.cust_a.id,
                "type": Activity.Type.CALL,
                "subject": "Followup Call A",
            },
            format="json",
        )
        self.assertEqual(resp_create.status_code, status.HTTP_201_CREATED)
        new_act = Activity.objects.get(id=resp_create.json()["id"])
        self.assertEqual(new_act.dealer_id, self.dealer_a.id)
        self.assertEqual(new_act.created_by_id, self.dealer_a_user.id)

    def test_global_search_is_dealer_scoped(self):
        self.client.force_authenticate(self.dealer_a_user)
        titles = [r["title"] for r in self.client.get("/api/search/?q=VIN-").json()["results"]]
        self.assertIn("VIN-ALPHA-001", titles)
        self.assertNotIn("VIN-BETA-002", titles)

        self.client.force_authenticate(self.head_office_user)
        titles = [r["title"] for r in self.client.get("/api/search/?q=VIN-").json()["results"]]
        self.assertIn("VIN-BETA-002", titles)


class DealerlessUserScopingTest(APITestCase):
    """Verifies that a dealer-role user with NO home dealer assigned sees nothing

    and cannot create or mutate dealer-scoped records across units, stock
    movements, sales, leads, customers, quotations, activities, opportunities,
    test drives, and servicing. Also verifies UserSerializer validation.
    """

    @classmethod
    def setUpTestData(cls):
        seed_starter_roles()

        cls.dealer = Dealer.objects.create(
            name="Kathmandu Central Dealer", district="Kathmandu", phone="01-4111111"
        )
        cls.v_model = VehicleModel.objects.create(
            brand="VT",
            model_name="Alpha EV",
            battery_power_kw=42.0,
            motor_power_kw=60.0,
        )
        cls.batch = ImportBatch.objects.create(
            batch_no="BATCH-DEALERLESS-001",
            total_units=2,
            shipped_date=date.today(),
            eta_date=date.today() + timedelta(days=5),
        )
        cls.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DEALERLESS-001",
            vehicle_model=cls.v_model,
            import_batch=cls.batch,
            color="White",
            dealer=cls.dealer,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        cls.movement = StockMovement.objects.create(
            vehicle=cls.unit,
            movement_type=StockMovement.MovementType.IMPORTED,
            quantity=1,
        )
        cls.customer = Customer.objects.create(
            name="Test Customer", phone="9800000001", dealer=cls.dealer
        )
        cls.sale = Sale.objects.create(
            unit=cls.unit,
            customer=cls.customer,
            dealer=cls.dealer,
            selling_price=3500000,
            sale_date=date.today(),
            payment_mode="CASH",
            is_current=True,
        )
        cls.lead = Lead.objects.create(
            name="Test Lead", phone="9800000002", dealer=cls.dealer
        )
        cls.quote = Quotation.objects.create(
            customer=cls.customer,
            vehicle_model=cls.v_model,
            vehicle="Alpha EV",
            vehicle_price=3500000,
            dealer=cls.dealer,
            is_latest=True,
        )
        cls.activity = Activity.objects.create(
            customer=cls.customer,
            dealer=cls.dealer,
            type=Activity.Type.CALL,
            subject="Intro Call",
        )
        cls.opportunity = Opportunity.objects.create(
            title="Deal 1", customer=cls.customer, dealer=cls.dealer
        )
        cls.test_drive = TestDrive.objects.create(
            customer=cls.customer,
            dealer=cls.dealer,
            date=date.today(),
            time="11:00",
            status=TestDrive.Status.SCHEDULED,
        )

        all_perms = Permission.objects.filter(
            codename__in=[
                "view_dealer", "add_dealer", "change_dealer", "delete_dealer",
                "view_vehiclemodel", "add_vehiclemodel",
                "view_importbatch", "add_importbatch",
                "view_vehicleunit", "add_vehicleunit", "change_vehicleunit", "delete_vehicleunit",
                "view_stockmovement",
                "view_sale", "add_sale", "change_sale", "delete_sale",
                "view_lead", "add_lead", "change_lead", "delete_lead",
                "view_customer", "add_customer", "change_customer", "delete_customer",
                "view_opportunity", "add_opportunity", "change_opportunity", "delete_opportunity",
                "view_testdrive", "add_testdrive", "change_testdrive", "delete_testdrive",
                "view_quotation", "add_quotation", "edit_quotation", "revise_quotation", "change_quotation", "delete_quotation",
                "view_activity", "add_activity", "change_activity", "delete_activity",
                "view_servicerecord", "add_servicerecord", "change_servicerecord",
            ]
        )

        cls.dealer_role = Role.objects.get(name="Dealer Staff")
        cls.dealer_role.permissions.add(*all_perms)

        # Dealerless user: holds dealer-scoped role, but home dealer is None
        cls.dealerless_user = User.objects.create_user(
            username="dealerless_staff", password="password123", is_staff=True
        )
        prof = get_user_profile(cls.dealerless_user)
        prof.dealer = None
        prof.roles.set([cls.dealer_role])
        prof.save()

        # Super admin for user creation testing
        cls.super_admin = User.objects.create_superuser(
            username="super_admin_test", password="password123", email="admin@example.com"
        )
        get_user_profile(cls.super_admin).roles.set(Role.objects.filter(name="Super Admin"))

    def setUp(self):
        self.client.force_authenticate(self.dealerless_user)

    def test_dealerless_user_sees_empty_lists_across_all_endpoints(self):
        """Dealer-role user with NO home dealer assigned must see empty list, never everything."""
        endpoints = [
            "/api/inventory/units/",
            "/api/inventory/movements/",
            "/api/inventory/sales/",
            "/api/crm/leads/",
            "/api/crm/customers/",
            "/api/crm/quotations/",
            "/api/crm/activities/",
            "/api/crm/opportunities/",
            "/api/crm/test-drives/",
            "/api/dealers/",
            "/api/servicing/records/",
            "/api/notifications/",
        ]
        for url in endpoints:
            resp = self.client.get(url)
            self.assertEqual(
                resp.status_code,
                status.HTTP_200_OK,
                f"Expected 200 from {url}, got {resp.status_code}",
            )
            data = resp.json()
            items = data["results"] if isinstance(data, dict) and "results" in data else data
            self.assertEqual(
                len(items),
                0,
                f"Dealerless user leaked data on {url}: found {len(items)} items, expected 0",
            )

        resp_unread = self.client.get("/api/notifications/unread-count/")
        self.assertEqual(resp_unread.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_unread.json().get("unread_count"), 0)

    def test_dealerless_user_cannot_create_dealer_scoped_records(self):
        """Dealer-role user without a home dealer cannot create records."""
        # 1. Units
        resp_unit = self.client.post(
            "/api/inventory/units/",
            {
                "vin_chassis_no": "VIN-NEW-001",
                "vehicle_model": self.v_model.id,
                "import_batch": self.batch.id,
                "color": "Red",
            },
            format="json",
        )
        self.assertEqual(resp_unit.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Leads
        resp_lead = self.client.post(
            "/api/crm/leads/",
            {"name": "New Lead", "phone": "9811111111"},
            format="json",
        )
        self.assertEqual(resp_lead.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Customers
        resp_cust = self.client.post(
            "/api/crm/customers/",
            {"name": "New Customer", "phone": "9822222222"},
            format="json",
        )
        self.assertEqual(resp_cust.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Quotations
        resp_quote = self.client.post(
            "/api/crm/quotations/",
            {
                "customer": self.customer.id,
                "vehicle_model": self.v_model.id,
                "vehicle": "Alpha EV",
                "vehicle_price": 3500000,
            },
            format="json",
        )
        self.assertEqual(resp_quote.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Activities
        resp_act = self.client.post(
            "/api/crm/activities/",
            {"customer": self.customer.id, "subject": "Test Note", "type": Activity.Type.CALL},
            format="json",
        )
        self.assertEqual(resp_act.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Dealerships
        resp_dealer = self.client.post(
            "/api/dealers/",
            {"name": "Rogue Dealer", "district": "Bhaktapur"},
            format="json",
        )
        self.assertEqual(resp_dealer.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_serializer_requires_home_dealer_for_dealer_roles(self):
        """User creation/update requires a home dealership when assigning a dealer role."""
        from accounts.serializers import UserSerializer

        dealer_employee = Employee.objects.create(full_name="New Dealer Staff")
        hq_employee = Employee.objects.create(full_name="New HQ Staff")

        # 1. Dealer role without a dealer must fail
        ser_fail = UserSerializer(
            data={
                "username": "new_dealer_staff_1",
                "password": "Password123!",
                "roles": [self.dealer_role.id],
                "dealer": None,
                "employee_id": dealer_employee.id,
            }
        )
        self.assertFalse(ser_fail.is_valid())
        self.assertIn("dealer", ser_fail.errors)

        # 2. Dealer role with a dealer must succeed
        ser_ok = UserSerializer(
            data={
                "username": "new_dealer_staff_2",
                "password": "Password123!",
                "roles": [self.dealer_role.id],
                "dealer": self.dealer.id,
                "employee_id": dealer_employee.id,
            }
        )
        self.assertTrue(ser_ok.is_valid(), ser_ok.errors)

        # 3. Non-dealer role without a dealer must succeed
        ho_role, _ = Role.objects.get_or_create(name="Sales Executive")
        ser_ho = UserSerializer(
            data={
                "username": "new_ho_staff_1",
                "password": "Password123!",
                "roles": [ho_role.id],
                "dealer": None,
                "employee_id": hq_employee.id,
            }
        )
        self.assertTrue(ser_ho.is_valid(), ser_ho.errors)

