from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Role, get_user_profile
from crm.models import Customer, Lead, Quotation
from dealers.models import Dealer
from events.models import Event
from inventory.models import ImportBatch, VehicleModel, VehicleUnit
from servicing.models import ServiceRecord

User = get_user_model()


class GlobalSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_superuser(
            username="admin_search",
            email="admin_search@test.com",
            password="password123",
        )

        # Service manager (servicing + inventory unit permissions, but NO crm permissions)
        self.service_user = User.objects.create_user(
            username="service_manager",
            email="service@test.com",
            password="password123",
        )
        perm_service = Permission.objects.get(codename="view_servicerecord")
        perm_unit = Permission.objects.get(codename="view_vehicleunit")
        role_service = Role.objects.create(name="Service Manager Role")
        role_service.permissions.add(perm_service, perm_unit)
        get_user_profile(self.service_user).roles.add(role_service)

        # Sales user (only CRM permissions)
        self.sales_user = User.objects.create_user(
            username="sales_rep",
            email="sales@test.com",
            password="password123",
        )
        perm_cust = Permission.objects.get(codename="view_customer")
        perm_lead = Permission.objects.get(codename="view_lead")
        perm_quote = Permission.objects.get(codename="view_quotation")
        role_sales = Role.objects.create(name="Sales Rep Role")
        role_sales.permissions.add(perm_cust, perm_lead, perm_quote)
        get_user_profile(self.sales_user).roles.add(role_sales)

        # Test data
        self.customer = Customer.objects.create(
            name="Suman Shrestha",
            phone="9841999888",
            company="Himalayan Traders",
        )
        self.lead = Lead.objects.create(
            name="Anil Gurung",
            phone="9851777666",
            company="Pokhara Transport",
            vehicle="VT EV Cargo",
        )
        self.v_model = VehicleModel.objects.create(
            brand="VT",
            model_name="E-Van Cargo",
        )
        self.batch = ImportBatch.objects.create(
            batch_no="IMP-202609-0099",
        )
        self.unit = VehicleUnit.objects.create(
            vin_chassis_no="FD123456789VIN01",
            motor_no="MOT987654",
            import_batch=self.batch,
            vehicle_model=self.v_model,
        )
        self.service_record = ServiceRecord.objects.create(
            vro_no="VRO-2026-0888",
            chassis_number="FD123456789VIN01",
            customer_name="Suman Shrestha",
            date_received=timezone.localdate(),
        )
        self.quotation = Quotation.objects.create(
            customer=self.customer,
            vehicle="E-Van Cargo",
            vehicle_price=2500000,
        )
        self.dealer = Dealer.objects.create(
            name="Butwal Motors",
            district="Rupandehi",
        )
        self.event = Event.objects.create(
            name="Nepal EV Expo 2026",
            start_date=timezone.localdate(),
            end_date=timezone.localdate(),
        )

    def test_unauthenticated_rejected(self):
        res = self.client.get("/api/search/?q=Suman")
        self.assertEqual(res.status_code, 401)

    def test_empty_or_short_query(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/search/?q=a")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total"], 0)
        self.assertEqual(len(res.data["results"]), 0)

    def test_admin_searches_all_entity_types(self):
        self.client.force_authenticate(user=self.admin)

        # Search customer by name
        res = self.client.get("/api/search/?q=Suman")
        self.assertEqual(res.status_code, 200)
        c_matches = [r for r in res.data["results"] if r["type"] == "customer"]
        self.assertTrue(len(c_matches) >= 1)
        self.assertEqual(c_matches[0]["title"], "Suman Shrestha")
        self.assertEqual(c_matches[0]["target"], f"crm-customers/{self.customer.id}")

        # Search unit by VIN
        res = self.client.get("/api/search/?q=FD123456")
        self.assertEqual(res.status_code, 200)
        u_matches = [r for r in res.data["results"] if r["type"] == "unit"]
        self.assertTrue(len(u_matches) >= 1)
        self.assertEqual(u_matches[0]["title"], "FD123456789VIN01")
        self.assertEqual(u_matches[0]["target"], f"units/{self.unit.id}")

        # Search unit by motor number
        res = self.client.get("/api/search/?q=MOT987")
        self.assertEqual(res.status_code, 200)
        u_matches = [r for r in res.data["results"] if r["type"] == "unit"]
        self.assertTrue(len(u_matches) >= 1)

        # Search service record by VRO
        res = self.client.get("/api/search/?q=VRO-2026")
        self.assertEqual(res.status_code, 200)
        s_matches = [r for r in res.data["results"] if r["type"] == "service_record"]
        self.assertTrue(len(s_matches) >= 1)
        self.assertEqual(s_matches[0]["title"], "VRO-2026-0888")

        # Search lead by name
        res = self.client.get("/api/search/?q=Anil")
        self.assertEqual(res.status_code, 200)
        l_matches = [r for r in res.data["results"] if r["type"] == "lead"]
        self.assertTrue(len(l_matches) >= 1)
        self.assertEqual(l_matches[0]["title"], "Anil Gurung")
        self.assertEqual(l_matches[0]["target"], f"crm-leads/{self.lead.id}")

        # Search quotation by QT display id or customer name
        res = self.client.get(f"/api/search/?q={self.quotation.display_id}")
        self.assertEqual(res.status_code, 200)
        q_matches = [r for r in res.data["results"] if r["type"] == "quotation"]
        self.assertTrue(len(q_matches) >= 1)
        self.assertEqual(q_matches[0]["target"], f"crm-quotations/{self.quotation.id}")

        # Search dealer by name
        res = self.client.get("/api/search/?q=Butwal")
        self.assertEqual(res.status_code, 200)
        d_matches = [r for r in res.data["results"] if r["type"] == "dealer"]
        self.assertTrue(len(d_matches) >= 1)

        # Search event by name
        res = self.client.get("/api/search/?q=Expo")
        self.assertEqual(res.status_code, 200)
        e_matches = [r for r in res.data["results"] if r["type"] == "event"]
        self.assertTrue(len(e_matches) >= 1)

    def test_rbac_filtering_per_user_role(self):
        # Service manager has servicing permission, but NOT crm.view_customer
        self.client.force_authenticate(user=self.service_user)

        # Query "Suman": Suman is both customer name and customer_name on service_record
        res = self.client.get("/api/search/?q=Suman")
        self.assertEqual(res.status_code, 200)

        # Should find service record
        s_matches = [r for r in res.data["results"] if r["type"] == "service_record"]
        self.assertTrue(len(s_matches) >= 1)

        # Must NOT return customer record because service_user lacks crm.view_customer
        c_matches = [r for r in res.data["results"] if r["type"] == "customer"]
        self.assertEqual(len(c_matches), 0)

        # Must NOT return lead record
        l_matches = [r for r in res.data["results"] if r["type"] == "lead"]
        self.assertEqual(len(l_matches), 0)

        # Sales user has CRM permissions, but NOT servicing or inventory
        self.client.force_authenticate(user=self.sales_user)
        res = self.client.get("/api/search/?q=FD123456")
        self.assertEqual(res.status_code, 200)
        # Cannot see units or service records
        u_matches = [r for r in res.data["results"] if r["type"] == "unit"]
        self.assertEqual(len(u_matches), 0)
        s_matches = [r for r in res.data["results"] if r["type"] == "service_record"]
        self.assertEqual(len(s_matches), 0)

        # But can see customer
        res = self.client.get("/api/search/?q=Suman")
        c_matches = [r for r in res.data["results"] if r["type"] == "customer"]
        self.assertTrue(len(c_matches) >= 1)

    def test_service_manager_sees_units_and_service_records_but_not_customers_or_leads(self):
        """Service Manager with servicing and inventory unit permissions sees Unit and
        ServiceRecord results, but Customer and Lead results are absent."""
        Customer.objects.create(name="KTM Cargo Logistics", phone="9800111222")
        Lead.objects.create(name="KTM Express Lead", phone="9800333444")
        VehicleUnit.objects.create(
            vin_chassis_no="KTM-VIN-9001",
            motor_no="KTM-MOT-9001",
            vehicle_model=self.v_model,
            import_batch=self.batch,
        )
        ServiceRecord.objects.create(
            vro_no="KTM-VRO-9001",
            chassis_number="KTM-VIN-9001",
            customer_name="KTM Customer",
            date_received=timezone.localdate(),
        )

        self.client.force_authenticate(user=self.service_user)
        res = self.client.get("/api/search/?q=KTM")
        self.assertEqual(res.status_code, 200)

        types_found = {r["type"] for r in res.data["results"]}
        # ServiceRecord and Unit must be present
        self.assertIn("service_record", types_found)
        self.assertIn("unit", types_found)

        # Customer, Lead, and Quotation must be absent
        self.assertNotIn("customer", types_found)
        self.assertNotIn("lead", types_found)
        self.assertNotIn("quotation", types_found)

        self.assertEqual(len(res.data["groups"]["customers"]), 0)
        self.assertEqual(len(res.data["groups"]["leads"]), 0)
        self.assertEqual(len(res.data["groups"]["quotations"]), 0)
        self.assertTrue(len(res.data["groups"]["units"]) >= 1)
        self.assertTrue(len(res.data["groups"]["service_records"]) >= 1)

    def test_global_search_query_count_prevents_n_plus_one(self):
        """Verify that searching across all 7 model types executes exactly 1 query per model type
        (7 total) without N+1 queries when accessing related foreign keys."""
        for i in (1, 2):
            c = Customer.objects.create(name=f"VT Logistics {i}", phone=f"981112233{i}")
            VehicleUnit.objects.create(
                vin_chassis_no=f"VT-VIN-00{i}",
                motor_no=f"VT-MOT-00{i}",
                vehicle_model=self.v_model,
                import_batch=self.batch,
            )
            ServiceRecord.objects.create(
                vro_no=f"VT-VRO-00{i}",
                chassis_number=f"VT-VIN-00{i}",
                customer_name=f"VT Customer {i}",
                date_received=timezone.localdate(),
            )
            Lead.objects.create(name=f"VT Lead {i}", phone=f"982223344{i}")
            Quotation.objects.create(
                customer=c,
                vehicle=f"VT Commercial EV {i}",
                vehicle_price=2000000,
            )
            Dealer.objects.create(name=f"VT Motors Branch {i}", district="Kathmandu")
            Event.objects.create(
                name=f"VT EV Showcase {i}",
                start_date=timezone.localdate(),
                end_date=timezone.localdate(),
            )

        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(7):
            res = self.client.get("/api/search/?q=VT")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["groups"]["customers"]), 2)
        self.assertEqual(len(res.data["groups"]["units"]), 2)
        self.assertEqual(len(res.data["groups"]["service_records"]), 2)
        self.assertEqual(len(res.data["groups"]["leads"]), 2)
        self.assertEqual(len(res.data["groups"]["quotations"]), 2)
        self.assertEqual(len(res.data["groups"]["dealers"]), 2)
        self.assertEqual(len(res.data["groups"]["events"]), 2)
        self.assertEqual(res.data["total"], 14)
