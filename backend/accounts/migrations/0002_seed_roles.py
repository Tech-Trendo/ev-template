"""Seed starter RBAC roles and backfill Super Admin for existing staff.

Migration safety: every existing ``is_staff`` user is assigned the
Super Admin role, so nothing currently working loses access on deploy.
Safe to re-run (uses get_or_create and resets starter permission sets).
"""

from django.db import migrations


def seed_roles(apps, schema_editor):
    from django.core.management.sql import emit_post_migrate_signal

    # Auth Permission rows are normally created by the post_migrate signal,
    # which runs *after* data migrations — emit it for the current state so
    # the dealers/servicing permissions exist before we assign them.
    emit_post_migrate_signal(
        verbosity=0,
        interactive=False,
        db=schema_editor.connection.alias,
        apps=apps,
    )

    Role = apps.get_model("accounts", "Role")
    UserProfile = apps.get_model("accounts", "UserProfile")
    User = apps.get_model("auth", "User")
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

    definitions = {
        "Super Admin": (
            "Full access to every app (legacy is_staff equivalent).",
            list(Permission.objects.all()),
        ),
        "Service Manager": (
            "Full servicing access across all dealers, view dealers.",
            perms(
                "dealers.view_dealer",
                "servicing.view_servicerecord",
                "servicing.add_servicerecord",
                "servicing.change_servicerecord",
                "servicing.delete_servicerecord",
                "servicing.view_servicerecordpart",
                "servicing.add_servicerecordpart",
                "servicing.change_servicerecordpart",
                "servicing.delete_servicerecordpart",
            ),
        ),
        "Technician": (
            "Update servicing status/parts and own attendance.",
            perms(
                "servicing.view_servicerecord",
                "servicing.change_servicerecord",
                "servicing.view_servicerecordpart",
                "servicing.add_servicerecordpart",
                "servicing.change_servicerecordpart",
            ),
        ),
        "Dealer Staff": (
            "Dealers + servicing scoped to their own dealer only.",
            perms(
                "dealers.view_dealer",
                "servicing.view_servicerecord",
                "servicing.add_servicerecord",
                "servicing.change_servicerecord",
                "servicing.view_servicerecordpart",
                "servicing.add_servicerecordpart",
                "servicing.change_servicerecordpart",
            ),
        ),
    }
    roles = {}
    for name, (description, permissions) in definitions.items():
        role, _ = Role.objects.get_or_create(
            name=name, defaults={"description": description}
        )
        role.permissions.set(permissions)
        roles[name] = role

    super_admin = roles["Super Admin"]
    for user in User.objects.filter(is_staff=True, is_active=True):
        profile, _ = UserProfile.objects.get_or_create(user_id=user.pk)
        profile.roles.add(super_admin)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("dealers", "0001_initial"),
        ("servicing", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_roles, reverse_code=migrations.RunPython.noop),
    ]
