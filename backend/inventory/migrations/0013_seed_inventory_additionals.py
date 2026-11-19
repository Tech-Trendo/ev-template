# Seed TransportStatusOption, BorderCrossing, and DestinationWarehouse tables
# with the initial default values plus any distinct values already stored on ImportBatch,
# so dynamic dropdowns immediately provide all current and historical options.

from django.db import migrations

DEFAULT_TRANSPORT_STATUSES = [
    ("ORDERED", "Dispatched from China Factory"),
    ("IN_TRANSIT", "In Transit (China to Border)"),
    ("BORDER_CUSTOMS", "At Nepal Border Customs"),
    ("CUSTOMS_CLEARED", "Customs Cleared & En Route"),
    ("ARRIVED", "Arrived at Stockyard"),
]

DEFAULT_BORDER_CROSSINGS = [
    "Rasuwagadhi (Kerung)",
    "Tatopani (Kodari)",
    "Birgunj Dry Port (ICD)",
    "Bhairahawa (Belahiya)",
    "Other",
]

DEFAULT_WAREHOUSES = [
    ("Kathmandu Central Stockyard", "Kathmandu"),
    ("Kathmandu Central Stockyard (Bagdol)", "Bagdol, Lalitpur"),
]


def seed_inventory_additionals(apps, schema_editor):
    TransportStatusOption = apps.get_model("inventory", "TransportStatusOption")
    BorderCrossing = apps.get_model("inventory", "BorderCrossing")
    DestinationWarehouse = apps.get_model("inventory", "DestinationWarehouse")
    ImportBatch = apps.get_model("inventory", "ImportBatch")

    # 1. Transport Statuses
    for name, label in DEFAULT_TRANSPORT_STATUSES:
        TransportStatusOption.objects.get_or_create(
            name=name,
            defaults={"label": label, "is_active": True},
        )
    if ImportBatch.objects.exists():
        for status_val in ImportBatch.objects.exclude(transport_status="").values_list("transport_status", flat=True).distinct():
            if status_val and not TransportStatusOption.objects.filter(name=status_val).exists():
                label = status_val.replace("_", " ").title()
                TransportStatusOption.objects.create(name=status_val, label=label, is_active=True)

    # 2. Border Crossings
    bc_names = list(DEFAULT_BORDER_CROSSINGS)
    if ImportBatch.objects.exists():
        bc_names += list(
            ImportBatch.objects.exclude(border_crossing="").values_list("border_crossing", flat=True).distinct()
        )
    for bc in bc_names:
        if bc and bc.strip():
            BorderCrossing.objects.get_or_create(name=bc.strip(), defaults={"is_active": True})

    # 3. Destination Warehouses
    for name, loc in DEFAULT_WAREHOUSES:
        DestinationWarehouse.objects.get_or_create(
            name=name,
            defaults={"location": loc, "is_active": True},
        )
    if ImportBatch.objects.exists():
        for wh in ImportBatch.objects.exclude(destination_warehouse="").values_list("destination_warehouse", flat=True).distinct():
            if wh and wh.strip() and not DestinationWarehouse.objects.filter(name=wh.strip()).exists():
                DestinationWarehouse.objects.create(name=wh.strip(), is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0012_bordercrossing_destinationwarehouse_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_inventory_additionals, migrations.RunPython.noop),
    ]
