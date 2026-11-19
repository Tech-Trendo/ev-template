"""RBAC permission classes built on Django's auth.Permission framework.

Enforcement model (least-privilege, fail-closed):
- Django superusers always pass.
- Users holding any of the view's required ``app_label.codename`` labels —
  via direct grant, group, or :class:`accounts.models.Role` — pass.
- ``Super Admin`` role holders pass any ``HasRolePermission`` check even if
  their explicit permission set is stale (backstop for permission drift).
- No ``is_staff``-only or ``no-roles-assigned`` bypasses: roleless users are
  denied by default. Bootstrapping of initial admins is handled by the
  ``accounts 0002_seed_roles`` data migration (existing ``is_staff`` users
  backfilled to ``Super Admin``) and by Django ``createsuperuser``
  (``is_superuser`` bypasses all checks).

Dealer scoping (Dealer Staff limited to their own dealer) is a queryset
filter, not just a permission check — see
:meth:`ServicingQuerysetMixin.get_queryset` usage in the servicing app and
:func:`accounts.models.user_dealer_id`.
"""

from rest_framework.permissions import BasePermission

from .models import user_has_perm, user_is_super_admin


class HasRolePermission(BasePermission):
    """Check the view's ``perm_map`` (DRF action -> permission label list).

    Views using this class declare e.g.::

        perm_map = {
            "list": ["servicing.view_servicerecord"],
            "create": ["servicing.add_servicerecord"],
            ...
        }

    Any one matching label grants access. Superusers / Super Admins pass via
    :func:`user_is_super_admin` when the map requires it implicitly — views
    should still list the concrete labels so role holders match too.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if user.is_superuser:
            return True
        perm_map = getattr(view, "perm_map", None)
        if not perm_map:
            # Fail-closed: a view that forgets perm_map denies everyone
            # except superusers (handled above) and Super Admins. Never
            # fall back to is_staff.
            return user_is_super_admin(user)
        action = getattr(view, "action", None)
        required = perm_map.get(action, perm_map.get("default", []))
        if any(user_has_perm(user, label) for label in required):
            return True
        # Super Admin backstop: passes even if their stored permission set
        # drifted out of sync with newly added models (see ensure_super_admin_role).
        if user_is_super_admin(user):
            return True
        return False


class IsSuperAdmin(BasePermission):
    """Super Admin only (Django superuser or Super Admin role).

    Used for role/user management endpoints. ``is_staff`` alone is never
    enough. There is no "no roles assigned yet" bypass — roleless users are
    denied (least-privilege default).
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if user.is_superuser or user_is_super_admin(user):
            return True
        return False
