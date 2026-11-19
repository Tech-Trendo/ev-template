"""Import shipments, stock units, stock movements and vehicle sales."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Q

from inventory.models import (
    ImportBatch,
    ShipmentCost,
    ShipmentCostType,
    StockMovement,
    VehicleUnit,
    Sale,
)

from .helpers import CENTRAL_DEALER, WEST_DEALER, NORTH_DEALER, day, dec, log, stamp

BATCHES = (
    {
        "key": "a",
        "shipment_no": "SHP-2026-000001",
        "batch_no": "BATCH-2026-001",
        "supplier_exporter": "VT Mobility Manufacturing Co., Ltd.",
        "container_bl_no": "BL-VT-2026-001",
        "vessel_transport_mode": "Sea + road",
        "port_of_loading": "Shanghai",
        "port_of_arrival": "Kolkata",
        "origin": "China",
        "border_crossing": "Kerung",
        "customs_declaration_no": "CD-2026-0001",
        "container_or_truck_no": "VT-CONT-001",
        "carrier_name": "Trans-Himalaya Logistics",
        "destination_warehouse": "Central Fleet Yard",
        "lc_number": "LC-2026-001",
        "invoice_no": "INV-VT-2026-001",
        "status": "CLOSED",
        "transport_status": "ARRIVED",
        "etd": day(-250),
        "eta": day(-215),
        "actual_arrival_date": day(-210),
        "customs_clearance_date": day(-200),
        "warehouse_received_date": day(-195),
        "shipped_date": day(-250),
        "eta_date": day(-215),
        "arrived_date": day(-210),
        "notes": "First 2026 shipment — six units received and processed.",
    },
    {
        "key": "b",
        "shipment_no": "SHP-2026-000002",
        "batch_no": "BATCH-2026-002",
        "supplier_exporter": "VT Mobility Manufacturing Co., Ltd.",
        "container_bl_no": "BL-VT-2026-002",
        "vessel_transport_mode": "Sea + road",
        "port_of_loading": "Qingdao",
        "port_of_arrival": "Kolkata",
        "origin": "China",
        "border_crossing": "Tatopani",
        "customs_declaration_no": "CD-2026-0002",
        "container_or_truck_no": "VT-CONT-002",
        "carrier_name": "Himalayan Freight Lines",
        "destination_warehouse": "West Distribution Yard",
        "lc_number": "LC-2026-002",
        "invoice_no": "INV-VT-2026-002",
        "status": "RECEIVED",
        "transport_status": "ARRIVED",
        "etd": day(-70),
        "eta": day(-30),
        "actual_arrival_date": day(-25),
        "customs_clearance_date": day(-18),
        "warehouse_received_date": day(-15),
        "shipped_date": day(-70),
        "eta_date": day(-30),
        "arrived_date": day(-25),
        "notes": "Nine units received; PDI and ready-for-sale processing in progress.",
    },
    {
        "key": "c",
        "shipment_no": "SHP-2026-000003",
        "batch_no": "BATCH-2026-003",
        "supplier_exporter": "VT Mobility Manufacturing Co., Ltd.",
        "container_bl_no": "BL-VT-2026-003",
        "vessel_transport_mode": "Sea + road",
        "port_of_loading": "Shenzhen",
        "port_of_arrival": "Kolkata",
        "origin": "China",
        "border_crossing": "Kerung",
        "customs_declaration_no": "CD-2026-0003",
        "container_or_truck_no": "VT-CONT-003",
        "carrier_name": "Trans-Himalaya Logistics",
        "destination_warehouse": "Central Fleet Yard",
        "lc_number": "LC-2026-003",
        "invoice_no": "INV-VT-2026-003",
        "status": "IN_TRANSIT",
        "transport_status": "IN_TRANSIT",
        "etd": day(-18),
        "eta": day(12),
        "shipped_date": day(-18),
        "eta_date": day(12),
        "notes": "Two cargo units and one van on the way to the border.",
    },
    {
        "key": "d",
        "shipment_no": "SHP-2026-000004",
        "batch_no": "BATCH-2026-004",
        "supplier_exporter": "VT Mobility Manufacturing Co., Ltd.",
        "container_bl_no": "BL-VT-2026-004",
        "vessel_transport_mode": "Sea + road",
        "port_of_loading": "Shanghai",
        "port_of_arrival": "Kolkata",
        "origin": "China",
        "border_crossing": "Tatopani",
        "customs_declaration_no": "CD-2026-0004",
        "container_or_truck_no": "VT-CONT-004",
        "carrier_name": "Nepal Cargo Movers",
        "destination_warehouse": "North Service Yard",
        "lc_number": "LC-2026-004",
        "invoice_no": "INV-VT-2026-004",
        "status": "AT_PORT",
        "transport_status": "BORDER_CUSTOMS",
        "etd": day(-40),
        "eta": day(-2),
        "shipped_date": day(-40),
        "eta_date": day(-2),
        "notes": "One CityVan awaiting customs release at the border.",
    },
)

COST_TYPES = (
    ("Ocean Freight", "FREIGHT", "International sea freight to Kolkata."),
    ("Cargo Insurance", "INSURANCE", "Transit insurance for the shipment."),
    ("Customs Duty", "CUSTOMS", "Nepal customs duty and clearance charges."),
    ("Port Handling", "PORT", "Port, terminal and documentation charges."),
    ("Inland Transport", "INLAND", "Road transport from border to warehouse."),
)

UNIT_SPECS = (
    ("cargo_sold_overdue", "Cargo 10T", "SOLD", "sunrise", 250, 6850, "Closed Container"),
    ("hauler_sold", "Hauler 6T", "SOLD", "beverage", 100, 3200, "Refrigerated Container"),
    ("cityvan_sold", "CityVan 3T", "SOLD", "citymart", 38, 950, "Closed Container"),
    ("cargo_sold_new", "Cargo 10T", "SOLD", "everest", 14, 280, "Hi-Deck Container"),
    ("hauler_sold_new", "Hauler 6T", "SOLD", "mero", 7, 120, "Flat Body"),
    ("cargo_ready", "Cargo 10T", "READY_FOR_SALE", None, 0, 18, "Closed Container"),
    ("hauler_ready", "Hauler 6T", "READY_FOR_SALE", None, 0, 14, "Flat Body"),
    ("cityvan_reserved", "CityVan 3T", "RESERVED", None, 0, 22, "Closed Container"),
    ("cargo_pdi", "Cargo 10T", "PDI_PASSED", None, 0, 12, "Hi-Deck Container"),
    ("hauler_pending", "Hauler 6T", "PDI_PENDING", None, 0, 8, "Flat Body"),
    ("cityvan_failed", "CityVan 3T", "PDI_FAILED", None, 0, 26, "Closed Container"),
    ("cargo_returned", "Cargo 10T", "RETURNED", None, 0, 410, "Closed Container"),
    ("hauler_warehouse", "Hauler 6T", "IN_WAREHOUSE", None, 0, 6, "Refrigerated Container"),
    ("cityvan_warehouse", "CityVan 3T", "IN_WAREHOUSE", None, 0, 9, "Closed Container"),
    ("cargo_transit", "Cargo 10T", "IN_TRANSIT", None, 0, 2, "Closed Container"),
    ("hauler_transit", "Hauler 6T", "IN_TRANSIT", None, 0, 2, "Flat Body"),
    ("cityvan_port", "CityVan 3T", "IN_TRANSIT", None, 0, 1, "Closed Container"),
    ("cityvan_pdi_pass", "CityVan 3T", "PDI_PASSED", None, 0, 5, "Closed Container"),
)

PRICE = {
    "Cargo 10T": (dec("4100000"), dec("4650000"), dec("5850000")),
    "Hauler 6T": (dec("3250000"), dec("3650000"), dec("4450000")),
    "CityVan 3T": (dec("1850000"), dec("2100000"), dec("2750000")),
}
COLORS = {
    "Cargo 10T": ("Pearl White", "Graphite Grey", "Ocean Blue"),
    "Hauler 6T": ("Pearl White", "Silver", "Forest Green"),
    "CityVan 3T": ("Pearl White", "Sky Blue", "Sunset Orange"),
}


def _monthly_emi(principal: Decimal, annual_rate: Decimal, years: int) -> Decimal:
    if principal <= 0:
        return Decimal("0")
    rate = annual_rate / Decimal("1200")
    months = years * 12
    if rate == 0:
        return (principal / months).quantize(Decimal("0.01"))
    factor = (Decimal("1") + rate) ** months
    return (principal * rate * factor / (factor - 1)).quantize(Decimal("0.01"))


def _batch_for_slot(index: int) -> str:
    if index < 6:
        return "a"
    if index < 14 or index == 17:
        return "b"
    if index in (14, 15):
        return "c"
    return "d"


def seed_stock(catalog: dict, crm: dict, users: dict, dealers: dict) -> dict[str, object]:
    log("Import shipments and stock")
    batches = {}
    for spec in BATCHES:
        data = {key: value for key, value in spec.items() if key != "key"}
        batch, _ = ImportBatch.objects.update_or_create(
            shipment_no=spec["shipment_no"],
            defaults={**data, "source": "seed", "total_units": 0},
        )
        batches[spec["key"]] = batch

    cost_types = {}
    for index, (name, code, description) in enumerate(COST_TYPES):
        cost_type, _ = ShipmentCostType.objects.update_or_create(
            code=code,
            defaults={"name": name, "description": description, "is_active": True},
        )
        cost_types[code] = cost_type

    for batch_spec in BATCHES:
        batch = batches[batch_spec["key"]]
        ShipmentCost.objects.filter(shipment=batch).delete()
        costs = (
            ("FREIGHT", "330000", "NPR"),
            ("INSURANCE", "85000", "NPR"),
            ("CUSTOMS", "1850000", "NPR"),
            ("PORT", "145000", "NPR"),
            ("INLAND", "220000", "NPR"),
        )
        for code, amount, currency in costs:
            ShipmentCost.objects.create(
                shipment=batch,
                cost_type=cost_types[code],
                description=f"{cost_types[code].name} for {batch.shipment_no}",
                amount=dec(amount),
                currency=currency,
                exchange_rate=dec("1.0"),
                amount_npr=dec(amount),
                source="seed",
            )

    models = catalog["models"]
    existing = list(
        VehicleUnit.objects.filter(
            Q(vin_chassis_no__startswith="APX")
            | Q(vin_chassis_no__regex=r"^VT20260000\d\d$")
            | Q(vin_chassis_no__startswith="VTVIN2026")
        ).order_by("id")
    )
    users_by_name = users
    customers = crm["customers"]
    units: dict[str, VehicleUnit] = {}

    for index, (key, model_name, status, customer_key, sold_days, odometer, variant_name) in enumerate(
        UNIT_SPECS, start=1
    ):
        model = models[model_name]
        variant = model.variants.filter(name=variant_name).first()
        vin = f"VTVIN2026000{index:03d}"
        unit = next((row for row in existing if row.vin_chassis_no == vin), None)
        if unit is None and index - 1 < len(existing):
            unit = existing[index - 1]
        if unit is None:
            unit = VehicleUnit(vin_chassis_no=vin)

        batch = batches[_batch_for_slot(index - 1)]
        dealer = dealers[
            (CENTRAL_DEALER, WEST_DEALER, NORTH_DEALER)[(index - 1) % 3]
        ]
        purchase, landed, selling = PRICE[model_name]
        sale_date = day(-sold_days) if status == "SOLD" else None
        customer = customers.get(customer_key) if customer_key else None
        payment_mode = "CASH"
        finance_status = "SELF_FINANCED"
        bank_name = ""
        down_payment = selling
        loan_amount = Decimal("0")
        tenure = None
        interest = Decimal("0")
        emi = Decimal("0")
        if customer and index % 3 == 0:
            payment_mode = "BANK_FINANCE"
            finance_status = "DISBURSED"
            bank_name = "Nabil Bank"
            down_payment = (selling * Decimal("0.40")).quantize(Decimal("0.01"))
            loan_amount = selling - down_payment
            tenure = 5
            interest = dec("9.5")
            emi = _monthly_emi(loan_amount, interest, tenure)
        elif customer and index % 3 == 1:
            payment_mode = "PARTIAL_FINANCE"
            finance_status = "APPROVED"
            bank_name = "Global IME Bank"
            down_payment = (selling * Decimal("0.55")).quantize(Decimal("0.01"))
            loan_amount = selling - down_payment
            tenure = 4
            interest = dec("10.25")
            emi = _monthly_emi(loan_amount, interest, tenure)
        elif customer:
            finance_status = "SELF_FINANCED"

        unit.vin_chassis_no = vin
        unit.import_batch = batch
        unit.vehicle_model = model
        unit.variant = variant
        unit.motor_no = f"MTR-VT-{index:04d}"
        unit.battery_no = f"BAT-VT-{index:04d}"
        unit.battery_power_kw = dec(model.battery_power_kw or 0)
        unit.motor_power_kw = dec(model.motor_power_kw or 0)
        unit.color = COLORS[model_name][(index - 1) % 3]
        unit.manufacture_date = day(-max(sold_days, 25) - 30)
        unit.odometer_km = odometer
        unit.status = status
        unit.purchase_cost = purchase
        unit.landed_cost = landed
        unit.selling_price = selling
        unit.sold_price = selling - Decimal("50000") if status == "SOLD" else None
        unit.customer = customer if status == "SOLD" else None
        unit.current_customer = customer if status == "SOLD" else None
        unit.customer_name = customer.name if customer else ""
        unit.dealer = dealer
        unit.sold_date = sale_date
        unit.warranty_end_date = sale_date + timedelta(days=365 * 3) if sale_date else None
        unit.payment_mode = payment_mode if status == "SOLD" else "CASH"
        unit.finance_bank_name = bank_name if status == "SOLD" else ""
        unit.down_payment = down_payment if status == "SOLD" else None
        unit.loan_amount = loan_amount if status == "SOLD" else None
        unit.loan_tenure_months = tenure if status == "SOLD" else None
        unit.interest_rate = interest if status == "SOLD" else None
        unit.monthly_emi = emi if status == "SOLD" else None
        unit.finance_status = finance_status if status == "SOLD" else "NOT_APPLICABLE"
        unit.tax_invoice_no = f"VT-TI-2026-{index:04d}" if status == "SOLD" else ""
        unit.receipt_voucher_no = f"VT-RV-2026-{index:04d}" if status == "SOLD" else ""
        unit.salesperson_name = "Rohan Gurung" if status == "SOLD" else ""
        unit.reservation_expires_at = stamp(7, 17) if status == "RESERVED" else None
        unit.source = "import"
        unit.delivery_notes = (
            f"Demo {model_name} unit. Status planned by the Vehicle Template seeder."
        )
        unit.save()
        units[key] = unit

        salesperson = users_by_name.get("sales.exec")
        if status == "SOLD" and customer:
            sale, _ = Sale.objects.update_or_create(
                unit=unit,
                defaults={
                    "customer": customer,
                    "lead": customer.lead,
                    "variant": variant,
                    "sale_date": sale_date,
                    "selling_price": unit.sold_price,
                    "discount": Decimal("50000"),
                    "payment_mode": payment_mode,
                    "bank": bank_name,
                    "down_payment": down_payment,
                    "loan_amount": loan_amount,
                    "tenure": tenure,
                    "interest": interest,
                    "emi": emi,
                    "tax_invoice_no": unit.tax_invoice_no,
                    "receipt_no": unit.receipt_voucher_no,
                    "dealer": dealer,
                    "salesperson": salesperson,
                    "created_by": users_by_name.get("sales.manager"),
                    "finance_status": finance_status,
                    "warranty_end_date": unit.warranty_end_date,
                    "status": "ACTIVE",
                    "salesperson_name": "Rohan Gurung",
                    "notes": "Demo sale created by the template seeder.",
                    "source": "seed",
                    "is_current": True,
                },
            )
            unit.quotation = None
            unit.save(update_fields=["quotation"])

        StockMovement.objects.filter(vehicle=unit).delete()
        movement_path = ["IMPORTED"]
        if status not in ("IN_TRANSIT",):
            movement_path.append("ARRIVED")
        if status in ("PDI_PASSED", "READY_FOR_SALE", "RESERVED", "SOLD", "RETURNED"):
            movement_path.append("PDI_PASSED")
        if status in ("READY_FOR_SALE", "RESERVED", "SOLD"):
            movement_path.append("MOVED_TO_READY")
        if status == "RESERVED":
            movement_path.append("RESERVED")
        if status == "SOLD":
            movement_path.extend(["RESERVED", "SOLD"])
        if status == "PDI_PENDING":
            movement_path.append("PDI_STARTED")
        if status == "PDI_FAILED":
            movement_path.extend(["PDI_STARTED", "PDI_FAILED"])
        if status == "RETURNED":
            movement_path.extend(["SOLD", "RETURNED"])
        if status == "IN_WAREHOUSE":
            movement_path.append("ARRIVED")
        seen = set()
        for movement_type in movement_path:
            if movement_type in seen:
                continue
            seen.add(movement_type)
            StockMovement.objects.create(
                vehicle=unit,
                movement_type=movement_type,
                quantity=1,
                reference_note=f"Demo {movement_type.lower().replace('_', ' ')} movement.",
                created_by=users_by_name.get("employee"),
            )

    for batch in batches.values():
        batch.total_units = VehicleUnit.objects.filter(import_batch=batch).count()
        batch.save(update_fields=["total_units"])

    # Recalculate customer lifetime purchase totals from active sales.
    from django.db.models import Sum

    for customer in customers.values():
        total = (
            Sale.objects.filter(customer=customer, status="ACTIVE", is_deleted=False).aggregate(
                total=Sum("selling_price")
            )["total"]
            or Decimal("0")
        )
        customer.total_purchases = total
        customer.save(update_fields=["total_purchases"])

    log(f"  units: {len(units)}, sales: {Sale.objects.count()}")
    return {"batches": batches, "units": units, "cost_types": cost_types}
