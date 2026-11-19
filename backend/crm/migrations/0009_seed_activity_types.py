# Seed the ActivityType table with the types that used to be hardcoded
# TextChoices on Activity, plus any distinct values already stored on
# activities, so the dynamic dropdown keeps offering every type that is/has
# been in use.

from django.db import migrations

DEFAULT_TYPES = [
    # (name, label) — mirrors the old Activity.Type TextChoices order.
    ("call", "Call"),
    ("email", "Email"),
    ("whatsapp", "WhatsApp"),
    ("meeting", "Meeting"),
    ("note", "Note"),
    ("test_drive", "Test Drive"),
    ("quotation", "Quotation"),
    ("status_change", "Status Change"),
]


def seed_activity_types(apps, schema_editor):
    ActivityType = apps.get_model("crm", "ActivityType")
    Activity = apps.get_model("crm", "Activity")

    for name, label in DEFAULT_TYPES:
        ActivityType.objects.get_or_create(name=name, defaults={"label": label})

    # Preserve any free-text types already stored on activities so they keep
    # appearing in dropdowns.
    for name in Activity.objects.values_list("type", flat=True).distinct():
        if not name:
            continue
        ActivityType.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0008_activity_type"),
    ]

    operations = [
        migrations.RunPython(seed_activity_types, migrations.RunPython.noop),
    ]
