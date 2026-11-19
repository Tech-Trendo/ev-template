from django.core.management.base import BaseCommand
from django.db.models import Count

from crm.models import Customer
from inventory.models import Sale, VehicleUnit


class Command(BaseCommand):
    help = "Checks database integrity across VehicleUnit, Sale, and Customer."

    def handle(self, *args, **options):
        self.stdout.write("==========================================")
        self.stdout.write("       DATA INTEGRITY AUDIT REPORT        ")
        self.stdout.write("==========================================")

        issues_found = 0

        # 1. Units with status SOLD but no current Sale
        sold_units_without_sale = []
        for unit in VehicleUnit.objects.filter(status=VehicleUnit.Status.SOLD):
            if not Sale.objects.filter(unit=unit, is_current=True).exists():
                sold_units_without_sale.append(unit)

        self.stdout.write(
            f"1. Sold units without current Sale: {len(sold_units_without_sale)}"
        )
        for u in sold_units_without_sale:
            issues_found += 1
            self.stdout.write(
                f"   - Unit ID {u.id} | VIN: {u.vin_chassis_no} | Status: {u.status}"
            )

        # 2. Sales whose unit is not SOLD
        sales_with_unsold_unit = []
        for sale in Sale.objects.filter(is_current=True).select_related("unit"):
            if sale.unit.status != VehicleUnit.Status.SOLD:
                sales_with_unsold_unit.append(sale)

        self.stdout.write(
            f"2. Current Sales whose unit is not SOLD: {len(sales_with_unsold_unit)}"
        )
        for s in sales_with_unsold_unit:
            issues_found += 1
            self.stdout.write(
                f"   - Sale ID {s.id} | Unit ID: {s.unit_id} (VIN: {s.unit.vin_chassis_no}) | Unit Status: {s.unit.status}"
            )

        # 3. Units RESERVED with no linked lead / customer / quotation
        reserved_orphan_units = []
        for unit in VehicleUnit.objects.filter(status=VehicleUnit.Status.RESERVED):
            has_lead = bool(unit.lead_id)
            has_cust = bool(unit.customer_id or unit.current_customer_id or unit.customer_name)
            has_quote = hasattr(unit, "quotations") and unit.quotations.exists()
            has_reserved_quote = hasattr(unit, "reserved_for_quotation") and unit.reserved_for_quotation.exists()

            if not (has_lead or has_cust or has_quote or has_reserved_quote):
                reserved_orphan_units.append(unit)

        self.stdout.write(
            f"3. Reserved units without lead/customer/quotation: {len(reserved_orphan_units)}"
        )
        for u in reserved_orphan_units:
            issues_found += 1
            self.stdout.write(
                f"   - Unit ID {u.id} | VIN: {u.vin_chassis_no} | Status: {u.status}"
            )

        # 4. Customers with duplicate normalized phones
        duplicate_phone_groups = (
            Customer.objects.exclude(phone_normalized="")
            .exclude(phone_normalized__isnull=True)
            .values("phone_normalized")
            .annotate(cnt=Count("id"))
            .filter(cnt__gt=1)
        )

        total_dupe_phones = duplicate_phone_groups.count()
        self.stdout.write(
            f"4. Normalized phone numbers shared by multiple customers: {total_dupe_phones}"
        )
        for group in duplicate_phone_groups:
            issues_found += 1
            phone = group["phone_normalized"]
            custs = Customer.objects.filter(phone_normalized=phone).values_list(
                "id", "name"
            )
            cust_list_str = ", ".join(f"{c_id} ({c_name})" for c_id, c_name in custs)
            self.stdout.write(
                f"   - Phone {phone} ({group['cnt']} customers): {cust_list_str}"
            )

        self.stdout.write("==========================================")
        if issues_found == 0:
            self.stdout.write(self.style.SUCCESS("All integrity checks passed. 0 issues found."))
        else:
            self.stdout.write(
                self.style.WARNING(f"Audit completed: {issues_found} integrity issue(s) detected.")
            )
        self.stdout.write("==========================================")
