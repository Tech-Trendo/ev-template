"""VEI uses the same checklist fields as PDI.

Open VEI inspections are re-pointed to the active PDI template with fresh results.
Orphan VEI-only templates keep their rows but new VEIs always use the PDI template.
"""

from django.db import migrations


def sync_vei_to_pdi_checklist(apps, schema_editor):
    PDITemplate = apps.get_model("inventory", "PDITemplate")
    PDIInspection = apps.get_model("inventory", "PDIInspection")
    PDIResult = apps.get_model("inventory", "PDIResult")

    pdi = (
        PDITemplate.objects.filter(
            inspection_type="PDI",
            is_active=True,
            vehicle_model__isnull=True,
            variant__isnull=True,
        )
        .order_by("-version_no", "-id")
        .first()
    )
    if not pdi:
        pdi = (
            PDITemplate.objects.filter(inspection_type="PDI", is_active=True)
            .order_by("-version_no", "-id")
            .first()
        )
    if not pdi:
        return

    source_items = list(pdi.items.order_by("sort_order", "id"))

    open_veis = PDIInspection.objects.filter(
        inspection_type="VEI",
        status__in=["DRAFT", "SUBMITTED"],
    )
    for insp in open_veis:
        insp.results.all().delete()
        insp.template = pdi
        insp.save(update_fields=["template"])
        PDIResult.objects.bulk_create(
            [
                PDIResult(
                    inspection=insp,
                    item=item,
                    label_snapshot=item.label,
                    section_snapshot=item.section,
                    sub_section_snapshot=item.sub_section or "",
                )
                for item in source_items
            ]
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0024_variant_product_code"),
    ]

    operations = [
        migrations.RunPython(sync_vei_to_pdi_checklist, noop_reverse),
    ]
