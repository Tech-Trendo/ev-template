"""Seed PDI checklist template v1 from the paper PDI form.

Sections, sub-sections, labels and order match the paper form exactly.
Safe to re-run: only creates template v1 when it does not exist yet, so
later template versions (and the inspections pointing at them) are untouched.
"""

from django.db import migrations

T = "TOOLS_AND_EQUIPMENT"
F = "FUNCTIONALITY"
A = "APPEARANCE_AND_CONDITION"
IN = "INTERIOR_CLEANLINESS"
EX = "EXTERIOR_BODY_PARTS"

ITEMS = [
    # (section, sub_section, label)
    (T, None, "Tyre Repair Kit"),
    (T, None, "Apple CarPlay/Android Auto Connector"),
    (T, None, "Key & Remote Lost"),
    (T, None, "Tyre Pressure"),
    (T, None, "Brake Oil Level"),
    (T, None, "Coolant Level"),
    (T, None, "Wiper Washing Fluid/Water"),
    (T, None, "AC Charger 3.5kW/7kW & Fast Charging System (DC)"),
    (F, None, "Turn Indicators Functioning/Indicator Function"),
    (F, None, "Multi Function Display/Infotainment Functionality"),
    (F, None, "Speaker Functioning"),
    (F, None, "Wipers Functioning & Water Spray Functional"),
    (F, None, "Head Light (Combination Switch)"),
    (F, None, "Electric Exterior Mirror Adjustments"),
    (F, None, "Door Lock & Unlock/Key Remote Functional"),
    (F, None, "Rearview Mirror Adjusting Button/Switch"),
    (F, None, "Power Window L&R"),
    (F, None, "Temperature Selector/Rear Adjusting Button"),
    (F, None, "A/C Compressor"),
    (F, None, "Instrument Cluster"),
    (F, None, "Eco/Sport Mode Functional"),
    (F, None, "LCD Display"),
    (F, None, "Speedometer"),
    (F, None, "Tachometer"),
    (F, None, "Adjusting Button/Switch"),
    (F, None, "Gear Selector Lever/Knob/Gear Shifting"),
    (F, None, "Wheel Alignment"),
    (F, None, "Horn/Buzzers"),
    (F, None, "Pendrive Functional/Bluetooth Functional"),
    (F, None, "Cover Plate (SRS Airbag Available)"),
    (F, None, "OBD/USB CAN Input Cable"),
    (F, None, "Key Functionality/Ignition Switch"),
    (F, None, "Reverse Camera Functional & Reverse Display"),
    (F, None, "Reverse Radar Sensor Functional"),
    (F, None, "Ambient/Ceiling Light Functional"),
    (F, None, "USB Mobile Charging Functional/Pendrive Function"),
    (F, None, "AC Functional/AC Control Knob"),
    (F, None, "Dashboard Blower Outlet"),
    (F, None, "Emergency Hazard Light/Rocker Switch"),
    (F, None, "Adjustment of Seats & Safety Belt/Alarm"),
    (F, None, "Air Outlet Selector"),
    (F, None, "Hand Brake & Steer Wheel"),
    (F, None, "Electric Vacuum Pump/Electric Air Pump"),
    (F, None, "Accelerator Pedal System"),
    (F, None, "Brake Pedal/Brake System"),
    (F, None, "Glow Box/Auxiliary Box/Storage Compartment"),
    (F, None, "Water/Wiper Tank"),
    (F, None, "Steering Function"),
    (F, None, "Combination Switch (Wiper)"),
    (F, None, "Radiator"),
    (F, None, "Fog Light L&R Functional"),
    (F, None, "Rear Brake Light & Hand Brake Light Functional"),
    (A, IN, "Seat & Upholstery"),
    (A, IN, "Ceiling & Floor"),
    (A, IN, "Dashboard"),
    (A, IN, "Glove Box (Tabletop Drawer)"),
    (A, IN, "Door Pad"),
    (A, IN, "Utility Pockets"),
    (A, IN, "Boot Space/Cargo Box"),
    (A, IN, "Inside Bonnet"),
    (A, IN, "Passenger Hand Holder"),
    (A, EX, "Tyre Condition"),
    (A, EX, "Scratches"),
    (A, EX, "Paint Quality"),
    (A, EX, "Windshield & Other Glasses"),
    (A, EX, "Sliding Door L&R"),
    (A, EX, "All Glasses"),
    (A, EX, "Wheel Nuts/Bolts"),
    (A, EX, "Abnormal Noise"),
]


def seed_pdi_template_v1(apps, schema_editor):
    PDITemplate = apps.get_model("inventory", "PDITemplate")
    PDIChecklistItem = apps.get_model("inventory", "PDIChecklistItem")
    if PDITemplate.objects.filter(version_no=1).exists():
        return
    template = PDITemplate.objects.create(version_no=1, is_active=True)
    PDIChecklistItem.objects.bulk_create(
        [
            PDIChecklistItem(
                template=template,
                section=section,
                sub_section=sub_section,
                label=label,
                sort_order=idx,
            )
            for idx, (section, sub_section, label) in enumerate(ITEMS)
        ]
    )


def unseed_pdi_template_v1(apps, schema_editor):
    PDITemplate = apps.get_model("inventory", "PDITemplate")
    # Only remove v1 when nothing references it (inspections/reports protect it).
    PDITemplate.objects.filter(
        version_no=1, inspections__isnull=True, condition_reports__isnull=True
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_pdi_template_v1, unseed_pdi_template_v1),
    ]
