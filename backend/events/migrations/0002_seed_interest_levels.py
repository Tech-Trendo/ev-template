from django.db import migrations


def seed_interest_levels(apps, schema_editor):
    InterestLevel = apps.get_model("events", "InterestLevel")
    defaults = [
        ("Hot", 1),
        ("Warm", 2),
        ("Cold", 3),
        ("Normal Inquiry", 4),
    ]
    for name, order in defaults:
        InterestLevel.objects.get_or_create(
            name=name,
            defaults={"sort_order": order, "is_active": True},
        )


def unseed_interest_levels(apps, schema_editor):
    InterestLevel = apps.get_model("events", "InterestLevel")
    InterestLevel.objects.filter(name__in=["Hot", "Warm", "Cold", "Normal Inquiry"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_interest_levels, unseed_interest_levels),
    ]
