"""Grant attendance permissions to the existing starter roles.

Complements accounts 0002 (which predates this app): Service Managers get
full attendance visibility + management, Technicians and Dealer Staff get
own-attendance viewing. Safe to re-run.
"""

from django.db import migrations


def assign_attendance_perms(apps, schema_editor):
    from django.core.management.sql import emit_post_migrate_signal

    emit_post_migrate_signal(
        verbosity=0,
        interactive=False,
        db=schema_editor.connection.alias,
        apps=apps,
    )

    Role = apps.get_model("accounts", "Role")
    Permission = apps.get_model("auth", "Permission")

    def perms(*labels):
        found = []
        for label in labels:
            try:
                app_label, codename = label.split(".", 1)
            except ValueError:
                continue
            perm = Permission.objects.filter(
                content_type__app_label=app_label, codename=codename
            ).first()
            if perm is not None:
                found.append(perm)
        return found

    grants = {
        "Service Manager": perms(
            "attendance.view_attendancerecord",
            "attendance.manage_attendance",
            "attendance.view_stafffaceprofile",
            "attendance.add_stafffaceprofile",
            "attendance.change_stafffaceprofile",
            "attendance.delete_stafffaceprofile",
        ),
        "Technician": perms("attendance.view_own_attendance"),
        "Dealer Staff": perms("attendance.view_own_attendance"),
    }
    for name, permissions in grants.items():
        try:
            role = Role.objects.get(name=name)
        except Role.DoesNotExist:
            continue
        for perm in permissions:
            role.permissions.add(perm)


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0001_initial"),
        ("accounts", "0002_seed_roles"),
    ]

    operations = [
        migrations.RunPython(
            assign_attendance_perms, reverse_code=migrations.RunPython.noop
        ),
    ]
