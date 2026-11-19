# Seed the LeadSource table with the sources that used to be hardcoded
# TextChoices on Lead, plus any distinct values already stored on leads, so the
# dynamic dropdown keeps offering every source that is/has been in use.

from django.db import migrations

DEFAULT_SOURCES = [
    "Website",
    "Book Test Drive",
    "Request Quote",
    "Vehicle Enquiry",
    "Facebook",
    "Instagram",
    "Google",
    "Phone",
    "Walk-in",
    "Referral",
    "Dealer",
    "Event",
    "Other",
]


def seed_lead_sources(apps, schema_editor):
    LeadSource = apps.get_model("crm", "LeadSource")
    Lead = apps.get_model("crm", "Lead")

    names = list(DEFAULT_SOURCES)
    if Lead.objects.exists():
        names += list(
            Lead.objects.exclude(source="").values_list("source", flat=True).distinct()
        )

    for name in names:
        if not name:
            continue
        LeadSource.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0006_leadsource_alter_lead_source"),
    ]

    operations = [
        migrations.RunPython(seed_lead_sources, migrations.RunPython.noop),
    ]