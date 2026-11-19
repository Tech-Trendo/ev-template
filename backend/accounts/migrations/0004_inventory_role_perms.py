"""Grant inventory (stock/PDI) permissions to the starter roles.

Re-runs ``seed_starter_roles`` (now inventory-aware) so existing
deployments pick up the new model permissions. Safe to re-run: the seeder
uses get_or_create and resets starter permission sets.
"""

from django.db import migrations


def reseed_roles(apps, schema_editor):
    from django.core.management.sql import emit_post_migrate_signal

    emit_post_migrate_signal(
        verbosity=0,
        interactive=False,
        db=schema_editor.connection.alias,
        apps=apps,
    )
    from accounts.models import seed_starter_roles

    seed_starter_roles(apps=apps)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_add_is_protected"),
        ("inventory", "0002_seed_pdi_checklist"),
    ]

    operations = [
        migrations.RunPython(reseed_roles, reverse_code=migrations.RunPython.noop),
    ]
