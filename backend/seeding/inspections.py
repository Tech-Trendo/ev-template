"""PDI/VEI inspections, condition reports, receive checklists and import jobs."""

from __future__ import annotations

from django.core.files.base import ContentFile

from inventory.models import (
    ConditionPhoto,
    ConditionReport,
    ConditionResult,
    ImportJob,
    InspectionIssue,
    InspectionPhoto,
    PDIChecklistItem,
    PDIInspection,
    PDIResult,
    PDITemplate,
    VehicleReceiveCheckList,
)

from .helpers import COMPANY, day, log, stamp, tiny_png


def _template(kind: str) -> PDITemplate:
    template = (
        PDITemplate.objects.filter(inspection_type=kind, is_active=True)
        .order_by("-version_no", "-id")
        .first()
    )
    if template:
        return template
    fallback = PDITemplate.objects.filter(is_active=True).order_by("-version_no").first()
    template = PDITemplate.objects.create(
        inspection_type=kind,
        name=f"{kind} Checklist",
        version_no=1,
        is_active=True,
    )
    if fallback:
        items = list(fallback.items.all())
        for index, item in enumerate(items):
            PDIChecklistItem.objects.create(
                template=template,
                section=item.section,
                sub_section=item.sub_section,
                label=item.label,
                sort_order=index,
            )
    return template


def _items(template: PDITemplate):
    items = list(template.items.all().order_by("sort_order", "id"))
    if not items:
        items = list(PDIChecklistItem.objects.order_by("sort_order", "id"))
    return items


def _replace_results(inspection, template, failed_labels=(), remark=""):
    PDIResult.objects.filter(inspection=inspection).delete()
    rows = []
    for item in _items(template):
        result = "NOT_OK" if item.label in failed_labels else "OK"
        rows.append(
            PDIResult(
                inspection=inspection,
                item=item,
                label_snapshot=item.label,
                section_snapshot=item.section,
                sub_section_snapshot=item.sub_section or "",
                result=result,
                remark=remark if result == "NOT_OK" else "",
            )
        )
    PDIResult.objects.bulk_create(rows)


def _sync_inspection(
    *,
    pdi_no,
    kind,
    unit,
    inspection_date,
    status,
    checked_by,
    checked_by_user,
    rating,
    odometer,
    failed_labels=(),
    remark="",
):
    template = _template(kind)
    inspection, _ = PDIInspection.objects.update_or_create(
        pdi_no=pdi_no,
        defaults={
            "inspection_type": kind,
            "vehicle": unit,
            "template": template,
            "import_batch": unit.import_batch,
            "inspection_date": inspection_date,
            "ev_company_name": COMPANY,
            "vin_chassis_no": unit.vin_chassis_no,
            "model_snapshot": f"{unit.vehicle_model.brand} {unit.vehicle_model.model_name}",
            "battery_power_snapshot": str(unit.battery_power_kw or ""),
            "motor_power_snapshot": str(unit.motor_power_kw or ""),
            "motor_no_snapshot": unit.motor_no,
            "manufacture_date_snapshot": unit.manufacture_date,
            "color_snapshot": unit.color,
            "odometer_km_snapshot": odometer,
            "overall_rating": rating,
            "checked_by": checked_by,
            "checked_by_user": checked_by_user,
            "status": status,
            "submitted_at": stamp(-1, 16) if status in ("APPROVED", "REJECTED", "COMPLETED") else None,
        },
    )
    if status != "DRAFT":
        _replace_results(inspection, template, failed_labels, remark)
    else:
        PDIResult.objects.filter(inspection=inspection).delete()

    InspectionIssue.objects.filter(inspection=inspection).delete()
    if failed_labels:
        issue = InspectionIssue.objects.create(
            inspection=inspection,
            description=remark or "Item requires correction before approval.",
            resolved=status in ("APPROVED", "COMPLETED"),
            resolved_by=checked_by_user if status in ("APPROVED", "COMPLETED") else None,
            resolved_at=stamp(-1) if status in ("APPROVED", "COMPLETED") else None,
            resolution_notes="Corrected and re-checked." if status in ("APPROVED", "COMPLETED") else "",
        )
        issue.item = PDIResult.objects.filter(
            inspection=inspection, result="NOT_OK"
        ).first().item if PDIResult.objects.filter(inspection=inspection, result="NOT_OK").exists() else None
        issue.result = PDIResult.objects.filter(inspection=inspection, result="NOT_OK").first()
        issue.save(update_fields=["item", "result"])

    if status in ("APPROVED", "REJECTED", "COMPLETED"):
        if not InspectionPhoto.objects.filter(inspection=inspection).exists():
            InspectionPhoto.objects.create(
                inspection=inspection,
                photo=ContentFile(tiny_png(), name=f"{pdi_no.lower()}-photo.png"),
                caption="Demo inspection photo",
                uploaded_by=checked_by_user,
            )
    else:
        InspectionPhoto.objects.filter(inspection=inspection).delete()
    return inspection


def seed_inspections(stock: dict, users: dict) -> dict[str, object]:
    log("PDI / VEI / condition reports")
    units = stock["units"]
    pdi_template = _template("PDI")
    inspections = {}

    inspections["cargo_pdi"] = _sync_inspection(
        pdi_no="PDI-2026-0001",
        kind="PDI",
        unit=units["cargo_pdi"],
        inspection_date=day(-11),
        status="APPROVED",
        checked_by="Suman Thapa",
        checked_by_user=users.get("service.manager"),
        rating="GOOD",
        odometer=12,
    )
    inspections["hauler_pending"] = _sync_inspection(
        pdi_no="PDI-2026-0002",
        kind="PDI",
        unit=units["hauler_pending"],
        inspection_date=day(-1),
        status="DRAFT",
        checked_by="Manoj Yadav",
        checked_by_user=users.get("technician"),
        rating="",
        odometer=8,
    )
    inspections["cityvan_failed"] = _sync_inspection(
        pdi_no="PDI-2026-0003",
        kind="PDI",
        unit=units["cityvan_failed"],
        inspection_date=day(-4),
        status="REJECTED",
        checked_by="Manoj Yadav",
        checked_by_user=users.get("technician"),
        rating="POOR",
        odometer=26,
        failed_labels=("Reverse Camera Functional & Reverse Display",),
        remark="Reverse camera display flickers when the vehicle is in reverse.",
    )
    inspections["cityvan_pdi_pass"] = _sync_inspection(
        pdi_no="PDI-2026-0004",
        kind="PDI",
        unit=units["cityvan_pdi_pass"],
        inspection_date=day(-2),
        status="APPROVED",
        checked_by="Suman Thapa",
        checked_by_user=users.get("service.manager"),
        rating="GOOD",
        odometer=5,
    )
    inspections["cargo_vei"] = _sync_inspection(
        pdi_no="VEI-2026-0001",
        kind="VEI",
        unit=units["cargo_returned"],
        inspection_date=day(-6),
        status="COMPLETED",
        checked_by="Manoj Yadav",
        checked_by_user=users.get("technician"),
        rating="FAIR",
        odometer=410,
        failed_labels=("Scratches", "Tyre Condition"),
        remark="Minor body scratches and front tyre wear noted at return inspection.",
    )

    # Condition reports across delivery, pre-delivery, service and resale.
    condition_specs = (
        ("cargo_sold_overdue", "AT_DELIVERY", day(-248), 20, "Aarav Sharma", "GOOD"),
        ("cargo_ready", "PRE_DELIVERY", day(-2), 18, "Suman Thapa", "GOOD"),
        ("hauler_sold", "SERVICE", day(-8), 3150, "Manoj Yadav", "GOOD"),
        ("cargo_returned", "RESALE_INSPECTION", day(-5), 410, "Manoj Yadav", "FAIR"),
    )
    reports = {}
    condition_items = _items(pdi_template)[:12]
    for unit_key, report_type, report_date, odometer, inspector, rating in condition_specs:
        unit = units[unit_key]
        report, _ = ConditionReport.objects.update_or_create(
            vehicle=unit,
            report_type=report_type,
            report_date=report_date,
            defaults={
                "template": pdi_template,
                "odometer_km": odometer,
                "overall_rating": rating,
                "inspected_by": inspector,
                "inspected_by_user": users.get("service.manager"),
                "notes": f"Demo {report_type.lower().replace('_', ' ')} condition report.",
                "created_by": users.get("service.manager"),
            },
        )
        ConditionResult.objects.filter(report=report).delete()
        ConditionResult.objects.bulk_create(
            [
                ConditionResult(
                    report=report,
                    item=item,
                    label_snapshot=item.label,
                    section_snapshot=item.section,
                    sub_section_snapshot=item.sub_section or "",
                    result="OK",
                    remark="",
                )
                for item in condition_items
            ]
        )
        if report_type in ("AT_DELIVERY", "PRE_DELIVERY") and not ConditionPhoto.objects.filter(
            report=report
        ).exists():
            for order, caption in enumerate(("Front view", "Rear view")):
                ConditionPhoto.objects.create(
                    report=report,
                    image=ContentFile(
                        tiny_png(), name=f"condition-{report.pk}-{order + 1}.png"
                    ),
                    caption=caption,
                    sort_order=order,
                )
        reports[unit_key] = report

    # Transporter receive checklists for recently arrived units.
    entity_names = (
        "Body Dent",
        "Glass",
        "Mirror",
        "Keys",
        "Reflector 1 Pc",
        "Spare Tire 1 Pc",
        "Tool Box 1 Set",
        "Safety Hammer 1 Pc",
        "Fire Extinguisher 1 Pc",
        "Charger 1PC",
    )
    toolkit_names = (
        "Screw Driver Set + & -",
        "Open Spanner (8/10mm)",
        "Open Spanner (12/14mm)",
        "Wheel Pana",
        "Tyre Lever",
        "Toeing Hook",
        "Reflector Jacket",
        "A/C Charger 7KW",
        "Safety Hammer",
        "Fire Extinguisher",
        "Jack",
        "Plier",
        "Jack Supporter",
        "Spare Tyre",
        "Any Other",
    )
    receives = {}
    receive_specs = (
        ("cargo_pdi", "RCV-2026-0001", day(-12), 12, "Ram Bahadur", "Central Fleet Yard"),
        ("hauler_warehouse", "RCV-2026-0002", day(-14), 6, "Krishna Thapa", "West Distribution Yard"),
        ("cityvan_warehouse", "RCV-2026-0003", day(-14), 9, "Krishna Thapa", "West Distribution Yard"),
    )
    for unit_key, receive_no, receive_date, run_km, driver, yard in receive_specs:
        unit = units[unit_key]
        checklist, _ = VehicleReceiveCheckList.objects.update_or_create(
            receive_no=receive_no,
            defaults={
                "vehicle": unit,
                "import_batch": unit.import_batch,
                "receive_date": receive_date,
                "driver_name": driver,
                "driver_contact": "+977-9800000099",
                "driver_signature": driver,
                "rep_signature": "Aarav Sharma",
                "ev_company": COMPANY,
                "vehicle_run_km": run_km,
                "ev_seater": "2",
                "battery_power_kw": unit.battery_power_kw,
                "ev_charge_percent": 78,
                "vehicle_color": unit.color,
                "vehicle_parked_yard": yard,
                "any_other_information": "Arrived with charging cable and complete toolkit.",
                "legend_notes": "All items checked at handover from the transporter.",
                "entity_conditions": [
                    {
                        "id": index + 1,
                        "entity": name,
                        "condition": "Good",
                        "remarks": "",
                    }
                    for index, name in enumerate(entity_names)
                ],
                "toolkit_items": [
                    {
                        "id": index + 1,
                        "item": name,
                        "present": True,
                        "remarks": "",
                    }
                    for index, name in enumerate(toolkit_names)
                ],
                "overall_status": "ACCEPTED",
                "created_by": users.get("employee"),
            },
        )
        receives[unit_key] = checklist

    import_jobs = {}
    for filename, import_type, rows, created, error in (
        ("shipment_master_2026.xlsx", "shipments", 4, 4, 0),
        ("vehicle_units_2026.xlsx", "units", 18, 18, 0),
        ("customer_master_2026.xlsx", "customers", 5, 5, 0),
    ):
        key = import_type
        job, _ = ImportJob.objects.update_or_create(
            original_filename=filename,
            defaults={
                "import_type": import_type,
                "uploaded_by": users.get("template"),
                "status": "committed",
                "rows_read": rows,
                "rows_created": created,
                "rows_skipped": 0,
                "rows_error": error,
                "options_used": {"dry_run": False, "source": "demo_seed"},
                "started_at": stamp(-20, 10),
                "finished_at": stamp(-20, 10, 5),
            },
        )
        import_jobs[key] = job

    log(f"  inspections: {len(inspections)}, condition reports: {len(reports)}")
    return {
        "inspections": inspections,
        "condition_reports": reports,
        "receive_checklists": receives,
        "import_jobs": import_jobs,
    }
