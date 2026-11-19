from django.db import migrations


def backfill_vehicleunit_and_sale(apps, schema_editor):
    VehicleUnit = apps.get_model("inventory", "VehicleUnit")
    Sale = apps.get_model("inventory", "Sale")
    Dealer = apps.get_model("dealers", "Dealer")

    dealers_by_name = {d.name.strip().lower(): d for d in Dealer.objects.all()}
    print(f"\n[BACKFILL] Starting VehicleUnit dealer matching against {len(dealers_by_name)} dealers...")

    matched_units = 0
    unmatched_units = 0

    for unit in VehicleUnit.objects.all():
        loc = getattr(unit, "location_name", "") or ""
        if not loc and unit.import_batch_id:
            loc = getattr(unit.import_batch, "destination_warehouse", "") or ""

        loc_clean = loc.strip().lower()
        if loc_clean and loc_clean in dealers_by_name:
            unit.dealer = dealers_by_name[loc_clean]
            unit.save(update_fields=["dealer"])
            matched_units += 1
        else:
            print(f"[BACKFILL] Unit VIN-{unit.vin_chassis_no} location '{loc}' did not match any dealer. Leaving dealer as NULL.")
            unmatched_units += 1

    print(f"[BACKFILL] VehicleUnits processed: {matched_units} matched, {unmatched_units} unmatched.")

    # Backfill Sale.created_by from salesperson
    sales_backfilled = 0
    for sale in Sale.objects.filter(created_by__isnull=True):
        if sale.salesperson:
            sale.created_by = sale.salesperson
            sale.save(update_fields=["created_by"])
            sales_backfilled += 1
    print(f"[BACKFILL] Sales created_by backfilled: {sales_backfilled}.")


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0014_sale_created_by_vehicleunit_dealer"),
        ("dealers", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_vehicleunit_and_sale, migrations.RunPython.noop),
    ]
