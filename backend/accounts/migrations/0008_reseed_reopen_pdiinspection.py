"""Grant reopen_pdiinspection to Service Manager and Super Admin.

Re-runs seed_starter_roles so existing deployments pick up the reopen permission.
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
        ("accounts", "0007_alter_userprofile_options_and_more"),
        ("inventory", "0018_alter_pdiinspection_options_and_more"),
    ]

    operations = [
        migrations.RunPython(reseed_roles, reverse_code=migrations.RunPython.noop),
    ]
