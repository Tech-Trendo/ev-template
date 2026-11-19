import datetime
import io
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APITestCase

from accounts.models import Role, UserProfile, seed_starter_roles
from common.models import AuditLog
from crm.models import Activity, Customer, Lead, Quotation
from inventory.models import (
    CheckResult,
    ConditionReport,
    ImportBatch,
    PDIInspection,
    PDITemplate,
    Sale,
    StockMovement,
    VehicleBodyType,
    VehicleModel,
    VehicleUnit,
    VehicleVariant,
)
from inventory.services.sales import record_sale

User = get_user_model()


class InventoryApiTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="inv-admin", password="x", email="a@a.com"
        )
        self.staff = User.objects.create_user(
            username="inv-staff", password="x", is_staff=True
        )
        self.model = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI 10T",
            battery_power_kw="100.27",
            motor_power_kw="120",
            seating_capacity=2,
            charger_type=VehicleModel.CHARGER_DC_FAST,
            low_stock_threshold=2,
        )
        self.batch = ImportBatch.objects.create(batch_no="IMP-TEST-0001")
        self.template = PDITemplate.objects.get(inspection_type="PDI", version_no=1)
        self.item_ids = list(
            self.template.items.order_by("sort_order", "id").values_list("id", flat=True)
        )

    def _unit(self, vin="VIN-001", **kwargs):
        defaults = dict(
            vin_chassis_no=vin,
            import_batch=self.batch,
            vehicle_model=self.model,
            color="White",
            selling_price="5950000",
        )
        defaults.update(kwargs)
        return VehicleUnit.objects.create(**defaults)

    def _results(self, result=CheckResult.OK):
        return [{"item": i, "result": result} for i in self.item_ids]

    # -- access control -------------------------------------------------
    def test_roleless_staff_denied(self):
        self.client.force_authenticate(self.staff)
        res = self.client.get("/api/inventory/units/")
        self.assertEqual(res.status_code, 403)

    # -- checklist seed --------------------------------------------------
    def test_checklist_seed(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/inventory/checklist/active/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["items"]), 69)

    # -- import flow -----------------------------------------------------
    def test_add_units_writes_imported_movements(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            f"/api/inventory/batches/{self.batch.id}/add_units/",
            {
                "units": [
                    {"vin": "VIN-A1", "model_id": self.model.id, "color": "Blue"},
                    {"vin": "VIN-A2", "model": "AOCHI 10T"},
                ]
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["created_count"], 2)
        self.assertEqual(
            StockMovement.objects.filter(movement_type="IMPORTED").count(), 2
        )
        self.assertEqual(
            VehicleUnit.objects.get(vin_chassis_no="VIN-A1").status, "IN_WAREHOUSE"
        )

    # -- status workflow -------------------------------------------------
    def test_invalid_transition_blocked(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        res = self.client.post(f"/api/inventory/units/{unit.id}/mark_sold/", {"sold_price": "1"})
        self.assertEqual(res.status_code, 400)
        unit.refresh_from_db()
        self.assertEqual(unit.status, "IN_WAREHOUSE")
        self.assertFalse(
            StockMovement.objects.filter(
                vehicle=unit, movement_type="SOLD"
            ).exists()
        )

    def test_status_patch_blocked(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        res = self.client.patch(
            f"/api/inventory/units/{unit.id}/", {"status": "SOLD"}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_double_open_pdi_blocked(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        res = self.client.post(f"/api/inventory/units/{unit.id}/start_pdi/")
        self.assertEqual(res.status_code, 201)
        res = self.client.post(f"/api/inventory/units/{unit.id}/start_pdi/")
        self.assertEqual(res.status_code, 400)

    def test_pdi_submit_passed_moves_vehicle_and_ledgers(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(
            f"/api/inventory/units/{unit.id}/start_pdi/"
        ).data
        res = self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "VERY_GOOD",
                "checked_by": "Inspector",
                "results": self._results(CheckResult.OK),
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.status, "PDI_PASSED")
        types = set(
            StockMovement.objects.filter(vehicle=unit).values_list(
                "movement_type", flat=True
            )
        )
        self.assertTrue({"PDI_STARTED", "PDI_PASSED"} <= types)

    def test_pdi_submit_with_not_ok_fails_vehicle(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(
            f"/api/inventory/units/{unit.id}/start_pdi/"
        ).data
        rows = self._results(CheckResult.OK)
        rows[0]["result"] = CheckResult.NOT_OK
        rows[0]["remark"] = "Scratch on door"
        res = self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": rows,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.status, "PDI_FAILED")

    def test_submitted_pdi_locked(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(
            f"/api/inventory/units/{unit.id}/start_pdi/"
        ).data
        self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        res = self.client.patch(
            f"/api/inventory/pdi/{pdi['id']}/",
            {"checked_by": "Hacker"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    # -- sale rules ------------------------------------------------------
    def test_sold_requires_pdi(self):
        unit = self._unit()
        unit.status = VehicleUnit.Status.READY_FOR_SALE
        unit.save(update_fields=["status"])
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            f"/api/inventory/units/{unit.id}/mark_sold/",
            {"sold_price": "5900000", "customer_name": "Walk-in Buyer"},
        )
        self.assertEqual(res.status_code, 400)

    def test_full_sale_flow(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(
            f"/api/inventory/units/{unit.id}/start_pdi/"
        ).data
        self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        self.client.post(f"/api/inventory/units/{unit.id}/move_to_ready/")
        res = self.client.post(
            f"/api/inventory/units/{unit.id}/mark_sold/",
            {"sold_price": "5900000", "customer_name": " Buyer One"},
        )
        self.assertEqual(res.status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.status, "SOLD")
        self.assertEqual(str(unit.sold_price), "5900000.00")
        self.assertTrue(
            StockMovement.objects.filter(
                vehicle=unit, movement_type="SOLD"
            ).exists()
        )

    def test_mark_sold_customer_deduplication_and_sale(self):
        from crm.models import Customer
        from inventory.models import Sale

        # Existing customer with phone
        existing_cust = Customer.objects.create(
            name="Ram Shrestha",
            phone="+977-9841234567",
        )
        self.assertEqual(existing_cust.phone_normalized, "9841234567")

        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(f"/api/inventory/units/{unit.id}/start_pdi/").data
        self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        self.client.post(f"/api/inventory/units/{unit.id}/move_to_ready/")
        # Sell passing phone with different formatting
        res = self.client.post(
            f"/api/inventory/units/{unit.id}/mark_sold/",
            {
                "sold_price": "6200000",
                "customer_name": "Ram Shrestha",
                "phone": "9841 234 567",
                "payment_mode": "CASH",
            },
        )
        self.assertEqual(res.status_code, 200)
        unit.refresh_from_db()
        # Customer was reused, not duplicated
        self.assertEqual(Customer.objects.filter(phone_normalized="9841234567").count(), 1)
        self.assertEqual(unit.current_customer, existing_cust)
        # Sale was created
        sale = Sale.objects.filter(unit=unit).first()
        self.assertIsNotNone(sale)
        self.assertEqual(sale.customer, existing_cust)
        self.assertTrue(sale.is_current)
        self.assertEqual(str(sale.selling_price), "6200000.00")

    def test_payment_modes_choices_and_recording(self):
        from crm.models import Customer
        from inventory.models import PaymentMode, Sale
        from inventory.services.sales import record_sale

        expected_modes = ["CASH", "BANK_FINANCE", "PARTIAL_FINANCE", "EXCHANGE", "LEASE"]
        actual_modes = [c[0] for c in PaymentMode.choices]
        self.assertEqual(actual_modes, expected_modes)

        cust = Customer.objects.create(name="Trade-In Buyer", phone="9841999999")
        unit1 = self._unit(vin="VIN-EXCHANGE-01")
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(f"/api/inventory/units/{unit1.id}/start_pdi/").data
        self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        self.client.post(f"/api/inventory/units/{unit1.id}/move_to_ready/")

        sale_exchange = record_sale(
            unit_id=unit1.id,
            customer_id=cust.id,
            sold_price="4500000",
            payment_mode=PaymentMode.EXCHANGE,
        )
        self.assertEqual(sale_exchange.payment_mode, "EXCHANGE")
        unit1.refresh_from_db()
        self.assertEqual(unit1.payment_mode, "EXCHANGE")

        # Test lease
        unit2 = self._unit(vin="VIN-LEASE-01")
        pdi2 = self.client.post(f"/api/inventory/units/{unit2.id}/start_pdi/").data
        self.client.post(
            f"/api/inventory/pdi/{pdi2['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        self.client.post(f"/api/inventory/units/{unit2.id}/move_to_ready/")

        sale_lease = record_sale(
            unit_id=unit2.id,
            customer_id=cust.id,
            sold_price="4600000",
            payment_mode=PaymentMode.LEASE,
        )
        self.assertEqual(sale_lease.payment_mode, "LEASE")
        unit2.refresh_from_db()
        self.assertEqual(unit2.payment_mode, "LEASE")

    # -- condition reports ------------------------------------------------
    def test_condition_report_create(self):
        unit = self._unit()
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/inventory/condition-reports/",
            {
                "vehicle": unit.id,
                "report_type": "AT_DELIVERY",
                "odometer_km": 25,
                "overall_rating": "VERY_GOOD",
                "inspected_by": "Inspector",
                "results_write": self._results()[:5],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(len(res.data["results"]), 5)
        unit.refresh_from_db()
        # Standalone: must not touch vehicle status.
        self.assertEqual(unit.status, "IN_WAREHOUSE")

    # -- stock dashboard --------------------------------------------------
    def test_stock_summary_aggregates(self):
        self._unit("VIN-S1")
        sold = self._unit("VIN-S2")
        sold.status = VehicleUnit.Status.SOLD
        sold.sold_price = "1"
        sold.sold_date = "2026-01-05"
        sold.save()
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/inventory/stock/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["kpis"]["total_imported"], 2)
        self.assertEqual(res.data["kpis"]["sold"], 1)
        self.assertEqual(res.data["kpis"]["remaining"], 1)
        self.assertEqual(res.data["by_model"][0]["model_name"], "AOCHI 10T")

    def test_pdi_no_unique_sequence(self):
        a = self._unit("VIN-Q1")
        b = self._unit("VIN-Q2")
        self.client.force_authenticate(self.admin)
        first = self.client.post(f"/api/inventory/units/{a.id}/start_pdi/").data
        second = self.client.post(f"/api/inventory/units/{b.id}/start_pdi/").data
        self.assertNotEqual(first["pdi_no"], second["pdi_no"])
        self.assertTrue(first["pdi_no"].startswith("PDI-"))
        self.assertEqual(
            PDIInspection.objects.filter(pdi_no=first["pdi_no"]).count(), 1
        )

    def test_china_transport_batch_and_receive_units(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(
            "/api/inventory/batches/",
            {
                "origin": "Yibin Factory, Sichuan",
                "transport_status": "IN_TRANSIT",
                "border_crossing": "Rasuwagadhi (Kerung)",
                "customs_declaration_no": "PP-2081/82-0042",
                "carrier_name": "Trans-Himalayan Logistics",
                "container_or_truck_no": "NA-4-KHA-8821",
                "destination_warehouse": "Kathmandu Central Stockyard",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        batch_id = res.data["id"]
        self.assertEqual(res.data["border_crossing"], "Rasuwagadhi (Kerung)")

        # Add unit in transit
        unit = self._unit("VIN-TRANSIT-1", status=VehicleUnit.Status.IN_TRANSIT)
        unit.import_batch_id = batch_id
        unit.save()

        # Receive batch units
        rec_res = self.client.post(
            f"/api/inventory/batches/{batch_id}/receive-units/",
            {"note": "Arrived at Kathmandu Stockyard"},
            format="json",
        )
        self.assertEqual(rec_res.status_code, 200)
        self.assertEqual(rec_res.data["moved_count"], 1)
        unit.refresh_from_db()
        self.assertEqual(unit.status, VehicleUnit.Status.IN_WAREHOUSE)

    def test_record_sale_atomic_rollback_on_failure(self):
        from crm.models import Activity, Customer, Lead, Quotation
        from inventory.models import Sale, StockMovement, VehicleUnit
        from inventory.services.sales import record_sale
        from rest_framework.exceptions import ValidationError

        unit = self._unit()
        self.client.force_authenticate(self.admin)
        pdi = self.client.post(f"/api/inventory/units/{unit.id}/start_pdi/").data
        self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": self._results(),
            },
            format="json",
        )
        self.client.post(f"/api/inventory/units/{unit.id}/move_to_ready/")

        cust = Customer.objects.create(name="Valid Customer", phone="9841111111")
        initial_purchases = cust.total_purchases

        # Trigger failure by providing an invalid/non-existent customer ID
        with self.assertRaises(ValidationError):
            record_sale(
                unit_id=unit.id,
                customer_id=999999,  # does not exist
                sold_price="5000000",
            )

        unit.refresh_from_db()
        cust.refresh_from_db()
        # Unit must still be READY_FOR_SALE
        self.assertEqual(unit.status, VehicleUnit.Status.READY_FOR_SALE)
        self.assertIsNone(unit.sold_price)
        self.assertIsNone(unit.current_customer)
        # No SOLD stock movement created
        self.assertFalse(StockMovement.objects.filter(vehicle=unit, movement_type="SOLD").exists())
        # No Sale created
        self.assertEqual(Sale.objects.filter(unit=unit).count(), 0)
        # Customer total purchases untouched
        self.assertEqual(cust.total_purchases, initial_purchases)

class SaleConcurrencyTest(TransactionTestCase):
    def test_record_sale_concurrency_locking(self):
        from concurrent.futures import ThreadPoolExecutor
        from crm.models import Customer
        from inventory.models import ImportBatch, PDIInspection, PDITemplate, Sale, VehicleModel, VehicleUnit
        from inventory.services.sales import record_sale
        from rest_framework.exceptions import ValidationError

        model = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI-CONC",
            battery_power_kw="100",
            motor_power_kw="120",
        )
        batch = ImportBatch.objects.create(batch_no="IMP-CONC-0001")
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-CONCURRENCY-1",
            import_batch=batch,
            vehicle_model=model,
            color="White",
            selling_price="5950000",
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        # Create approved PDI
        template = PDITemplate.objects.get(inspection_type="PDI", version_no=1)
        PDIInspection.objects.create(
            vehicle=unit,
            template=template,
            status=PDIInspection.InspectionStatus.APPROVED,
            overall_rating="GOOD",
        )

        cust1 = Customer.objects.create(name="Buyer One", phone="9841222222")
        cust2 = Customer.objects.create(name="Buyer Two", phone="9841333333")

        results = []
        errors = []

        def attempt_sale(c_id, price):
            from django.db import connection
            try:
                sale = record_sale(
                    unit_id=unit.id,
                    customer_id=c_id,
                    sold_price=price,
                )
                results.append(sale)
            except Exception as e:
                errors.append(e)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(attempt_sale, cust1.id, "5100000")
            f2 = executor.submit(attempt_sale, cust2.id, "5200000")
            f1.result()
            f2.result()

        # Exactly one sale must succeed and one must fail
        self.assertEqual(len(results), 1, f"Results: {results}, Errors: {errors}")
        self.assertEqual(len(errors), 1)
        self.assertEqual(Sale.objects.filter(unit=unit).count(), 1)
        unit.refresh_from_db()
        self.assertEqual(unit.status, VehicleUnit.Status.SOLD)

class InventoryRoleTest(APITestCase):
    """Inspector (Technician-style) can run PDIs but cannot sell or delete."""

    def setUp(self):
        User = get_user_model()
        self.inspector = User.objects.create_user(
            username="inspector", password="x", is_staff=True
        )
        role = Role.objects.create(name="Inspector")
        role.permissions.set(
            Permission.objects.filter(
                content_type__app_label="inventory",
                codename__in=[
                    "view_vehiclemodel",
                    "view_importbatch",
                    "view_vehicleunit",
                    "view_stockmovement",
                    "view_pditemplate",
                    "view_pdichecklistitem",
                    "view_pdiinspection",
                    "add_pdiinspection",
                    "change_pdiinspection",
                    "view_pdiresult",
                    "add_pdiresult",
                    "change_pdiresult",
                    "view_conditionreport",
                    "add_conditionreport",
                    "change_conditionreport",
                ],
            )
        )
        profile, _ = UserProfile.objects.get_or_create(user=self.inspector)
        profile.roles.add(role)

        model = VehicleModel.objects.create(brand="VT", model_name="T1")
        batch = ImportBatch.objects.create(batch_no="IMP-RBAC")
        self.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RBAC",
            import_batch=batch,
            vehicle_model=model,
        )
        template = PDITemplate.objects.get(inspection_type="PDI", version_no=1)
        self.item_ids = list(
            template.items.order_by("sort_order", "id").values_list("id", flat=True)
        )

    def test_inspector_pdi_flow_allowed(self):
        self.client.force_authenticate(self.inspector)
        res = self.client.get("/api/inventory/units/")
        self.assertEqual(res.status_code, 200)
        pdi = self.client.post(
            f"/api/inventory/units/{self.unit.id}/start_pdi/"
        ).data
        self.assertIn("pdi_no", pdi)
        res = self.client.post(
            f"/api/inventory/pdi/{pdi['id']}/submit/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector",
                "results": [{"item": i, "result": "OK"} for i in self.item_ids],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)

    def test_inspector_cannot_sell_or_delete(self):
        self.client.force_authenticate(self.inspector)
        res = self.client.post(
            f"/api/inventory/units/{self.unit.id}/mark_sold/",
            {"sold_price": "1", "customer_name": "X"},
        )
        self.assertEqual(res.status_code, 403)
        res = self.client.delete(f"/api/inventory/units/{self.unit.id}/")
        self.assertEqual(res.status_code, 403)
        res = self.client.post("/api/inventory/batches/1/add_units/", {}, format="json")
        self.assertEqual(res.status_code, 403)


class SaleCancelAndEditTest(APITestCase):
    def setUp(self):
        self.roles = seed_starter_roles()
        self.admin = User.objects.create_superuser(
            username="admin-user", password="x", email="admin@example.com"
        )
        self.sales_manager = User.objects.create_user(
            username="sm-user", password="x"
        )
        UserProfile.objects.get_or_create(user=self.sales_manager)
        self.sales_manager.profile.roles.add(self.roles["Sales Manager"])

        self.sales_exec = User.objects.create_user(
            username="se-user", password="x"
        )
        UserProfile.objects.get_or_create(user=self.sales_exec)
        self.sales_exec.profile.roles.add(self.roles["Sales Executive"])

        self.model = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI CANCEL TEST",
            battery_power_kw="100",
            motor_power_kw="120",
            seating_capacity=2,
            charger_type=VehicleModel.CHARGER_DC_FAST,
        )
        self.batch = ImportBatch.objects.create(batch_no="IMP-CANCEL-001")
        self.template = PDITemplate.objects.get(inspection_type="PDI", version_no=1)
        self.unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-CANCEL-001",
            import_batch=self.batch,
            vehicle_model=self.model,
            color="Silver",
            selling_price="5000000",
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        PDIInspection.objects.create(
            vehicle=self.unit,
            template=self.template,
            status=PDIInspection.InspectionStatus.APPROVED,
            overall_rating="GOOD",
        )
        self.lead = Lead.objects.create(
            phone="9841234567",
            name="Ramesh Thapa",
            status=Lead.Status.QUALIFIED,
        )
        self.customer = Customer.objects.create(
            lead=self.lead,
            name="Ramesh Thapa",
            phone="9841234567",
            phone_normalized="+9779841234567",
        )
        self.quotation = Quotation.objects.create(
            customer=self.customer,
            lead=self.lead,
            vehicle_model=self.model,
            vehicle_price=5000000,
        )
        self.sale = record_sale(
            unit_id=self.unit.id,
            customer_id=self.customer.id,
            sold_price="5000000",
            lead_id=self.lead.id,
            quotation_id=self.quotation.id,
            user=self.admin,
        )

    def test_cannot_delete_sale(self):
        from django.core.exceptions import ValidationError as DjangoValidationError

        with self.assertRaises(DjangoValidationError):
            self.sale.delete()

        self.client.force_authenticate(self.admin)
        res = self.client.delete(f"/api/inventory/sales/{self.sale.id}/")
        self.assertEqual(res.status_code, 405)

    def test_update_non_critical_fields_writes_audit_log(self):
        self.client.force_authenticate(self.sales_manager)
        res = self.client.patch(
            f"/api/inventory/sales/{self.sale.id}/",
            {
                "notes": "Urgent delivery requested",
                "receipt_no": "REC-9999",
                "tax_invoice_no": "TAX-1111",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.notes, "Urgent delivery requested")
        self.assertEqual(self.sale.receipt_no, "REC-9999")
        self.assertEqual(self.sale.tax_invoice_no, "TAX-1111")

        # Syncs to current unit
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.delivery_notes, "Urgent delivery requested")
        self.assertEqual(self.unit.receipt_voucher_no, "REC-9999")
        self.assertEqual(self.unit.tax_invoice_no, "TAX-1111")

        # Check AuditLog
        audits = AuditLog.objects.filter(source="SALE_EDIT", object_id=str(self.sale.id))
        self.assertTrue(
            audits.filter(field_name="notes", new_value="Urgent delivery requested").exists()
        )
        self.assertTrue(
            audits.filter(field_name="receipt_no", new_value="REC-9999").exists()
        )
        self.assertTrue(
            audits.filter(field_name="tax_invoice_no", new_value="TAX-1111").exists()
        )

    def test_cancel_requires_permission_and_reason(self):
        # Sales Exec lacks inventory.cancel_sale
        self.client.force_authenticate(self.sales_exec)
        res = self.client.post(
            f"/api/inventory/sales/{self.sale.id}/cancel/",
            {"cancellation_reason": "Buyer cancelled"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

        # Sales Manager has permission, but reason is missing
        self.client.force_authenticate(self.sales_manager)
        res = self.client.post(
            f"/api/inventory/sales/{self.sale.id}/cancel/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("cancellation_reason", res.data)

    def test_cancel_sale_success_reverts_state_and_logs(self):
        self.client.force_authenticate(self.sales_manager)
        res = self.client.post(
            f"/api/inventory/sales/{self.sale.id}/cancel/",
            {"cancellation_reason": "Customer financing rejected by bank"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        self.sale.refresh_from_db()
        self.assertEqual(self.sale.status, Sale.Status.CANCELLED)
        self.assertFalse(self.sale.is_current)
        self.assertEqual(
            self.sale.cancellation_reason, "Customer financing rejected by bank"
        )
        self.assertEqual(self.sale.cancelled_by, self.sales_manager)
        self.assertIsNotNone(self.sale.cancelled_at)

        # Unit reverted
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, VehicleUnit.Status.READY_FOR_SALE)
        self.assertIsNone(self.unit.current_customer)
        self.assertIsNone(self.unit.sold_price)
        self.assertIsNone(self.unit.sold_date)

        # Customer ledger reverted
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.total_purchases, 0)
        self.assertEqual(self.customer.vehicles, [])

        # Quotation conversion reverted
        self.quotation.refresh_from_db()
        self.assertFalse(self.quotation.converted_to_order)

        # Lead reverted
        self.lead.refresh_from_db()
        self.assertNotEqual(self.lead.status, Lead.Status.CONVERTED)

        # Stock movement logged
        sm = StockMovement.objects.filter(vehicle=self.unit).order_by("-id").first()
        self.assertIsNotNone(sm)
        self.assertEqual(sm.movement_type, StockMovement.MovementType.RETURNED)

        # Activity logged
        act = Activity.objects.filter(customer=self.customer).order_by("-id").first()
        self.assertIsNotNone(act)
        self.assertIn("Sale Cancelled", act.subject)

        # AuditLog logged
        audit = AuditLog.objects.filter(
            source="SALE_CANCEL", object_id=str(self.sale.id)
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.new_value, Sale.Status.CANCELLED)

    def test_cancel_disallowed_if_delivered(self):
        ConditionReport.objects.create(
            vehicle=self.unit,
            template=self.template,
            report_type=ConditionReport.ReportType.AT_DELIVERY,
        )
        self.client.force_authenticate(self.sales_manager)
        res = self.client.post(
            f"/api/inventory/sales/{self.sale.id}/cancel/",
            {"cancellation_reason": "Return request"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("already been delivered", str(res.data))

    def test_earlier_sale_stays_history_on_cancel(self):
        earlier_sale = Sale.objects.create(
            unit=self.unit,
            customer=self.customer,
            selling_price="4500000",
            is_current=False,
        )
        self.client.force_authenticate(self.sales_manager)
        res = self.client.post(
            f"/api/inventory/sales/{self.sale.id}/cancel/",
            {"cancellation_reason": "Deal fell through"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        earlier_sale.refresh_from_db()
        self.assertFalse(earlier_sale.is_current)


class BatteryNumberUniquenessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="battery-admin", password="x", email="b@b.com"
        )
        self.model = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI 10T",
            battery_power_kw="100.27",
            motor_power_kw="120",
        )
        self.batch = ImportBatch.objects.create(batch_no="IMP-BAT-001")

    def test_multiple_units_with_blank_battery_no_allowed(self):
        unit1 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-BLANK-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="",
        )
        unit2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-BLANK-002",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="",
        )
        self.assertEqual(unit1.battery_no, "")
        self.assertEqual(unit2.battery_no, "")

    def test_duplicate_battery_no_raises_validation_error_with_conflicting_vin(self):
        VehicleUnit.objects.create(
            vin_chassis_no="VIN-BAT-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-SN-12345",
        )
        unit2 = VehicleUnit(
            vin_chassis_no="VIN-BAT-002",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-SN-12345",
        )
        with self.assertRaises(DjangoValidationError) as ctx:
            unit2.clean()
        self.assertIn("Battery number already used on unit VIN-VIN-BAT-001", str(ctx.exception))

        with self.assertRaises(DjangoValidationError) as ctx2:
            unit2.save()
        self.assertIn("Battery number already used on unit VIN-VIN-BAT-001", str(ctx2.exception))

    def test_duplicate_battery_no_case_insensitive_and_whitespace(self):
        VehicleUnit.objects.create(
            vin_chassis_no="VIN-CASE-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-ABC-777",
        )
        unit2 = VehicleUnit(
            vin_chassis_no="VIN-CASE-002",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="  bat-abc-777  ",
        )
        with self.assertRaises(DjangoValidationError) as ctx:
            unit2.clean()
        self.assertIn("Battery number already used on unit VIN-VIN-CASE-001", str(ctx.exception))

    def test_unit_save_own_battery_no_does_not_conflict(self):
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-OWN-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-SELF-001",
        )
        unit.color = "Red"
        unit.clean()
        unit.save()
        unit.refresh_from_db()
        self.assertEqual(unit.color, "Red")

    def test_serializer_validation_rejects_duplicate_battery_no(self):
        from inventory.serializers import UnitCreateSerializer

        VehicleUnit.objects.create(
            vin_chassis_no="VIN-SER-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-SERIALIZER-1",
        )
        data = {
            "vin_chassis_no": "VIN-SER-002",
            "vehicle_model": self.model.id,
            "import_batch": self.batch.id,
            "battery_no": "bat-serializer-1",
            "status": "IN_WAREHOUSE",
        }
        serializer = UnitCreateSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("battery_no", serializer.errors)
        self.assertIn("Battery number already used on unit VIN-VIN-SER-001", str(serializer.errors["battery_no"]))

    def test_bulk_create_rejects_duplicate_battery_no(self):
        from inventory.views import _bulk_create_units

        VehicleUnit.objects.create(
            vin_chassis_no="VIN-EXISTING-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-BULK-001",
        )
        # Duplicate with existing unit
        rows = [
            {
                "vin": "VIN-BULK-NEW-001",
                "model_id": self.model.id,
                "battery_no": "bat-bulk-001",
            }
        ]
        created, errors = _bulk_create_units(self.batch, rows, self.admin)
        self.assertEqual(len(created), 0)
        self.assertIn("Battery number already used on unit VIN-VIN-EXISTING-001", errors[0])

        # Duplicate within the same batch upload
        rows_internal_dup = [
            {
                "vin": "VIN-BULK-A",
                "model_id": self.model.id,
                "battery_no": "BAT-SAME-UPLOAD",
            },
            {
                "vin": "VIN-BULK-B",
                "model_id": self.model.id,
                "battery_no": "bat-same-upload",
            },
        ]
        created, errors = _bulk_create_units(self.batch, rows_internal_dup, self.admin)
        self.assertEqual(len(created), 1)
        self.assertEqual(created, ["VIN-BULK-A"])
        self.assertEqual(len(errors), 1)
        self.assertTrue(any("duplicate battery number" in err.lower() for err in errors))

    def test_unit_search_by_battery_no(self):
        VehicleUnit.objects.create(
            vin_chassis_no="VIN-SEARCH-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            battery_no="BAT-FINDME-8888",
        )
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/inventory/units/?search=FINDME-8888")
        self.assertEqual(res.status_code, 200)
        results = res.data if isinstance(res.data, list) else res.data.get("results", [])
        vins = [u["vin_chassis_no"] for u in results]
        self.assertIn("VIN-SEARCH-001", vins)


class InventoryAdditionalsApiTest(InventoryApiTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)

    def test_transport_status_crud_and_in_use_delete_protection(self):
        from inventory.models import TransportStatusOption

        # Create
        create_res = self.client.post(
            "/api/inventory/transport-statuses/",
            {"name": "AT_KATHMANDU_CUSTOMS", "label": "At Kathmandu Customs", "is_active": True},
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        status_id = create_res.data["id"]
        self.assertEqual(create_res.data["name"], "AT_KATHMANDU_CUSTOMS")
        self.assertEqual(create_res.data["label"], "At Kathmandu Customs")

        # List
        list_res = self.client.get("/api/inventory/transport-statuses/")
        self.assertEqual(list_res.status_code, 200)
        names = [item["name"] for item in list_res.data]
        self.assertIn("AT_KATHMANDU_CUSTOMS", names)

        # Update
        update_res = self.client.patch(
            f"/api/inventory/transport-statuses/{status_id}/",
            {"label": "At Tribhuvan Customs", "is_active": False},
            format="json",
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.data["label"], "At Tribhuvan Customs")
        self.assertFalse(update_res.data["is_active"])

        # Link to a batch so it is in use
        self.batch.transport_status = "AT_KATHMANDU_CUSTOMS"
        self.batch.save(update_fields=["transport_status"])

        # Attempt delete -> should fail with 400
        del_fail = self.client.delete(f"/api/inventory/transport-statuses/{status_id}/")
        self.assertEqual(del_fail.status_code, 400)
        self.assertIn("Cannot delete", del_fail.data["detail"])

        # Unlink batch
        self.batch.transport_status = "IN_TRANSIT"
        self.batch.save(update_fields=["transport_status"])

        # Delete -> should succeed
        del_ok = self.client.delete(f"/api/inventory/transport-statuses/{status_id}/")
        self.assertEqual(del_ok.status_code, 204)

    def test_border_crossing_crud_and_in_use_delete_protection(self):
        # Create
        res = self.client.post(
            "/api/inventory/border-crossings/",
            {"name": "Hilsa (Humla)", "description": "Northwest border crossing", "is_active": True},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        bc_id = res.data["id"]

        # In use protection
        self.batch.border_crossing = "Hilsa (Humla)"
        self.batch.save(update_fields=["border_crossing"])

        del_fail = self.client.delete(f"/api/inventory/border-crossings/{bc_id}/")
        self.assertEqual(del_fail.status_code, 400)

        self.batch.border_crossing = "Rasuwagadhi (Kerung)"
        self.batch.save(update_fields=["border_crossing"])

        del_ok = self.client.delete(f"/api/inventory/border-crossings/{bc_id}/")
        self.assertEqual(del_ok.status_code, 204)

    def test_destination_warehouse_crud_and_in_use_delete_protection(self):
        # Create
        res = self.client.post(
            "/api/inventory/destination-warehouses/",
            {
                "name": "Pokhara Regional Yard",
                "location": "Pokhara-8",
                "contact_person": "Ramesh KC",
                "phone": "9800000000",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        wh_id = res.data["id"]

        # In use protection
        self.batch.destination_warehouse = "Pokhara Regional Yard"
        self.batch.save(update_fields=["destination_warehouse"])

        del_fail = self.client.delete(f"/api/inventory/destination-warehouses/{wh_id}/")
        self.assertEqual(del_fail.status_code, 400)

        self.batch.destination_warehouse = "Kathmandu Central Stockyard"
        self.batch.save(update_fields=["destination_warehouse"])

        del_ok = self.client.delete(f"/api/inventory/destination-warehouses/{wh_id}/")
        self.assertEqual(del_ok.status_code, 204)

    def test_inventory_meta_endpoint(self):
        res = self.client.get("/api/inventory/meta/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("transport_statuses", res.data)
        self.assertIn("border_crossings", res.data)
        self.assertIn("destination_warehouses", res.data)
        self.assertTrue(len(res.data["transport_statuses"]) > 0)
        self.assertTrue(len(res.data["border_crossings"]) > 0)
        self.assertTrue(len(res.data["destination_warehouses"]) > 0)


class VehicleVariantTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="variant-admin", password="x", email="vadmin@example.com"
        )
        self.client.force_authenticate(user=self.admin)
        self.model_a = VehicleModel.objects.create(
            brand="VT",
            model_name="AOCHI 6T",
            battery_power_kw="81.14",
            motor_power_kw="110",
            seating_capacity=2,
            charger_type=VehicleModel.CHARGER_DC_FAST,
        )
        self.model_b = VehicleModel.objects.create(
            brand="VT",
            model_name="F350 EV",
            battery_power_kw="66.8",
            motor_power_kw="90",
            seating_capacity=3,
            charger_type=VehicleModel.CHARGER_DC_FAST,
        )
        self.body_container = VehicleBodyType.objects.create(
            name="Container",
            description="Enclosed box body",
            sort_order=1,
        )
        self.body_chiller = VehicleBodyType.objects.create(
            name="Chiller",
            description="Refrigerated insulated body",
            sort_order=2,
        )
        self.variant_container = VehicleVariant.objects.create(
            vehicle_model=self.model_a,
            name="Container 14ft",
            body_type=self.body_container,
            spec_text="14-foot dry freight container",
            price_override=3500000.00,
        )
        self.variant_chiller = VehicleVariant.objects.create(
            vehicle_model=self.model_a,
            name="Chiller 14ft",
            body_type=self.body_chiller,
            spec_text="14-foot temperature controlled body",
            price_override=4200000.00,
        )
        self.variant_b = VehicleVariant.objects.create(
            vehicle_model=self.model_b,
            name="Standard Tipper",
            body_type=self.body_container,
        )
        self.customer = Customer.objects.create(
            name="Sita Ram Logistics",
            phone="9841234567",
        )
        self.batch = ImportBatch.objects.create(
            batch_no="BATCH-VAR-001",
            transport_status="IN_TRANSIT",
        )

    def test_body_type_crud_api(self):
        res = self.client.post(
            "/api/inventory/body-types/",
            {
                "name": "Flatbed",
                "description": "Open flat cargo deck",
                "sort_order": 3,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        bt_id = res.data["id"]

        list_res = self.client.get("/api/inventory/body-types/")
        self.assertEqual(list_res.status_code, 200)
        names = [item["name"] for item in list_res.data]
        self.assertIn("Flatbed", names)

        # Update
        patch_res = self.client.patch(
            f"/api/inventory/body-types/{bt_id}/",
            {"description": "Updated flatbed description"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["description"], "Updated flatbed description")

    def test_variant_crud_api(self):
        res = self.client.post(
            "/api/inventory/variants/",
            {
                "vehicle_model": self.model_a.id,
                "name": "High Cube Container",
                "body_type": self.body_container.id,
                "spec_text": "High volume container",
                "price_override": "3750000.00",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["body_type_name"], "Container")
        self.assertEqual(res.data["vehicle_model_name"], "VT AOCHI 6T")

        # Filter variants by model
        filter_res = self.client.get(f"/api/inventory/variants/?vehicle_model={self.model_a.id}")
        self.assertEqual(filter_res.status_code, 200)
        self.assertEqual(len(filter_res.data), 3)

    def test_model_has_active_variants_and_serializer_nested_variants(self):
        self.assertTrue(self.model_a.has_active_variants)
        res = self.client.get(f"/api/inventory/models/{self.model_a.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["has_active_variants"])
        self.assertGreaterEqual(len(res.data["variants"]), 2)

        # Model with inactive variants only
        self.variant_b.is_active = False
        self.variant_b.save()
        self.assertFalse(self.model_b.has_active_variants)

    def test_unit_creation_requires_variant_when_model_has_active_variants(self):
        # Model A has active variants — creating without variant must fail
        res_fail = self.client.post(
            "/api/inventory/units/",
            {
                "vin_chassis_no": "TEST-VIN-VAR-001",
                "vehicle_model": self.model_a.id,
                "import_batch": self.batch.id,
                "status": VehicleUnit.Status.IN_WAREHOUSE,
            },
            format="json",
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("variant", res_fail.data)

        # Providing a valid variant succeeds
        res_ok = self.client.post(
            "/api/inventory/units/",
            {
                "vin_chassis_no": "TEST-VIN-VAR-001",
                "vehicle_model": self.model_a.id,
                "variant": self.variant_container.id,
                "import_batch": self.batch.id,
                "status": VehicleUnit.Status.IN_WAREHOUSE,
            },
            format="json",
        )
        self.assertEqual(res_ok.status_code, 201)
        self.assertEqual(res_ok.data["variant"], self.variant_container.id)
        self.assertEqual(res_ok.data["variant_name"], "Container 14ft")
        self.assertIsNotNone(res_ok.data["variant_detail"])
        self.assertEqual(res_ok.data["variant_detail"]["body_type_name"], "Container")

    def test_unit_creation_without_variant_succeeds_when_model_has_no_variants(self):
        # Create a model with no variants
        model_plain = VehicleModel.objects.create(
            brand="VT",
            model_name="PLAIN MODEL",
        )
        res = self.client.post(
            "/api/inventory/units/",
            {
                "vin_chassis_no": "TEST-VIN-PLAIN-001",
                "vehicle_model": model_plain.id,
                "import_batch": self.batch.id,
                "status": VehicleUnit.Status.IN_WAREHOUSE,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(res.data["variant"])

    def test_unit_creation_rejects_variant_from_wrong_model(self):
        # variant_b belongs to model_b, not model_a
        res = self.client.post(
            "/api/inventory/units/",
            {
                "vin_chassis_no": "TEST-VIN-WRONG-001",
                "vehicle_model": self.model_a.id,
                "variant": self.variant_b.id,
                "import_batch": self.batch.id,
                "status": VehicleUnit.Status.IN_WAREHOUSE,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("variant", res.data)

    def test_existing_unit_without_variant_remains_valid(self):
        # Simulate grandfathered unit created before variants existed
        unit = VehicleUnit.objects.create(
            vin_chassis_no="TEST-VIN-LEGACY-001",
            vehicle_model=self.model_a,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        self.assertIsNone(unit.variant)
        # Unit should still be clean and updatable without forcing a variant backfill
        unit.color = "White"
        unit.save()
        unit.refresh_from_db()
        self.assertEqual(unit.color, "White")
        self.assertIsNone(unit.variant)

    def test_quotation_variant_validation_and_detail(self):
        # New quotation for model with active variants requires variant
        res_fail = self.client.post(
            "/api/crm/quotations/",
            {
                "customer": self.customer.id,
                "vehicle_model": self.model_a.id,
                "vehicle_price": 3500000,
            },
            format="json",
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("variant", res_fail.data)

        # Quotation with wrong model variant fails
        res_wrong = self.client.post(
            "/api/crm/quotations/",
            {
                "customer": self.customer.id,
                "vehicle_model": self.model_a.id,
                "variant": self.variant_b.id,
                "vehicle_price": 3500000,
            },
            format="json",
        )
        self.assertEqual(res_wrong.status_code, 400)
        self.assertIn("variant", res_wrong.data)

        # Valid variant succeeds
        res_ok = self.client.post(
            "/api/crm/quotations/",
            {
                "customer": self.customer.id,
                "vehicle_model": self.model_a.id,
                "variant": self.variant_container.id,
                "vehicle_price": 3500000,
            },
            format="json",
        )
        self.assertEqual(res_ok.status_code, 201)
        self.assertEqual(res_ok.data["variant"], self.variant_container.id)
        self.assertIsNotNone(res_ok.data["variant_detail"])
        self.assertEqual(res_ok.data["variant_detail"]["name"], "Container 14ft")
        # Legacy vehicle field includes variant name
        self.assertIn("Container 14ft", res_ok.data["vehicle"])

    def test_sale_auto_populates_variant_from_unit(self):
        unit = VehicleUnit.objects.create(
            vin_chassis_no="TEST-VIN-SALE-001",
            vehicle_model=self.model_a,
            variant=self.variant_container,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        sale = Sale.objects.create(
            unit=unit,
            customer=self.customer,
            selling_price=3500000,
        )
        self.assertEqual(sale.variant, self.variant_container)

        # Test serializer exposes variant details
        res = self.client.get(f"/api/inventory/sales/{sale.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["variant"], self.variant_container.id)
        self.assertEqual(res.data["variant_name"], "Container 14ft")

    def test_lead_stores_vehicle_model_and_variant(self):
        res = self.client.post(
            "/api/crm/leads/",
            {
                "name": "Ram Bahadur",
                "phone": "9812345678",
                "vehicle_model": self.model_a.id,
                "variant": self.variant_chiller.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["vehicle_model"], self.model_a.id)
        self.assertEqual(res.data["variant"], self.variant_chiller.id)
        self.assertEqual(res.data["variant_detail"]["name"], "Chiller 14ft")
        self.assertIn("Chiller 14ft", res.data["vehicle"])

    def test_variant_filter_on_units_and_quotations(self):
        u1 = VehicleUnit.objects.create(
            vin_chassis_no="TEST-FILTER-001",
            vehicle_model=self.model_a,
            variant=self.variant_container,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        u2 = VehicleUnit.objects.create(
            vin_chassis_no="TEST-FILTER-002",
            vehicle_model=self.model_a,
            variant=self.variant_chiller,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        # Unit filter by variant
        res_u = self.client.get(f"/api/inventory/units/?variant={self.variant_container.id}")
        self.assertEqual(res_u.status_code, 200)
        units_list = res_u.data["results"] if isinstance(res_u.data, dict) and "results" in res_u.data else res_u.data
        vins = [item["vin_chassis_no"] for item in units_list]
        self.assertIn("TEST-FILTER-001", vins)
        self.assertNotIn("TEST-FILTER-002", vins)

        # Quotation filter by variant
        q1 = Quotation.objects.create(
            customer=self.customer,
            vehicle_model=self.model_a,
            variant=self.variant_container,
            vehicle_price=3500000,
        )
        q2 = Quotation.objects.create(
            customer=self.customer,
            vehicle_model=self.model_a,
            variant=self.variant_chiller,
            vehicle_price=4200000,
        )
        res_q = self.client.get(f"/api/crm/quotations/?variant={self.variant_container.id}")
        self.assertEqual(res_q.status_code, 200)
        quotes_list = res_q.data["results"] if isinstance(res_q.data, dict) and "results" in res_q.data else res_q.data
        q_ids = [str(item["id"]) for item in quotes_list]
        self.assertIn(str(q1.id), q_ids)
        self.assertNotIn(str(q2.id), q_ids)


class UnifiedInspectionEngineTests(APITestCase):
    def setUp(self):
        seed_starter_roles()
        from accounts.models import get_user_profile
        self.admin = User.objects.create_superuser("admin_unified", "admin_u@example.np", "pass123")
        self.service_mgr = User.objects.create_user("sm_unified", "sm_u@example.np", "pass123", is_staff=True)
        get_user_profile(self.service_mgr).roles.set(Role.objects.filter(name="Service Manager"))
        self.tech = User.objects.create_user("tech_unified", "tech_u@example.np", "pass123", is_staff=True)
        get_user_profile(self.tech).roles.set(Role.objects.filter(name="Technician"))

        self.model = VehicleModel.objects.create(
            brand="VT",
            model_name="E-Van 300",
            battery_power_kw="40.5",
            motor_power_kw="60",
        )
        self.batch = ImportBatch.objects.create(batch_no="IMP-UNIFIED-01")
        self.unit_wh = VehicleUnit.objects.create(
            vin_chassis_no="VIN-UNIFIED-WH-001",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
            selling_price=2800000,
        )
        self.unit_transit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-UNIFIED-TR-002",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_TRANSIT,
            selling_price=2800000,
        )
        self.customer = Customer.objects.create(name="Shyam Thapa", phone="9849112233")

    def test_templates_seeded_per_inspection_type(self):
        pdi_tmpl = PDITemplate.objects.filter(inspection_type="PDI", is_active=True).first()
        vei_tmpl = PDITemplate.objects.filter(inspection_type="VEI", is_active=True).first()
        self.assertIsNotNone(pdi_tmpl)
        self.assertIsNotNone(vei_tmpl)
        self.assertTrue(pdi_tmpl.items.exists())
        self.assertTrue(vei_tmpl.items.exists())
        self.assertEqual(pdi_tmpl.inspection_type, "PDI")
        self.assertEqual(vei_tmpl.inspection_type, "VEI")

    def test_sequence_numbering_prefixes(self):
        self.client.force_authenticate(self.admin)
        res_pdi = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        self.assertEqual(res_pdi.status_code, 201)
        self.assertTrue(res_pdi.data["pdi_no"].startswith("PDI-"))
        self.assertEqual(res_pdi.data["inspection_type"], "PDI")

        unit_wh2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-UNIFIED-WH-002",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )
        res_vei = self.client.post(f"/api/inventory/units/{unit_wh2.id}/start_vei/")
        self.assertEqual(res_vei.status_code, 201)
        self.assertTrue(res_vei.data["pdi_no"].startswith("VEI-"))
        self.assertEqual(res_vei.data["inspection_type"], "VEI")

    def test_start_vei_and_pdi_status_guards(self):
        self.client.force_authenticate(self.admin)
        # Unit in IN_TRANSIT can start VEI (entry from China)
        res_vei_tr = self.client.post(f"/api/inventory/units/{self.unit_transit.id}/start_vei/")
        self.assertEqual(res_vei_tr.status_code, 201)

        # Unit in IN_TRANSIT cannot start PDI
        res_pdi_tr = self.client.post(f"/api/inventory/units/{self.unit_transit.id}/start_pdi/")
        self.assertEqual(res_pdi_tr.status_code, 400)
        self.assertIn("Cannot start PDI", str(res_pdi_tr.data))

    def test_complete_lifecycle_and_locking(self):
        self.client.force_authenticate(self.service_mgr)
        res_start = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        pdi_id = res_start.data["id"]
        insp = PDIInspection.objects.get(pk=pdi_id)
        self.assertEqual(insp.status, PDIInspection.InspectionStatus.DRAFT)
        self.assertFalse(insp.is_locked)

        # Cannot complete without answering items
        res_comp_fail = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/complete/",
            {"overall_rating": "GOOD", "checked_by": "Inspector Test"},
            format="json",
        )
        self.assertEqual(res_comp_fail.status_code, 400)

        # Answer all checklist items
        results_payload = [
            {"item": item.id, "result": "OK", "remark": ""}
            for item in insp.template.items.all()
        ]
        res_comp = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/complete/",
            {
                "overall_rating": "GOOD",
                "checked_by": "Inspector Test",
                "results": results_payload,
            },
            format="json",
        )
        self.assertEqual(res_comp.status_code, 200)
        insp.refresh_from_db()
        self.assertEqual(insp.status, PDIInspection.InspectionStatus.COMPLETED)
        self.assertTrue(insp.is_locked)
        self.unit_wh.refresh_from_db()
        self.assertEqual(self.unit_wh.status, VehicleUnit.Status.PDI_PASSED)

        # Lock inspection
        res_lock = self.client.post(f"/api/inventory/pdi/{pdi_id}/lock/")
        self.assertEqual(res_lock.status_code, 200)
        insp.refresh_from_db()
        self.assertEqual(insp.status, PDIInspection.InspectionStatus.LOCKED)

        # Editing when locked is rejected
        res_edit = self.client.patch(
            f"/api/inventory/pdi/{pdi_id}/",
            {"checked_by": "Hacker Edit"},
            format="json",
        )
        self.assertEqual(res_edit.status_code, 400)

    def test_reopen_permission_enforcement(self):
        # Create and complete inspection as admin
        self.client.force_authenticate(self.admin)
        res_start = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        pdi_id = res_start.data["id"]
        insp = PDIInspection.objects.get(pk=pdi_id)
        results_payload = [
            {"item": item.id, "result": "OK", "remark": ""}
            for item in insp.template.items.all()
        ]
        res_comp = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/complete/",
            {
                "overall_rating": "VERY_GOOD",
                "checked_by": "Inspector Admin",
                "results": results_payload,
            },
            format="json",
        )
        self.assertEqual(res_comp.status_code, 200)
        res_lock = self.client.post(f"/api/inventory/pdi/{pdi_id}/lock/")
        self.assertEqual(res_lock.status_code, 200)

        # Technician (lacking reopen_pdiinspection) tries to reopen -> 403 Forbidden
        self.client.force_authenticate(self.tech)
        res_tech_reopen = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/reopen/",
            {"note": "Tech trying to reopen"},
            format="json",
        )
        self.assertEqual(res_tech_reopen.status_code, 403)

        # Service Manager (has reopen_pdiinspection) reopens -> 200 OK
        self.client.force_authenticate(self.service_mgr)
        res_sm_reopen = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/reopen/",
            {"note": "Found additional issue with wiper"},
            format="json",
        )
        self.assertEqual(res_sm_reopen.status_code, 200)
        insp.refresh_from_db()
        self.assertEqual(insp.status, PDIInspection.InspectionStatus.DRAFT)
        self.assertFalse(insp.is_locked)
        self.unit_wh.refresh_from_db()
        self.assertEqual(self.unit_wh.status, VehicleUnit.Status.PDI_PENDING)

    def test_sale_validation_requires_completed_pdi(self):
        u = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SALE-PDI-CHECK",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
            selling_price=3000000,
        )
        # Attempt to sell with no PDI -> fails
        with self.assertRaises((DjangoValidationError, DRFValidationError)):
            record_sale(
                unit_id=u.id,
                customer_id=self.customer.id,
                sold_price=3000000,
            )

        # Complete only a VEI (Vehicle Entry Inspection) -> still fails
        vei_tmpl = PDITemplate.objects.filter(inspection_type="VEI", is_active=True).first()
        vei = PDIInspection.objects.create(
            inspection_type="VEI",
            vehicle=u,
            template=vei_tmpl,
            status=PDIInspection.InspectionStatus.COMPLETED,
            overall_rating="GOOD",
        )
        with self.assertRaises((DjangoValidationError, DRFValidationError)):
            record_sale(
                unit_id=u.id,
                customer_id=self.customer.id,
                sold_price=3000000,
            )

        # Complete a PDI -> sale succeeds
        pdi_tmpl = PDITemplate.objects.filter(inspection_type="PDI", is_active=True).first()
        PDIInspection.objects.create(
            inspection_type="PDI",
            vehicle=u,
            template=pdi_tmpl,
            status=PDIInspection.InspectionStatus.COMPLETED,
            overall_rating="GOOD",
        )
        sale = record_sale(
            unit_id=u.id,
            customer_id=self.customer.id,
            sold_price=3000000,
        )
        self.assertIsNotNone(sale)
        u.refresh_from_db()
        self.assertEqual(u.status, VehicleUnit.Status.SOLD)

    def test_record_print_event_on_inspection(self):
        self.client.force_authenticate(self.admin)
        res_start = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        pdi_id = res_start.data["id"]
        res_print = self.client.post(f"/api/inventory/pdi/{pdi_id}/record-print/")
        self.assertEqual(res_print.status_code, 200)
        self.assertIn("log_id", res_print.data)

        log = AuditLog.objects.get(pk=res_print.data["log_id"])
        self.assertEqual(log.action, AuditLog.Action.PRINT)
        self.assertEqual(log.new_value, "PDI_REPORT")

    def test_daily_activity_rollup_counts_both_inspection_types(self):
        from common.services.rollup import rollup_daily_activity
        from common.models import DailyActivityRollup
        from django.utils import timezone
        today = timezone.localdate()

        pdi_tmpl = PDITemplate.objects.filter(inspection_type="PDI", is_active=True).first()
        vei_tmpl = PDITemplate.objects.filter(inspection_type="VEI", is_active=True).first()

        PDIInspection.objects.create(
            inspection_type="PDI",
            vehicle=self.unit_wh,
            template=pdi_tmpl,
            inspection_date=today,
            status=PDIInspection.InspectionStatus.COMPLETED,
            checked_by_user=self.admin,
        )
        PDIInspection.objects.create(
            inspection_type="VEI",
            vehicle=self.unit_transit,
            template=vei_tmpl,
            inspection_date=today,
            status=PDIInspection.InspectionStatus.COMPLETED,
            checked_by_user=self.admin,
        )
        rollup_daily_activity(start_date=today, end_date=today, user_id=self.admin.id)
        rollup = DailyActivityRollup.objects.filter(
            user=self.admin,
            date=today,
            action_type="INSPECTION_DONE",
        ).first()
        self.assertIsNotNone(rollup)
        self.assertGreaterEqual(rollup.count, 2)

        vei_rollup = DailyActivityRollup.objects.filter(
            user=self.admin,
            date=today,
            action_type="VEI_COMPLETED",
        ).first()
        pdi_rollup = DailyActivityRollup.objects.filter(
            user=self.admin,
            date=today,
            action_type="PDI_COMPLETED",
        ).first()
        self.assertIsNotNone(vei_rollup)
        self.assertEqual(vei_rollup.count, 1)
        self.assertIsNotNone(pdi_rollup)
        self.assertEqual(pdi_rollup.count, 1)

    def test_failed_checklist_item_creates_issue_and_resolves(self):
        from inventory.models import InspectionIssue, CheckResult
        self.client.force_authenticate(self.admin)
        res_start = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        pdi_id = res_start.data["id"]
        pdi = PDIInspection.objects.get(pk=pdi_id)
        first_item = pdi.template.items.first()

        # Submit results with one NOT_OK item
        res_save = self.client.patch(
            f"/api/inventory/pdi/{pdi_id}/",
            {
                "results_write": [
                    {
                        "item": first_item.id,
                        "result": CheckResult.NOT_OK,
                        "remark": "Scratched front bumper",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(res_save.status_code, 200)

        # Verify an InspectionIssue was auto-created
        issue = InspectionIssue.objects.filter(inspection=pdi, item=first_item).first()
        self.assertIsNotNone(issue)
        self.assertFalse(issue.resolved)
        self.assertIn("Scratched front bumper", issue.description)

        # Check issues show on inspection detail API
        res_detail = self.client.get(f"/api/inventory/pdi/{pdi_id}/")
        self.assertEqual(res_detail.data["open_issues_count"], 1)
        self.assertEqual(len(res_detail.data["issues"]), 1)

        # Check open issues show on unit profile API
        res_unit = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_unit.data["open_inspection_issues_count"], 1)
        self.assertEqual(len(res_unit.data["open_inspection_issues"]), 1)
        self.assertEqual(res_unit.data["open_inspection_issues"][0]["id"], issue.id)

        # Marking the item OK clears the open issue.
        res_ok = self.client.patch(
            f"/api/inventory/pdi/{pdi_id}/",
            {"results_write": [{"item": first_item.id, "result": CheckResult.OK, "remark": ""}]},
            format="json",
        )
        self.assertEqual(res_ok.status_code, 200)
        issue.refresh_from_db()
        self.assertTrue(issue.resolved)
        res_unit_ok = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_unit_ok.data["open_inspection_issues_count"], 0)

        # Not OK again reopens it so the explicit resolve path still applies.
        res_reopen = self.client.patch(
            f"/api/inventory/pdi/{pdi_id}/",
            {
                "results_write": [
                    {"item": first_item.id, "result": CheckResult.NOT_OK, "remark": "Scratched front bumper"}
                ]
            },
            format="json",
        )
        self.assertEqual(res_reopen.status_code, 200)
        issue.refresh_from_db()
        self.assertFalse(issue.resolved)

        # Resolve issue
        res_resolve = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/resolve-issue/",
            {"issue_id": issue.id, "notes": "Repainted and buffed"},
            format="json",
        )
        self.assertEqual(res_resolve.status_code, 200)
        self.assertTrue(res_resolve.data["resolved"])
        self.assertEqual(res_resolve.data["resolved_by_name"], self.admin.get_full_name())

        issue.refresh_from_db()
        self.assertTrue(issue.resolved)
        self.assertEqual(issue.resolution_notes, "Repainted and buffed")

        # Verify open issues count dropped to 0
        res_unit2 = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_unit2.data["open_inspection_issues_count"], 0)

    def test_inspection_photo_uploads_and_validations(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_authenticate(self.admin)
        res_start = self.client.post(f"/api/inventory/units/{self.unit_wh.id}/start_pdi/")
        pdi_id = res_start.data["id"]
        pdi = PDIInspection.objects.get(pk=pdi_id)
        first_item = pdi.template.items.first()

        # 1. Valid image upload on checklist item
        # Tiny valid 1x1 GIF/PNG data
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05"
            b"\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        valid_file = SimpleUploadedFile("bumper.png", png_bytes, content_type="image/png")
        res_item_photo = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/results/{first_item.id}/photo/",
            {"photo": valid_file},
            format="multipart",
        )
        self.assertEqual(res_item_photo.status_code, 200)

        # 2. General photo upload on inspection
        valid_gen = SimpleUploadedFile("general.png", png_bytes, content_type="image/png")
        res_gen_photo = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/photos/",
            {"photo": valid_gen, "caption": "Overall vehicle side view"},
            format="multipart",
        )
        self.assertEqual(res_gen_photo.status_code, 201)
        self.assertEqual(res_gen_photo.data["caption"], "Overall vehicle side view")

        # Signed display URLs load in a plain <img> (no Authorization header).
        detail = self.client.get(f"/api/inventory/pdi/{pdi_id}/").data
        item_src = next(r["photo_display"] for r in detail["results"] if r["item"] == first_item.id)
        general_src = detail["general_photos"][0]["photo_display"]
        self.client.force_authenticate(None)
        for src in (item_src, general_src):
            self.assertIn("sig=", src)
            res_img = self.client.get(src)
            self.assertEqual(res_img.status_code, 200, src)
            self.assertEqual(b"".join(res_img.streaming_content), png_bytes)
        self.client.force_authenticate(self.admin)

        # 3. Reject invalid file type (e.g. text or pdf)
        bad_file = SimpleUploadedFile("document.pdf", b"%PDF-1.4...", content_type="application/pdf")
        res_bad = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/photos/",
            {"photo": bad_file},
            format="multipart",
        )
        self.assertEqual(res_bad.status_code, 400)

        # 4. Reject oversized file (> 5MB)
        large_bytes = b"0" * (5 * 1024 * 1024 + 100)
        oversized_file = SimpleUploadedFile("large.png", large_bytes, content_type="image/png")
        res_oversized = self.client.post(
            f"/api/inventory/pdi/{pdi_id}/photos/",
            {"photo": oversized_file},
            format="multipart",
        )
        self.assertEqual(res_oversized.status_code, 400)

    def test_vei_links_to_import_batch(self):
        self.client.force_authenticate(self.admin)
        res_vei = self.client.post(
            "/api/inventory/pdi/",
            {"vehicle": self.unit_wh.id, "inspection_type": "VEI"},
            format="json",
        )
        self.assertEqual(res_vei.status_code, 201)
        vei_id = res_vei.data["id"]

        # Check that import_batch was linked from unit
        vei = PDIInspection.objects.get(pk=vei_id)
        self.assertEqual(vei.import_batch, self.unit_wh.import_batch)
        self.assertIsNotNone(res_vei.data.get("import_batch_detail"))
        self.assertEqual(res_vei.data["import_batch_detail"]["batch_no"], self.batch.batch_no)

    def test_checklist_template_overrides_and_fallback(self):
        from inventory.models import PDITemplate, PDIChecklistItem, VehicleVariant
        self.client.force_authenticate(self.admin)

        variant = VehicleVariant.objects.create(vehicle_model=self.model, name="Standard Range 40kWh")

        # 1. Global default template exists
        default_tmpl = PDITemplate.objects.filter(
            inspection_type="PDI", vehicle_model__isnull=True, variant__isnull=True, is_active=True
        ).first()
        self.assertIsNotNone(default_tmpl)

        # 2. Query active template for our unit (falls back to default)
        res_active = self.client.get(f"/api/inventory/templates/active/?inspection_type=PDI&unit_id={self.unit_wh.id}")
        self.assertEqual(res_active.status_code, 200)
        self.assertEqual(res_active.data["id"], default_tmpl.id)

        # 3. Create a model-specific template override
        model_tmpl = PDITemplate.objects.create(
            inspection_type="PDI",
            vehicle_model=self.model,
            name="Model Specific PDI",
            version_no=1,
            is_active=True,
        )
        PDIChecklistItem.objects.create(
            template=model_tmpl,
            section="FUNCTIONALITY",
            label="Model specific check item",
            sort_order=1,
        )

        res_model = self.client.get(f"/api/inventory/templates/active/?inspection_type=PDI&vehicle_model={self.model.id}")
        self.assertEqual(res_model.status_code, 200)
        self.assertEqual(res_model.data["id"], model_tmpl.id)

        # 4. Create a variant-specific template override
        var_tmpl = PDITemplate.objects.create(
            inspection_type="PDI",
            vehicle_model=self.model,
            variant=variant,
            name="Variant Specific PDI",
            version_no=1,
            is_active=True,
        )
        PDIChecklistItem.objects.create(
            template=var_tmpl,
            section="FUNCTIONALITY",
            label="Variant specific battery heater test",
            sort_order=1,
        )

        # Unit with variant returns variant template
        self.unit_wh.variant = variant
        self.unit_wh.save(update_fields=["variant"])

        res_var = self.client.get(f"/api/inventory/templates/active/?inspection_type=PDI&unit_id={self.unit_wh.id}")
        self.assertEqual(res_var.status_code, 200)
        self.assertEqual(res_var.data["id"], var_tmpl.id)

        # 5. Template management endpoints (add, update, delete item)
        res_add_item = self.client.post(
            f"/api/inventory/templates/{var_tmpl.id}/items/",
            {
                "section": "APPEARANCE_AND_CONDITION",
                "label": "Custom spoiler check",
                "sort_order": 2,
            },
            format="json",
        )
        self.assertEqual(res_add_item.status_code, 201)
        item_id = res_add_item.data["id"]

        res_upd_item = self.client.patch(
            f"/api/inventory/templates/{var_tmpl.id}/items/{item_id}/",
            {"label": "Updated spoiler check"},
            format="json",
        )
        self.assertEqual(res_upd_item.status_code, 200)
        self.assertEqual(res_upd_item.data["label"], "Updated spoiler check")

        res_del_item = self.client.delete(f"/api/inventory/templates/{var_tmpl.id}/items/{item_id}/delete/")
        self.assertEqual(res_del_item.status_code, 200)

    def test_unit_list_vei_and_pdi_badges(self):
        from inventory.models import CheckResult, InspectionIssue, PDIResult
        from inventory.views import create_pdi_for_unit
        self.client.force_authenticate(self.admin)

        # Fresh unit has NOT_DONE for both
        res_fresh = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_fresh.data["vei_badge"], "NOT_DONE")
        self.assertEqual(res_fresh.data["pdi_badge"], "NOT_DONE")

        # Start PDI -> PENDING
        pdi = create_pdi_for_unit(self.unit_wh, self.admin, inspection_type="PDI")
        res_pending = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_pending.data["pdi_badge"], "PENDING")

        # Answer items all OK and complete -> PASSED
        for item in pdi.template.items.all():
            PDIResult.objects.update_or_create(
                inspection=pdi,
                item=item,
                defaults={"result": CheckResult.OK},
            )
        pdi.status = PDIInspection.InspectionStatus.COMPLETED
        pdi.overall_rating = "VERY_GOOD"
        pdi.save()

        res_passed = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_passed.data["pdi_badge"], "PASSED")

        # Add an unresolved issue -> ISSUES
        InspectionIssue.objects.create(
            inspection=pdi,
            description="Bumper crack",
            resolved=False,
        )
        self.unit_wh.refresh_from_db()
        res_issues = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_issues.data["pdi_badge"], "ISSUES")

        # Rejected PDI -> FAILED
        pdi.status = PDIInspection.InspectionStatus.REJECTED
        pdi.save()
        res_failed = self.client.get(f"/api/inventory/units/{self.unit_wh.id}/")
        self.assertEqual(res_failed.data["pdi_badge"], "FAILED")

    def test_dealer_scoping_on_inspections(self):
        from dealers.models import Dealer
        from accounts.models import get_user_profile

        ktm_dealer = Dealer.objects.create(name="Kathmandu Central", address="Kathmandu")
        prof = get_user_profile(self.tech)
        prof.dealer = ktm_dealer
        prof.save()
        self.tech = User.objects.get(pk=self.tech.pk)

        other_dealer = Dealer.objects.create(name="Pokhara Motors", address="Pokhara")
        other_unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-POKHARA-001",
            vehicle_model=self.model,
            dealer=other_dealer,
            import_batch=self.batch,
            status=VehicleUnit.Status.IN_WAREHOUSE,
        )

        # Technician at KTM dealer
        self.client.force_authenticate(self.tech)

        # 1. Scoped queryset does not show Pokhara unit's inspections
        tmpl = PDITemplate.objects.filter(inspection_type="PDI", is_active=True).first()
        other_insp = PDIInspection.objects.create(
            inspection_type="PDI",
            vehicle=other_unit,
            template=tmpl,
        )
        res_list = self.client.get("/api/inventory/pdi/")
        self.assertEqual(res_list.status_code, 200)
        pdi_data = res_list.data.get("results", []) if isinstance(res_list.data, dict) else res_list.data
        pdi_ids = [item["id"] for item in pdi_data]
        self.assertNotIn(other_insp.id, pdi_ids)

        # 2. Cannot create inspection on other dealer's unit
        res_create = self.client.post(
            "/api/inventory/pdi/",
            {"vehicle": other_unit.id, "inspection_type": "PDI"},
            format="json",
        )
        self.assertEqual(res_create.status_code, 403)

    def test_sale_rule_pdi_check_and_override_audit_logging(self):
        from common.models import AuditLog
        from inventory.services.sales import record_sale
        from rest_framework.exceptions import ValidationError as DRFValidationError
        from django.core.exceptions import ValidationError as DjangoValidationError

        u = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SALE-CHECK-01",
            vehicle_model=self.model,
            import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )

        # 1. Unit without PDI fails
        with self.assertRaises((DjangoValidationError, DRFValidationError)) as ctx:
            record_sale(
                unit_id=u.id,
                customer_id=self.customer.id,
                sold_price=3000000,
            )
        self.assertIn("completed Pre-Delivery Inspection (PDI) is required", str(ctx.exception))

        # 2. VEI-only unit fails with clear message explaining VEI does not qualify
        vei_tmpl = PDITemplate.objects.filter(inspection_type="VEI", is_active=True).first()
        PDIInspection.objects.create(
            inspection_type="VEI",
            vehicle=u,
            template=vei_tmpl,
            status=PDIInspection.InspectionStatus.COMPLETED,
            overall_rating="GOOD",
        )
        with self.assertRaises((DjangoValidationError, DRFValidationError)) as ctx_vei:
            record_sale(
                unit_id=u.id,
                customer_id=self.customer.id,
                sold_price=3000000,
            )
        self.assertIn("Vehicle Entry Inspection (VEI) alone does not qualify", str(ctx_vei.exception))

        # 3. Sale with override_pdi=True succeeds and logs to AuditLog
        sale = record_sale(
            unit_id=u.id,
            customer_id=self.customer.id,
            sold_price=3000000,
            user=self.admin,
            override_pdi=True,
            override_reason="Authorized by Executive Director for express delivery",
        )
        self.assertIsNotNone(sale)
        u.refresh_from_db()
        self.assertEqual(u.status, VehicleUnit.Status.SOLD)

        # Check AuditLog entry
        log = AuditLog.objects.filter(
            source="SALE_PDI_OVERRIDE",
            object_id=str(u.id),
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, AuditLog.Action.UPDATE)
        self.assertIn("Authorized by Executive Director", log.summary)


class ShipmentsAndLandedCostTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.models import Permission
        User = get_user_model()
        from dealers.models import Dealer
        from inventory.models import ImportBatch, ShipmentCostType, VehicleModel, VehicleUnit, VehicleVariant

        cls.admin = User.objects.create_superuser(
            username="shipment_admin", email="shpadmin@example.com", password="pw"
        )
        cls.ho_user = User.objects.create_user(
            username="ho_inventory_user", email="hoinv@example.com", password="pw"
        )
        # Grant inventory view perms
        p_view_b = Permission.objects.get(codename="view_importbatch")
        p_chg_b = Permission.objects.get(codename="change_importbatch")
        p_add_b = Permission.objects.get(codename="add_importbatch")
        p_del_b = Permission.objects.get(codename="delete_importbatch")
        cls.ho_user.user_permissions.add(p_view_b, p_chg_b, p_add_b, p_del_b)

        from accounts.models import UserProfile
        cls.dealer = Dealer.objects.create(name="Pokhara VT Motors")
        cls.dealer_user = User.objects.create_user(
            username="pkr_dealer_staff", email="pkr@example.com", password="pw"
        )
        UserProfile.objects.create(user=cls.dealer_user, dealer=cls.dealer)
        p_view_u = Permission.objects.get(codename="view_vehicleunit")
        cls.dealer_user.user_permissions.add(p_view_u, p_view_b)

        cls.model = VehicleModel.objects.create(brand="VT", model_name="e-Carrier", is_active=True)
        cls.variant = VehicleVariant.objects.create(
            vehicle_model=cls.model, name="Extended Range 42kWh", price_override=3200000, is_active=True
        )

        cls.cost_type_freight = ShipmentCostType.objects.create(code="FREIGHT", name="Sea Freight", is_active=True)
        cls.cost_type_customs = ShipmentCostType.objects.create(code="CUSTOMS", name="Customs Duty", is_active=True)

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def test_shipment_yearly_sequence_generation(self):
        from inventory.models import ImportBatch
        now_year = timezone.now().year
        b1 = ImportBatch.objects.create()
        self.assertTrue(b1.shipment_no.startswith(f"SHP-{now_year}-"))
        self.assertEqual(b1.batch_no, b1.shipment_no)

        b2 = ImportBatch.objects.create()
        self.assertTrue(b2.shipment_no.startswith(f"SHP-{now_year}-"))
        num1 = int(b1.shipment_no.split("-")[-1])
        num2 = int(b2.shipment_no.split("-")[-1])
        self.assertEqual(num2, num1 + 1)

    def test_shipment_costs_calculation_and_landed_cost(self):
        from inventory.models import ImportBatch, ShipmentCost, VehicleUnit
        b = ImportBatch.objects.create()
        # Add 2 units
        u1 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-COST-01", vehicle_model=self.model, import_batch=b, status=VehicleUnit.Status.IN_TRANSIT
        )
        u2 = VehicleUnit.objects.create(
            vin_chassis_no="VIN-COST-02", vehicle_model=self.model, import_batch=b, status=VehicleUnit.Status.IN_TRANSIT
        )
        b.refresh_unit_count()

        # Add cost line in USD: $1,000 at 133.50 NPR/USD = 133,500 NPR
        c1 = ShipmentCost.objects.create(
            shipment=b, cost_type=self.cost_type_freight, amount=1000, currency="USD", exchange_rate=133.50
        )
        self.assertEqual(float(c1.amount_npr), 133500.0)

        # Add cost line in NPR: 50,000 NPR
        c2 = ShipmentCost.objects.create(
            shipment=b, cost_type=self.cost_type_customs, amount=50000, currency="NPR", exchange_rate=1.00
        )
        self.assertEqual(float(c2.amount_npr), 50000.0)

        self.assertEqual(float(b.total_landed_cost_npr), 183500.0)
        # Average cost per unit: 183,500 / 2 = 91,750 NPR
        self.assertEqual(float(b.average_cost_per_unit_npr), 91750.0)

    def test_cost_visibility_permission_gate(self):
        from inventory.models import ImportBatch, ShipmentCost
        b = ImportBatch.objects.create()
        ShipmentCost.objects.create(
            shipment=b, cost_type=self.cost_type_freight, amount=1000, currency="USD", exchange_rate=133.50
        )

        # 1. User without inventory.view_shipment_costs
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp = self.client.get(f"/api/inventory/batches/{b.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data.get("costs"))
        self.assertIsNone(resp.data.get("total_landed_cost_npr"))
        self.assertIsNone(resp.data.get("average_cost_per_unit_npr"))

        # 2. Grant inventory.view_shipment_costs
        p_view_costs = Permission.objects.get(codename="view_shipment_costs")
        self.ho_user.user_permissions.add(p_view_costs)
        if hasattr(self.ho_user, "_perm_cache"):
            del self.ho_user._perm_cache

        resp_with_costs = self.client.get(f"/api/inventory/batches/{b.id}/")
        self.assertEqual(resp_with_costs.status_code, 200)
        self.assertIsNotNone(resp_with_costs.data.get("costs"))
        self.assertEqual(len(resp_with_costs.data["costs"]), 1)
        self.assertEqual(float(resp_with_costs.data.get("total_landed_cost_npr")), 133500.0)

    def test_shipment_status_change_and_stock_receipt(self):
        from inventory.models import ImportBatch, VehicleUnit
        from common.models import AuditLog
        b = ImportBatch.objects.create(status=ImportBatch.ShipmentStatus.IN_TRANSIT)
        u = VehicleUnit.objects.create(
            vin_chassis_no="VIN-RECV-01", vehicle_model=self.model, import_batch=b, status=VehicleUnit.Status.IN_TRANSIT
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.admin)}")
        resp = self.client.post(
            f"/api/inventory/batches/{b.id}/change-status/",
            {"status": "RECEIVED", "receive_units": True, "notes": "Consignment arrived at Kathmandu"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        b.refresh_from_db()
        self.assertEqual(b.status, ImportBatch.ShipmentStatus.RECEIVED)
        u.refresh_from_db()
        self.assertEqual(u.status, VehicleUnit.Status.IN_WAREHOUSE)

        # Check AuditLog
        log = AuditLog.objects.filter(field_name="status", object_id=str(b.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.new_value, "RECEIVED")

    def test_shipment_can_close_without_required_documents(self):
        from inventory.models import ImportBatch
        from crm.models import DocumentTypeMaster

        b = ImportBatch.objects.create(status=ImportBatch.ShipmentStatus.RECEIVED)
        DocumentTypeMaster.objects.get_or_create(
            code="BILL_OF_LADING",
            defaults={"name": "Bill of Lading", "is_required_for_shipment": True},
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.ho_user)}")
        resp = self.client.post(
            f"/api/inventory/batches/{b.id}/change-status/",
            {"status": "CLOSED"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        b.refresh_from_db()
        self.assertEqual(b.status, ImportBatch.ShipmentStatus.CLOSED)

    def test_dealer_scoping_for_shipments(self):
        from inventory.models import ImportBatch, VehicleUnit
        b = ImportBatch.objects.create(actual_arrival_date=timezone.localdate())
        u = VehicleUnit.objects.create(
            vin_chassis_no="VIN-DLR-SCOPE-01",
            vehicle_model=self.model,
            import_batch=b,
            dealer=self.dealer,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )

        # 1. Dealer user gets empty queryset when listing batches/shipments
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.dealer_user)}")
        resp_batches = self.client.get("/api/inventory/batches/")
        self.assertEqual(resp_batches.status_code, 200)
        results = resp_batches.data if isinstance(resp_batches.data, list) else resp_batches.data.get("results", [])
        self.assertEqual(len(results), 0)

        # 2. Dealer user CAN see shipment_no and shipment_arrival_date on the unit profile
        resp_unit = self.client.get(f"/api/inventory/units/{u.id}/")
        self.assertEqual(resp_unit.status_code, 200)
        self.assertEqual(resp_unit.data.get("shipment_no"), b.shipment_no)
        self.assertEqual(str(resp_unit.data.get("shipment_arrival_date")), str(b.actual_arrival_date))


class HistoricalImportTests(APITestCase):
    def setUp(self):
        import io
        from accounts.models import UserProfile, Role
        from common.models import AuditLog, DailyActivityRollup
        from common.services.rollup import rollup_daily_activity
        from crm.models import Customer
        from dealers.models import Dealer
        from inventory.models import (
            ImportBatch,
            ImportJob,
            ShipmentSequence,
            StockMovement,
            VehicleModel,
            VehicleUnit,
            Sale,
        )
        from servicing.models import ServiceRecord

        self.super_admin = User.objects.create_superuser("superimport", "super@example.test", "pass1234")
        self.central_user = User.objects.create_user("centraladmin", "central@example.test", "pass1234")
        p_import = Permission.objects.get(codename="run_historical_import")
        self.central_user.user_permissions.add(p_import)
        UserProfile.objects.create(user=self.central_user, phone="9841000001")

        self.dealer = Dealer.objects.create(name="Pokhara VT Hub", district="Kaski")
        self.dealer_user = User.objects.create_user("dealerimport", "dealer@example.test", "pass1234")
        # Dealer role
        r_dealer = Role.objects.filter(name="Dealer Admin").first()
        p_dealer = UserProfile.objects.create(user=self.dealer_user, dealer=self.dealer, phone="9841000002")
        if r_dealer:
            p_dealer.roles.add(r_dealer)

        self.model = VehicleModel.objects.create(brand="VT", model_name="FD-EV1", is_active=True)

    def _token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        return str(RefreshToken.for_user(user).access_token)

    def test_permissions_super_and_central_allowed_dealer_blocked(self):
        # 1. Anonymous -> 401
        resp_anon = self.client.get("/api/inventory/import-jobs/")
        self.assertIn(resp_anon.status_code, [401, 403])

        # 2. Dealer user -> 403 forbidden
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.dealer_user)}")
        resp_dealer = self.client.get("/api/inventory/import-jobs/")
        self.assertEqual(resp_dealer.status_code, 403)

        # 3. Central Ops Admin -> 200 OK
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")
        resp_central = self.client.get("/api/inventory/import-jobs/")
        self.assertEqual(resp_central.status_code, 200)

        # 4. Super Admin -> 200 OK
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.super_admin)}")
        resp_admin = self.client.get("/api/inventory/import-jobs/")
        self.assertEqual(resp_admin.status_code, 200)

    def test_dry_run_nepal_geography_and_date_validation(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")
        csv_content = (
            "name,phone,email,district,province,registration_date\n"
            "Valid User,9841112233,v@test.com,Kathmandu,,2023-05-10\n"
            "Bad District,9842223344,b@test.com,Atlantis,Bagmati,2023-05-10\n"
            "BS Date,9843334455,c@test.com,Lalitpur,Bagmati,2080-02-15\n"
            "Valid Alias,9844445566,d@test.com,kavre,,15/06/2023\n"
        ).encode("utf-8")

        fp = io.BytesIO(csv_content)
        fp.name = "customers.csv"

        resp = self.client.post(
            "/api/inventory/import-jobs/dry-run/",
            {"import_type": "customers", "file": fp},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["rows_read"], 4)
        self.assertEqual(data["rows_error"], 2)  # bad district + BS date
        self.assertEqual(data["rows_create"], 2)
        self.assertFalse(data["can_commit"])

        # Check inferred province for Kathmandu and alias Kavre
        preview = data["preview_rows"]
        row1 = preview[0]
        self.assertEqual(row1["data"]["district"], "Kathmandu")
        self.assertEqual(row1["data"]["province"], "Bagmati")
        self.assertEqual(row1["status"], "CREATE")

        row4 = preview[3]
        self.assertEqual(row4["data"]["district"], "Kavrepalanchok")
        self.assertEqual(row4["data"]["province"], "Bagmati")
        self.assertEqual(row4["status"], "CREATE")

    def test_commit_customers_and_rollup_isolation(self):
        from common.services.rollup import rollup_daily_activity
        from common.models import DailyActivityRollup
        from crm.models import Customer

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")
        csv_content = (
            "name,phone,email,district,province,registration_date\n"
            "Historical Sita,9849998877,sita@example.test,Chitwan,Bagmati,2023-03-20\n"
        ).encode("utf-8")

        fp = io.BytesIO(csv_content)
        fp.name = "customers.csv"

        resp = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "customers", "file": fp},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        job_id = resp.data["id"]

        cust = Customer.objects.get(phone_normalized="9849998877")
        self.assertEqual(cust.source, "historical import")
        self.assertEqual(cust.import_job_id, job_id)
        self.assertEqual(cust.created_at.date(), datetime.date(2023, 3, 20))

        # Verify daily rollup excludes this customer
        rollup_daily_activity(start_date="2023-03-20", end_date="2023-03-20")
        self.assertFalse(
            DailyActivityRollup.objects.filter(
                action_type="CUSTOMER_CREATED", date="2023-03-20"
            ).exists()
        )

    def test_commit_shipments_advances_sequence(self):
        from inventory.models import ImportBatch, ShipmentSequence

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")
        csv_content = (
            "shipment_no,supplier_exporter,origin,status\n"
            "SHP-2023-000088,VT Factory,China,CLOSED\n"
        ).encode("utf-8")

        fp = io.BytesIO(csv_content)
        fp.name = "shipments.csv"

        resp = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "shipments", "file": fp},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

        batch = ImportBatch.objects.get(shipment_no="SHP-2023-000088")
        self.assertEqual(batch.source, "historical import")

        # Sequence should be advanced to at least 88 for 2023
        seq = ShipmentSequence.objects.get(sequence_type="SHP", year=2023)
        self.assertGreaterEqual(seq.last_seq, 88)

    def test_commit_units_sets_legacy_pdi_and_stock_movement(self):
        from inventory.models import ImportBatch, StockMovement, VehicleUnit

        batch = ImportBatch.objects.create(shipment_no="SHP-2023-TEST01")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")

        csv_content = (
            f"vin_chassis_no,model_code,color,status,shipment_no\n"
            f"VIN-HIST-UNIT-01,FD-EV1,White,IN_STOCK,{batch.shipment_no}\n"
        ).encode("utf-8")

        fp = io.BytesIO(csv_content)
        fp.name = "units.csv"

        resp = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "units", "file": fp},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

        unit = VehicleUnit.objects.get(vin_chassis_no="VIN-HIST-UNIT-01")
        self.assertEqual(unit.source, "historical import")
        self.assertEqual(unit.pdi_status, "LEGACY")

        # Verify exactly one opening stock movement
        movements = StockMovement.objects.filter(vehicle=unit)
        self.assertEqual(movements.count(), 1)
        self.assertEqual(movements.first().movement_type, StockMovement.MovementType.IMPORTED)

    def test_commit_sales_and_servicing(self):
        from crm.models import Customer
        from inventory.models import Sale, VehicleUnit
        from servicing.models import ServiceRecord

        batch, _ = ImportBatch.objects.get_or_create(
            shipment_no="SHP-2023-TEST-BATCH",
            defaults={"batch_no": "SHP-2023-TEST-BATCH", "source": "historical import"},
        )
        cust = Customer.objects.create(name="Gita Sharma", phone="9845556677")
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-SALE-01",
            vehicle_model=self.model,
            import_batch=batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")

        # 1. Sale
        sale_csv = (
            f"tax_invoice_no,vin_chassis_no,customer_phone,sale_date,selling_price\n"
            f"INV-HIST-01,VIN-SALE-01,9845556677,2023-06-15,3500000\n"
        ).encode("utf-8")
        fp_sale = io.BytesIO(sale_csv)
        fp_sale.name = "sales.csv"

        resp_sale = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "sales", "file": fp_sale},
            format="multipart",
        )
        self.assertEqual(resp_sale.status_code, 201)
        unit.refresh_from_db()
        self.assertEqual(unit.status, VehicleUnit.Status.SOLD)
        sale = Sale.objects.get(tax_invoice_no="INV-HIST-01")
        self.assertEqual(sale.source, "historical import")

        # 2. Servicing
        srv_csv = (
            f"job_card_no,vin_chassis_no,customer_phone,date_received,job_type\n"
            f"VRO-HIST-01,VIN-SALE-01,9845556677,2023-08-20,Periodic Maintenance\n"
        ).encode("utf-8")
        fp_srv = io.BytesIO(srv_csv)
        fp_srv.name = "servicing.csv"

        resp_srv = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "servicing", "file": fp_srv},
            format="multipart",
        )
        self.assertEqual(resp_srv.status_code, 201)
        srv = ServiceRecord.objects.get(vro_no="VRO-HIST-01")
        self.assertEqual(srv.source, "historical import")
        self.assertEqual(srv.vehicle_unit, unit)

    def test_rollback_by_super_admin_and_blockers(self):
        from common.models import AuditLog
        from crm.models import Customer
        from inventory.models import ImportJob

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")
        csv_content = (
            "name,phone,registration_date\n"
            "Rollback Target,9847778899,2023-01-01\n"
        ).encode("utf-8")
        fp = io.BytesIO(csv_content)
        fp.name = "customers.csv"

        resp = self.client.post(
            "/api/inventory/import-jobs/commit/",
            {"import_type": "customers", "file": fp},
            format="multipart",
        )
        job_id = resp.data["id"]

        # Central user cannot rollback -> 403
        resp_c_rb = self.client.post(f"/api/inventory/import-jobs/{job_id}/rollback/")
        self.assertEqual(resp_c_rb.status_code, 403)

        # Super Admin can rollback clean job
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.super_admin)}")
        resp_s_rb = self.client.post(f"/api/inventory/import-jobs/{job_id}/rollback/")
        self.assertEqual(resp_s_rb.status_code, 200)

        job = ImportJob.objects.get(pk=job_id)
        self.assertEqual(job.status, ImportJob.Status.ROLLED_BACK
)
        cust = Customer.objects.get(phone_normalized="9847778899")
        self.assertTrue(cust.is_deleted)

        # Audit log entries recorded
        self.assertTrue(
            AuditLog.objects.filter(object_id=str(job_id)).exists()
        )

    def test_template_download_csv_and_xlsx(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self._token(self.central_user)}")

        # CSV template
        resp_csv = self.client.get("/api/inventory/import-jobs/template/?import_type=customers&format=csv")
        self.assertEqual(resp_csv.status_code, 200)
        self.assertEqual(resp_csv["Content-Type"], "text/csv; charset=utf-8-sig")
        self.assertIn("name,phone", resp_csv.content.decode("utf-8-sig"))

        # XLSX template
        resp_xlsx = self.client.get("/api/inventory/import-jobs/template/?import_type=units&format=xlsx")
        self.assertEqual(resp_xlsx.status_code, 200)
        self.assertEqual(
            resp_xlsx["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertGreater(len(resp_xlsx.content), 1000)


class HistoricalImportGuaranteeTests(APITestCase):
    """One test per documented historical-import guarantee."""

    def setUp(self):
        self.super_admin = User.objects.create_superuser("hi-super", "hs@example.test", "pass1234")
        self.central_user = User.objects.create_user("hi-central", "hc@example.test", "pass1234")
        self.central_user.user_permissions.add(Permission.objects.get(codename="run_historical_import"))
        UserProfile.objects.create(user=self.central_user, phone="9841000101")
        self.model = VehicleModel.objects.create(
            brand="VT", model_name="FD-HIST", is_active=True, service_interval_months=6
        )
        self.batch = ImportBatch.objects.create(shipment_no="SHP-2023-HIST01")
        self.as_user(self.central_user)

    def as_user(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")

    def _upload(self, action, import_type, content, filename=None, **extra):
        fp = io.BytesIO(content if isinstance(content, bytes) else content.encode("utf-8"))
        fp.name = filename or f"{import_type}.csv"
        return self.client.post(
            f"/api/inventory/import-jobs/{action}/",
            {"import_type": import_type, "file": fp, **extra},
            format="multipart",
        )

    def _commit(self, import_type, content, **extra):
        resp = self._upload("commit", import_type, content, **extra)
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data["id"]

    def _rollback(self, job_id):
        self.as_user(self.super_admin)
        resp = self.client.post(f"/api/inventory/import-jobs/{job_id}/rollback/")
        self.as_user(self.central_user)
        return resp

    def _counts(self):
        from common.models import Notification
        from inventory.models import ImportJob, ShipmentCost
        from servicing.models import ServiceRecord

        return {
            m.__name__: m.objects.count()
            for m in (
                Customer, ImportBatch, VehicleUnit, Sale, ServiceRecord, StockMovement,
                ShipmentCost, ImportJob, AuditLog, Activity, Notification,
            )
        }

    UNITS_CSV = (
        "vin_chassis_no,model_code,color,status,shipment_no\n"
        "VIN-G-01,FD-HIST,White,IN_STOCK,SHP-2023-HIST01\n"
        "VIN-G-02,FD-HIST,Blue,SOLD,SHP-2023-HIST01\n"
        "VIN-G-03,FD-HIST,Red,IN_WAREHOUSE,SHP-2023-HIST01\n"
    )

    def test_dry_run_writes_nothing(self):
        before = self._counts()
        files = {
            "customers": "name,phone\nDry Ram,9841110001\n",
            "shipments": "shipment_no,origin\nSHP-2022-000009,China\n",
            "units": self.UNITS_CSV,
        }
        for import_type, content in files.items():
            resp = self._upload("dry-run", import_type, content)
            self.assertEqual(resp.status_code, 200, resp.data)
            self.assertGreater(resp.data["rows_create"], 0)
        self.assertEqual(self._counts(), before)

    def test_error_csv_contains_row_and_column(self):
        resp = self._upload(
            "dry-run",
            "customers",
            "name,phone,district\nGood One,9841110002,Kathmandu\nBad Phone,12345,Kathmandu\n,9841110003,Atlantis\n",
        )
        self.assertEqual(resp.status_code, 200)
        errors = resp.data["errors"]
        self.assertIn({"row": 3, "field": "phone", "message": "Invalid Nepal phone number '12345'.", "value": "12345"}, errors)
        self.assertTrue(any(e["row"] == 4 and e["field"] == "name" for e in errors))
        self.assertTrue(any(e["row"] == 4 and e["field"] == "district" for e in errors))

        csv_resp = self.client.post("/api/inventory/import-jobs/download-errors/", {"errors": errors}, format="json")
        self.assertEqual(csv_resp.status_code, 200)
        lines = csv_resp.content.decode("utf-8-sig").splitlines()
        self.assertEqual(lines[0], "Row,Column,Value,Error")
        self.assertIn("3,phone,12345,Invalid Nepal phone number '12345'.", lines)

    def test_rollback_refused_after_seven_days(self):
        from inventory.models import ImportJob

        job_id = self._commit("customers", "name,phone\nOld Job,9841110004\n")
        ImportJob.objects.filter(pk=job_id).update(created_at=timezone.now() - datetime.timedelta(days=8))
        resp = self._rollback(job_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("window expired", resp.data["detail"])
        self.assertFalse(Customer.objects.get(phone_normalized="9841110004").is_deleted)

    def test_rollback_allowed_within_seven_days_super_admin_only(self):
        from inventory.models import ImportJob

        job_id = self._commit("customers", "name,phone\nSix Days,9841110005\n")
        ImportJob.objects.filter(pk=job_id).update(created_at=timezone.now() - datetime.timedelta(days=6))
        self.assertEqual(self.client.post(f"/api/inventory/import-jobs/{job_id}/rollback/").status_code, 403)
        self.assertEqual(self._rollback(job_id).status_code, 200)
        self.assertTrue(Customer.objects.get(phone_normalized="9841110005").is_deleted)

    def test_rollback_refused_when_record_edited_after_import(self):
        job_id = self._commit("customers", "name,phone\nEdited Later,9841110006\n")
        cust = Customer.objects.get(phone_normalized="9841110006")
        cust.notes = "Called after import"
        cust.save()
        resp = self._rollback(job_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("edited after import", resp.data["detail"])

    def test_rollback_refused_when_linked_to_newer_records(self):
        from servicing.models import ServiceRecord

        job_id = self._commit("units", self.UNITS_CSV)
        unit = VehicleUnit.objects.get(vin_chassis_no="VIN-G-02")
        ServiceRecord.objects.create(vehicle_unit=unit, date_received=timezone.localdate(), job_type="Live service")
        resp = self._rollback(job_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("VIN-G-02", resp.data["detail"])

        ship_job = self._commit("shipments", "shipment_no,origin\nSHP-2022-000010,China\n")
        batch = ImportBatch.objects.get(shipment_no="SHP-2022-000010")
        VehicleUnit.objects.create(vin_chassis_no="VIN-LIVE-ON-HIST", vehicle_model=self.model, import_batch=batch)
        resp = self._rollback(ship_job)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("vehicle units attached", resp.data["detail"])

    def test_rollback_of_sales_restores_previous_unit_status(self):
        Customer.objects.create(name="Buyer", phone="9841110007")
        unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-G-RB", vehicle_model=self.model, import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        job_id = self._commit(
            "sales",
            "tax_invoice_no,vin_chassis_no,customer_phone,sale_date,selling_price\n"
            "INV-G-RB,VIN-G-RB,9841110007,2023-02-01,3200000\n",
        )
        unit.refresh_from_db()
        self.assertEqual(unit.status, VehicleUnit.Status.SOLD)
        self.assertEqual(unit.sold_date, datetime.date(2023, 2, 1))

        self.assertEqual(self._rollback(job_id).status_code, 200)
        unit.refresh_from_db()
        self.assertEqual(unit.status, VehicleUnit.Status.READY_FOR_SALE)
        sale = Sale.objects.get(tax_invoice_no="INV-G-RB")
        self.assertTrue(sale.is_deleted)
        self.assertEqual(sale.status, Sale.Status.CANCELLED)

    def test_update_existing_fills_blank_fields_only(self):
        Customer.objects.create(name="Keep Name", phone="9841110008", company="Original Co", email="")
        content = "name,phone,email,company_name,address\nNew Name,9841110008,filled@example.test,Replacement Co,Baneshwor\n"

        dry = self._upload("dry-run", "customers", content, update_existing="true")
        self.assertEqual(dry.data["rows_update"], 1)

        self._commit("customers", content, update_existing="true")
        cust = Customer.objects.get(phone_normalized="9841110008")
        self.assertEqual(cust.email, "filled@example.test")
        self.assertEqual(cust.address, "Baneshwor")
        self.assertEqual(cust.company, "Original Co")
        self.assertEqual(cust.name, "Keep Name")

        # Without the option the same row is skipped and nothing changes.
        Customer.objects.filter(pk=cust.pk).update(address="")
        self._commit("customers", content)
        cust.refresh_from_db()
        self.assertEqual(cust.address, "")

    def test_reimport_creates_zero_duplicates(self):
        from inventory.models import ImportJob, ShipmentCostType

        ShipmentCostType.objects.create(name="Freight", code="FREIGHT")
        files = [
            ("customers", "name,phone,pan_number\nRepeat Ram,9841110009,\nPan Only,,PAN-778899\n"),
            ("shipments", "shipment_no,origin\nSHP-2022-000011,China\n"),
            ("units", self.UNITS_CSV),
            ("sales",
             "tax_invoice_no,vin_chassis_no,customer_phone,sale_date,selling_price\n"
             "INV-G-RE,VIN-G-02,9841110009,2023-03-01,3300000\n"),
            ("servicing",
             "job_card_no,vin_chassis_no,customer_phone,date_received,status\n"
             "VRO-G-RE,VIN-G-02,9841110009,2023-09-01,completed\n"),
            ("shipment_costs",
             "shipment_no,cost_type,amount,currency,exchange_rate\n"
             "SHP-2022-000011,FREIGHT,4000,USD,132.5\n"),
        ]
        for import_type, content in files:
            self._commit(import_type, content)
        after_first = self._counts()

        for import_type, content in files:
            job_id = self._commit(import_type, content)
            self.assertEqual(ImportJob.objects.get(pk=job_id).rows_created, 0, import_type)

        after_second = self._counts()
        for model_name in ("Customer", "ImportBatch", "VehicleUnit", "Sale", "ServiceRecord", "StockMovement", "ShipmentCost"):
            self.assertEqual(after_second[model_name], after_first[model_name], model_name)

    def test_imported_records_excluded_from_rollups_performance_notifications_and_activity(self):
        from django.core.management import call_command
        from common.models import DailyActivityRollup, Notification
        from common.services.rollup import rollup_daily_activity

        self._commit("customers", "name,phone\nQuiet Customer,9841110010\n")
        self._commit("units", self.UNITS_CSV)
        self._commit(
            "sales",
            "tax_invoice_no,vin_chassis_no,customer_phone,sale_date,selling_price\n"
            "INV-G-Q,VIN-G-02,9841110010,2023-01-10,3300000\n",
        )
        self._commit(
            "servicing",
            "job_card_no,vin_chassis_no,customer_phone,date_received,date_completed,status\n"
            "VRO-G-Q,VIN-G-02,9841110010,2023-04-01,2023-04-01,completed\n",
        )

        today = timezone.localdate()
        rollup_daily_activity(start_date=today, end_date=today)
        rollup_daily_activity(start_date="2023-01-10", end_date="2023-04-01")
        self.assertFalse(DailyActivityRollup.objects.filter(user=self.central_user).exists())

        self.as_user(self.super_admin)
        perf = self.client.get("/api/performance/daily/")
        self.assertEqual(perf.status_code, 200)
        self.assertFalse(any(u.get("user_id", u.get("id")) == self.central_user.id for u in perf.data["users"]))

        self.assertFalse(Activity.objects.filter(customer__phone_normalized="9841110010").exists())

        # A live sold unit with the same overdue profile must still notify (control).
        live_cust = Customer.objects.create(name="Live Buyer", phone="9841110011")
        live_unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-LIVE-NOTIFY", vehicle_model=self.model, import_batch=self.batch,
            status=VehicleUnit.Status.SOLD, sold_date=datetime.date(2023, 1, 10),
        )
        Sale.objects.create(
            unit=live_unit, customer=live_cust, tax_invoice_no="INV-LIVE",
            sale_date=datetime.date(2023, 1, 10), selling_price=3300000,
        )
        call_command("generate_notifications", stdout=io.StringIO())
        imported_unit = VehicleUnit.objects.get(vin_chassis_no="VIN-G-02")
        self.assertTrue(Notification.objects.filter(object_id=str(live_unit.pk)).exists())
        self.assertFalse(Notification.objects.filter(object_id=str(imported_unit.pk)).exists())

    def test_imported_sale_bypasses_pdi_rule(self):
        from inventory.services.sales import record_sale

        Customer.objects.create(name="No PDI Buyer", phone="9841110012")
        self._commit("units", self.UNITS_CSV)
        unit = VehicleUnit.objects.get(vin_chassis_no="VIN-G-01")
        self.assertFalse(unit.pdi_inspections.exists())
        self.assertEqual(unit.pdi_status, "LEGACY")

        self._commit(
            "sales",
            "tax_invoice_no,vin_chassis_no,customer_phone,sale_date,selling_price\n"
            "INV-G-PDI,VIN-G-01,9841110012,2023-05-05,3100000\n",
        )
        self.assertTrue(Sale.objects.filter(tax_invoice_no="INV-G-PDI", unit=unit).exists())

        live_unit = VehicleUnit.objects.create(
            vin_chassis_no="VIN-LIVE-NOPDI", vehicle_model=self.model, import_batch=self.batch,
            status=VehicleUnit.Status.READY_FOR_SALE,
        )
        cust = Customer.objects.get(phone_normalized="9841110012")
        with self.assertRaises((DjangoValidationError, DRFValidationError)):
            record_sale(unit_id=live_unit.id, customer_id=cust.id, sold_price="3100000")

    def test_shp_sequence_cannot_collide_with_imported_numbers(self):
        year = timezone.localdate().year
        self._commit("shipments", f"shipment_no,origin\nSHP-{year}-000050,China\n")
        self.assertEqual(ImportBatch.objects.create().shipment_no, f"SHP-{year}-000051")

        # A number inserted without touching the sequence is still skipped.
        ImportBatch.objects.create(shipment_no=f"SHP-{year}-000052")
        self.assertEqual(ImportBatch.objects.create().shipment_no, f"SHP-{year}-000053")

    def test_one_audit_entry_per_job(self):
        from django.contrib.contenttypes.models import ContentType
        from inventory.models import ImportJob

        start = timezone.now()
        job_id = self._commit("units", self.UNITS_CSV)
        logs = AuditLog.objects.filter(timestamp__gte=start)
        self.assertEqual(logs.count(), 1, list(logs.values_list("source", "summary")))
        entry = logs.get()
        self.assertEqual(entry.source, "HISTORICAL_IMPORT")
        self.assertEqual(entry.object_id, str(job_id))
        self.assertEqual(entry.content_type, ContentType.objects.get_for_model(ImportJob))
        self.assertEqual(entry.changed_by, self.central_user)

        self.assertEqual(self._rollback(job_id).status_code, 200)
        self.assertEqual(AuditLog.objects.filter(timestamp__gte=start).count(), 2)

    def test_row_limit_and_file_size_limit(self):
        from inventory.services.historical_import import MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS

        rows = "".join(f"Bulk {i},\n" for i in range(MAX_IMPORT_ROWS + 1))
        resp = self._upload("dry-run", "customers", "name,phone\n" + rows)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("5000", resp.data["detail"])

        at_limit = self._upload("dry-run", "customers", "name,email\n" + "".join(
            f"Bulk {i},b{i}@example.test\n" for i in range(MAX_IMPORT_ROWS)
        ))
        self.assertEqual(at_limit.status_code, 200)
        self.assertEqual(at_limit.data["rows_read"], MAX_IMPORT_ROWS)

        oversized = b"name,phone\n" + b"x" * (MAX_IMPORT_FILE_BYTES + 1)
        for action in ("dry-run", "commit"):
            resp = self._upload(action, "customers", oversized)
            self.assertEqual(resp.status_code, 400)
            self.assertIn("MB upload limit", resp.data["detail"])

    def test_utf8_bom_csv_and_xlsx_both_parse(self):
        import openpyxl

        bom_csv = "\ufeffname,phone,district\nBOM Bahadur,9841110013,Lalitpur\n".encode("utf-8")
        resp = self._upload("dry-run", "customers", bom_csv)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["rows_create"], 1)
        self.assertEqual(resp.data["preview_rows"][0]["data"]["name"], "BOM Bahadur")

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["name", "phone", "registration_date"])
        ws.append(["Excel Kumari", "9841110014", datetime.date(2023, 7, 1)])
        buf = io.BytesIO()
        wb.save(buf)
        resp = self._upload("dry-run", "customers", buf.getvalue(), filename="customers.xlsx")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["rows_create"], 1)
        row = resp.data["preview_rows"][0]["data"]
        self.assertEqual(row["name"], "Excel Kumari")
        self.assertEqual(row["registration_date"], "2023-07-01")

    def test_shipment_costs_dry_run_commit_and_rollback(self):
        from decimal import Decimal
        from inventory.models import ShipmentCost, ShipmentCostType

        ShipmentCostType.objects.create(name="Freight", code="FREIGHT")
        ShipmentCostType.objects.create(name="Customs Duty", code="CUSTOMS_DUTY")
        content = (
            "shipment_no,cost_type,amount,currency,exchange_rate\n"
            "SHP-2023-HIST01,FREIGHT,4000,USD,132.5\n"
            "SHP-2023-HIST01,Customs Duty,1850000,NPR,\n"
            "SHP-2023-HIST01,FREIGHT,500,USD,\n"
            "SHP-2023-HIST01,MYSTERY,10,NPR,1\n"
            "SHP-NOPE,FREIGHT,10,NPR,1\n"
        )
        dry = self._upload("dry-run", "shipment_costs", content)
        self.assertEqual(dry.status_code, 200)
        self.assertEqual(dry.data["rows_create"], 2)
        self.assertEqual(dry.data["rows_error"], 3)
        fields = {(e["row"], e["field"]) for e in dry.data["errors"]}
        self.assertEqual(fields, {(4, "exchange_rate"), (5, "cost_type"), (6, "shipment_no")})
        self.assertEqual(ShipmentCost.objects.count(), 0)

        self.assertEqual(self._upload("commit", "shipment_costs", content).status_code, 400)
        job_id = self._commit("shipment_costs", content, skip_invalid="true")
        freight = ShipmentCost.objects.get(cost_type__code="FREIGHT")
        self.assertEqual(freight.amount_npr, Decimal("530000.00"))
        self.assertEqual(freight.source, "historical import")
        duty = ShipmentCost.objects.get(cost_type__code="CUSTOMS_DUTY")
        self.assertEqual(duty.exchange_rate, Decimal("1"))

        template = self.client.get("/api/inventory/import-jobs/template/?import_type=shipment_costs&format=csv")
        self.assertEqual(template.status_code, 200)
        self.assertTrue(template.content.decode("utf-8-sig").startswith("shipment_no,cost_type,amount,currency,exchange_rate"))

        self.assertEqual(self._rollback(job_id).status_code, 200)
        self.assertEqual(ShipmentCost.objects.count(), 0)

    def test_shipment_rollback_blocked_by_imported_cost_lines(self):
        from inventory.models import ShipmentCostType

        ShipmentCostType.objects.create(name="Freight", code="FREIGHT")
        ship_job = self._commit("shipments", "shipment_no,origin\nSHP-2022-000012,China\n")
        self._commit("shipment_costs", "shipment_no,cost_type,amount\nSHP-2022-000012,FREIGHT,1000\n")
        resp = self._rollback(ship_job)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("cost lines attached", resp.data["detail"])






