"""Give attendance management to HR/Admin only.

Face self check-in is no longer a starter-role permission. HR records
attendance for other staff. Re-runs the starter role seed so existing
development databases pick this up.
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
        ("accounts", "0012_seed_hrm_employee_roles"),
        ("attendance", "0002_assign_role_perms"),
    ]

    operations = [
        migrations.RunPython(reseed_roles, reverse_code=migrations.RunPython.noop),
    ]
