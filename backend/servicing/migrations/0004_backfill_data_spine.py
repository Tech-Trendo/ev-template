from datetime import date, timedelta
from django.db import migrations
from common.phone import normalize_nepal_phone


def backfill_data_spine(apps, schema_editor):
    Customer = apps.get_model("crm", "Customer")
    VehicleUnit = apps.get_model("inventory", "VehicleUnit")
    Sale = apps.get_model("inventory", "Sale")
    ServiceRecord = apps.get_model("servicing", "ServiceRecord")

    # 1. Backfill Customer.phone_normalized
    customers_normalized = 0
    for cust in Customer.objects.all():
        normalized = normalize_nepal_phone(cust.phone)
        if cust.phone_normalized != normalized:
            cust.phone_normalized = normalized
            cust.save(update_fields=["phone_normalized"])
            customers_normalized += 1

    # 2. Backfill Sale and Unit.current_customer from sold VehicleUnits
    sales_created = 0
    sold_units = VehicleUnit.objects.filter(
        status="SOLD"
    ) | VehicleUnit.objects.exclude(sold_date__isnull=True) | VehicleUnit.objects.exclude(customer__isnull=True)

    for unit in sold_units.distinct():
        unit_updated = False
        target_cust = unit.current_customer or unit.customer
        if not unit.current_customer and target_cust:
            unit.current_customer = target_cust
            unit_updated = True

        if not unit.warranty_end_date and unit.sold_date:
            try:
                unit.warranty_end_date = unit.sold_date.replace(year=unit.sold_date.year + 3)
            except ValueError:
                unit.warranty_end_date = unit.sold_date + timedelta(days=365 * 3)
            unit_updated = True

        if unit_updated:
            unit.save(update_fields=["current_customer", "warranty_end_date"])

        # Create Sale record if none exists for this unit
        if target_cust and not Sale.objects.filter(unit=unit, customer=target_cust).exists():
            Sale.objects.create(
                unit=unit,
                customer=target_cust,
                quotation=unit.quotation,
                lead=unit.lead,
                sale_date=unit.sold_date or date.today(),
                selling_price=unit.sold_price or unit.selling_price or 0,
                payment_mode=unit.payment_mode or "CASH",
                bank=unit.finance_bank_name or "",
                down_payment=unit.down_payment,
                loan_amount=unit.loan_amount,
                tenure=unit.loan_tenure_months,
                interest=unit.interest_rate,
                emi=unit.monthly_emi,
                tax_invoice_no=unit.tax_invoice_no or "",
                receipt_no=unit.receipt_voucher_no or "",
                notes=unit.delivery_notes or "",
                is_current=True,
            )
            sales_created += 1

    # 3. Backfill ServiceRecord.vehicle_unit and ServiceRecord.customer
    matched_units = 0
    unmatched_units = 0
    matched_customers = 0
    unmatched_customers = 0

    for sr in ServiceRecord.objects.all():
        changed_fields = []

        if not sr.vehicle_unit_id and sr.chassis_number:
            unit = VehicleUnit.objects.filter(vin_chassis_no__iexact=sr.chassis_number.strip()).first()
            if unit:
                sr.vehicle_unit = unit
                changed_fields.append("vehicle_unit")
                matched_units += 1
                if not sr.v_reg_no and unit.registration_no:
                    sr.v_reg_no = unit.registration_no
                    changed_fields.append("v_reg_no")
            else:
                unmatched_units += 1

        if not sr.customer_id:
            cust = None
            if sr.customer_mobile:
                norm_mobile = normalize_nepal_phone(sr.customer_mobile)
                if norm_mobile:
                    cust = Customer.objects.filter(phone_normalized=norm_mobile).first()
            if not cust and sr.vehicle_unit and sr.vehicle_unit.current_customer:
                cust = sr.vehicle_unit.current_customer

            if cust:
                sr.customer = cust
                changed_fields.append("customer")
                matched_customers += 1
            else:
                unmatched_customers += 1

        if changed_fields:
            sr.save(update_fields=changed_fields)

    print("\n==========================================")
    print("      DATA SPINE BACKFILL REPORT          ")
    print("==========================================")
    print(f"Customers normalized: {customers_normalized}")
    print(f"Sales created from sold units: {sales_created}")
    print(f"ServiceRecord unit matched: {matched_units}")
    print(f"ServiceRecord unit unmatched: {unmatched_units}")
    print(f"ServiceRecord customer matched: {matched_customers}")
    print(f"ServiceRecord customer unmatched: {unmatched_customers}")
    print("==========================================\n")


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0011_customer_contact_person_customer_pan_vat_number_and_more"),
        ("inventory", "0005_vehicleunit_current_customer_and_more"),
        ("servicing", "0003_servicerecord_is_external"),
    ]

    operations = [
        migrations.RunPython(backfill_data_spine, reverse_noop),
    ]
