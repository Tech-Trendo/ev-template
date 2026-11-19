import sys
from django.db import migrations


def backfill_quotation_vehicle_model(apps, schema_editor):
    Quotation = apps.get_model("crm", "Quotation")
    VehicleModel = apps.get_model("inventory", "VehicleModel")

    all_models = list(VehicleModel.objects.all())
    unmatched = []

    for q in Quotation.objects.filter(vehicle_model__isnull=True):
        raw = (q.vehicle or "").strip()
        if not raw:
            unmatched.append((q.id, "Empty vehicle field"))
            continue

        raw_lower = raw.lower()
        matched = None

        # 1. Exact brand + model name
        for m in all_models:
            full = f"{m.brand} {m.model_name}".strip().lower()
            if full == raw_lower or m.model_name.lower() == raw_lower:
                matched = m
                break

        # 2. Substring match
        if not matched:
            for m in all_models:
                if m.model_name.lower() in raw_lower or raw_lower in m.model_name.lower():
                    matched = m
                    break

        if matched:
            q.vehicle_model = matched
            q.save(update_fields=["vehicle_model"])
        else:
            unmatched.append((q.id, raw))

    if unmatched:
        sys.stdout.write(f"\n[MIGRATION NOTICE] Could not match {len(unmatched)} quotations to a VehicleModel:\n")
        for q_id, val in unmatched:
            sys.stdout.write(f"  Quotation #{q_id}: {val!r}\n")
    else:
        sys.stdout.write("\n[MIGRATION] All quotations matched to VehicleModel.\n")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0012_quotation_vehicle_model_and_unit_fk"),
    ]

    operations = [
        migrations.RunPython(backfill_quotation_vehicle_model, reverse_code=noop),
    ]
