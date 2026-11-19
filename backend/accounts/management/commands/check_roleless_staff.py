"""Detect active staff users with no RBAC roles (fully locked out).

Run against prod before/after each RBAC-related deploy::

    python manage.py check_roleless_staff

Exits 0 when clean, 1 when any ``is_staff=True, is_active=True,
is_superuser=False`` user has zero roles on their profile. Superusers are
excluded (they bypass all checks). Inactive users are excluded (they cannot
log in anyway).

CI: if CI cannot reach prod data, run this as a documented pre-deploy manual
step instead — see help text. A test-only roleless user in a scratch DB is
still a finding; assign an explicit role or deactivate the account.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Report active staff users with no roles (locked out by least-privilege "
        "defaults). Run against prod before/after each RBAC-related deploy. "
        "Exits non-zero with the username list when any are found."
    )

    def handle(self, *args, **options):
        from accounts.models import UserProfile

        User = get_user_model()
        offenders = []
        qs = (
            User.objects.filter(is_staff=True, is_active=True, is_superuser=False)
            .order_by("username")
            .only("id", "username")
        )
        for user in qs:
            try:
                profile = user.profile
            except UserProfile.DoesNotExist:
                offenders.append(user.username)
                continue
            if not profile.roles.exists():
                offenders.append(user.username)

        if offenders:
            for username in offenders:
                self.stdout.write(f"roleless staff: {username}")
            raise CommandError(
                f"{len(offenders)} active staff user(s) with no roles: "
                + ", ".join(offenders)
            )
        self.stdout.write(self.style.SUCCESS("OK: no roleless active staff."))
