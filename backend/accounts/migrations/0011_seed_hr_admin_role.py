"""Grant the HR/Admin role the HRM settings permissions.

Re-runs seed_starter_roles so Super Admin also receives the new permissions.
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
        ("accounts", "0010_alter_userprofile_photo"),
        ("hrm", "0001_hr_calendar_policy"),
    ]

    operations = [
        migrations.RunPython(reseed_roles, reverse_code=migrations.RunPython.noop),
    ]
