"""Grant quotation edit and revise permissions to the starter roles.

Re-runs ``seed_starter_roles`` so existing deployments pick up the new
quotation edit and revise permissions.
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
        ("accounts", "0004_inventory_role_perms"),
        ("crm", "0021_alter_quotation_options"),
    ]

    operations = [
        migrations.RunPython(reseed_roles, reverse_code=migrations.RunPython.noop),
    ]
