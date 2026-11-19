from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import models

from common.storage import private_storage


class Role(models.Model):
    """Named bundle of Django permissions assignable to users.

    Built on top of Django's built-in ``auth.Permission`` framework (rather
    than a hand-rolled permission table) so Django admin and DRF keep working.
    Per-model ``add/change/delete/view`` rows come free; custom ones (e.g.
    attendance ``view_own``/``view_all``) are added as proxy/custom model
    permissions by the app that needs them.
    """

    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(
        Permission, blank=True, related_name="roles"
    )
    is_protected = models.BooleanField(
        default=False,
        help_text="Immutable system marker for the Super Admin role. "
        "Protected roles cannot be renamed or deleted via the API, and "
        "grant super-admin access regardless of their name.",
    )
    is_dealer_role = models.BooleanField(
        default=False,
        help_text="Designates this role as dealer-scoped. Users holding this role require an assigned home dealership.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def user_count(self):
        return self.profiles.count()


class UserProfile(models.Model):
    """Per-user RBAC + dealer-scope extension of the default User model.

    Created lazily via :func:`get_user_profile` (this codebase uses no
    signals, so no post_save hook — callers use get_or_create explicitly).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    roles = models.ManyToManyField(Role, blank=True, related_name="profiles")
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_profiles",
        help_text="Home dealer for dealer-scoped roles (Dealer Staff). Empty = all dealers.",
    )
    # Deprecated person columns. The Employee record is the source of truth.
    # These fields remain so existing rows and old code keep reading, and the
    # data migration can copy them. Do not add new readers.
    date_of_birth = models.DateField(null=True, blank=True)
    pan_vat_number = models.CharField(max_length=30, blank=True, default="")
    temporary_address = models.CharField(max_length=255, blank=True, default="")
    permanent_address = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    personal_email = models.EmailField(blank=True, default="")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default="")
    citizenship_number = models.CharField(max_length=50, blank=True, default="")
    join_date = models.DateField(null=True, blank=True)
    department = models.CharField(max_length=100, blank=True, default="")
    designation = models.CharField(max_length=100, blank=True, default="")
    employment_status = models.CharField(
        max_length=30,
        default="active",
        choices=[
            ("active", "Active"),
            ("probation", "Probation"),
            ("resigned", "Resigned"),
            ("terminated", "Terminated"),
        ],
    )
    photo = models.ImageField(
        upload_to="employee_photos/", null=True, blank=True, storage=private_storage
    )
    photo_url = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__username"]
        permissions = [
            ("view_employee_sensitive", "Can view sensitive employee profile fields (PAN/VAT, citizenship, DOB)"),
        ]

    def __str__(self):
        return f"Profile({self.user})"

    def resolved_photo_url(self) -> str:
        """External URL if set; otherwise authenticated private-photo endpoint."""
        if self.photo_url:
            return self.photo_url
        if self.photo and self.user_id:
            return f"/api/users/{self.user_id}/photo/"
        return ""


def get_user_profile(user):
    """Return the UserProfile for *user*, creating it on demand."""
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def user_permission_labels(user):
    """All ``app_label.codename`` labels granted to *user*.

    Union of direct user permissions, group permissions, and Role permissions.

    NOTE (Bug 8): Django ``Group`` permissions are intentionally honored here
    as a valid-but-unused extension point (no groups are seeded or assigned
    anywhere in this codebase — the primary RBAC path is ``Role`` via
    ``UserProfile``). Kept so a future operator *could* use groups without
    silent failure; do not remove as "dead code", and do not use groups as
    the primary RBAC path without updating docs/tests.
    """
    if not user or not user.is_authenticated:
        return set()
    labels = set(
        user.user_permissions.select_related("content_type").values_list(
            "content_type__app_label", "codename"
        )
    ) | set(
        Permission.objects.filter(group__user=user)
        .select_related("content_type")
        .values_list("content_type__app_label", "codename")
    )
    profile = getattr(user, "profile", None)
    if profile is not None:
        labels |= set(
            Permission.objects.filter(roles__profiles=profile)
            .select_related("content_type")
            .values_list("content_type__app_label", "codename")
        )
    else:
        # No profile row yet — fall back to any role linked via reverse query.
        labels |= set(
            Permission.objects.filter(roles__profiles__user=user)
            .select_related("content_type")
            .values_list("content_type__app_label", "codename")
        )
    return {f"{app}.{codename}" for app, codename in labels}


def user_has_perm(user, perm_label):
    """Check a single ``app_label.codename`` label against roles/groups/direct."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    return perm_label in user_permission_labels(user)


def user_has_role(user, role_name):
    """Check whether *user* holds the role named *role_name* (case-insensitive)."""
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, "profile", None)
    if profile is None:
        return UserProfile.objects.filter(
            user=user, roles__name__iexact=role_name
        ).exists()
    return profile.roles.filter(name__iexact=role_name).exists()


def user_has_protected_role(user):
    """Check whether *user* holds any role flagged ``is_protected``."""
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, "profile", None)
    if profile is None:
        return UserProfile.objects.filter(user=user, roles__is_protected=True).exists()
    return profile.roles.filter(is_protected=True).exists()


def user_is_super_admin(user):
    """Super-admin check: Django superuser, protected Super Admin role, or legacy name match.

    The ``is_protected`` flag is the primary marker (survives renames);
    the ``"Super Admin"`` name match is kept for backwards compatibility
    with databases seeded before the flag existed.
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    if user_has_protected_role(user):
        return True
    return user_has_role(user, "Super Admin")


def user_dealer_id(user):
    """Home dealer id for dealer-scoped roles, or None (all dealers)."""
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "profile", None)
    if profile is None:
        profile = UserProfile.objects.filter(user=user).first()
        if profile is None:
            return None
    return profile.dealer_id


def role_is_dealer_scoped(role):
    """Check whether a Role instance or role name indicates dealer scoping."""
    if not role:
        return False
    if isinstance(role, str):
        return "dealer" in role.lower()
    return bool(
        getattr(role, "is_dealer_role", False)
        or "dealer" in (getattr(role, "name", "") or "").lower()
    )


def user_has_dealer_role(user):
    """Return True if user has any role designated as a dealer role (and is not super-admin)."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser or user_is_super_admin(user):
        return False
    profile = getattr(user, "profile", None)
    if profile is None:
        profile = UserProfile.objects.filter(user=user).first()
    if not profile:
        return False
    return profile.roles.filter(
        models.Q(is_dealer_role=True) | models.Q(name__icontains="dealer")
    ).exists()


def scope_to_user_dealer(qs, user, field="dealer_id"):
    """Apply the standard dealer scoping used by the CRM/inventory/servicing viewsets."""
    if user.is_superuser or user_is_super_admin(user):
        return qs
    home_dealer = user_dealer_id(user)
    if home_dealer is not None:
        return qs.filter(**{field: home_dealer})
    if user_has_dealer_role(user):
        return qs.none()
    return qs


def ensure_super_admin_role():
    """Get-or-create the protected Super Admin role holding every permission.

    Safe to call on every ``post_migrate``: keeps the Super Admin permission
    set in sync with newly added models/permissions without touching other
    roles. Also repairs the ``is_protected`` flag on legacy rows that were
    seeded by name only.
    """
    role, _ = Role.objects.get_or_create(
        name="Super Admin",
        defaults={
            "description": "Full access to every app (legacy is_staff equivalent).",
            "is_protected": True,
        },
    )
    if not role.is_protected:
        role.is_protected = True
        role.save(update_fields=["is_protected", "updated_at"])
    role.permissions.set(Permission.objects.all())
    # Backfill the flag on any legacy "Super Admin" rows (case-insensitive).
    Role.objects.filter(name__iexact="Super Admin", is_protected=False).update(
        is_protected=True
    )
    return role


def seed_starter_roles(apps=None):
    """Create starter roles and grant their model permissions.

    Safe to re-run: uses get_or_create and resets each role's permission set
    to the current starter definition.

    NOTE (Bug 5 — CRM access gap, intentional pending product decision):
    none of the starter roles below grant any ``crm.*`` permission, so the
    CRM pipeline (leads/customers/opportunities/test-drives/quotations/
    activities) is Super-Admin-only out of the box. This is NOT a code bug —
    it needs a business decision on whether a sales-facing starter role
    (e.g. ``Sales`` / ``CRM Manager`` with view/add/change on leads,
    customers, opportunities, testdrives, quotations, activities) should
    exist. If yes, add it here + a data migration following the existing
    pattern. Do not "fix" by silently granting crm.* to Service Manager /
    Technician / Dealer Staff.
    """
    if apps is not None:
        RoleModel = apps.get_model("accounts", "Role")
        UserProfileModel = apps.get_model("accounts", "UserProfile")
        PermissionModel = apps.get_model("auth", "Permission")
        UserModel = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    else:
        RoleModel = Role
        UserProfileModel = UserProfile
        PermissionModel = Permission
        UserModel = get_user_model()

    def perms(*labels):
        found = []
        for label in labels:
            try:
                app_label, codename = label.split(".", 1)
            except ValueError:
                continue
            perm = PermissionModel.objects.filter(
                content_type__app_label=app_label, codename=codename
            ).first()
            if perm is not None:
                found.append(perm)
        return found

    definitions = {
        "Super Admin": (
            "Full access to every app (legacy is_staff equivalent).",
            list(PermissionModel.objects.all()),
        ),
        "Central Operations Admin": (
            "Head office operations: historical imports, shipments, document vault, inventory, and cross-dealer oversight.",
            perms(
                "inventory.run_historical_import",
                "inventory.view_importbatch",
                "inventory.add_importbatch",
                "inventory.change_importbatch",
                "inventory.delete_importbatch",
                "inventory.view_shipment_costs",
                "inventory.override_shipment_closed",
                "inventory.view_shipmentcosttype",
                "inventory.add_shipmentcosttype",
                "inventory.change_shipmentcosttype",
                "inventory.delete_shipmentcosttype",
                "inventory.view_shipmentcost",
                "inventory.add_shipmentcost",
                "inventory.change_shipmentcost",
                "inventory.delete_shipmentcost",
                "inventory.view_vehicleunit",
                "inventory.add_vehicleunit",
                "inventory.change_vehicleunit",
                "inventory.delete_vehicleunit",
                "inventory.view_stockmovement",
                "inventory.view_vehiclemodel",
                "inventory.add_vehiclemodel",
                "inventory.change_vehiclemodel",
                "inventory.delete_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.manage_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "inventory.view_sale",
                "inventory.change_sale",
                "inventory.cancel_sale",
                "inventory.view_pditemplate",
                "inventory.manage_pditemplate",
                "inventory.view_pdiinspection",
                "inventory.change_pdiinspection",
                "inventory.complete_pdiinspection",
                "inventory.print_pdiinspection",
                "inventory.reopen_pdiinspection",
                "inventory.view_conditionreport",
                "inventory.change_conditionreport",
                "crm.view_document",
                "crm.add_document",
                "crm.change_document",
                "crm.delete_document",
                "crm.view_documenttypemaster",
                "crm.add_documenttypemaster",
                "crm.change_documenttypemaster",
                "crm.delete_documenttypemaster",
                "crm.view_customer",
                "crm.add_customer",
                "crm.change_customer",
                "dealers.view_dealer",
                "servicing.view_servicerecord",
            ),
        ),
        "Sales Executive": (
            "Full sales pipeline access: leads, customers, quotations, test drives, and stock.",
            perms(
                "crm.view_lead",
                "crm.add_lead",
                "crm.change_lead",
                "crm.view_customer",
                "crm.add_customer",
                "crm.change_customer",
                "crm.view_testdrive",
                "crm.add_testdrive",
                "crm.change_testdrive",
                "crm.view_quotation",
                "crm.add_quotation",
                "crm.change_quotation",
                "crm.edit_quotation",
                "crm.revise_quotation",
                "crm.view_activity",
                "crm.add_activity",
                "crm.change_activity",
                "crm.view_opportunity",
                "crm.add_opportunity",
                "crm.change_opportunity",
                "crm.view_leadsource",
                "crm.view_activitytype",
                "crm.view_bank",
                "crm.view_bankbranch",
                "leads.view_enquiry",
                "leads.change_enquiry",
                "vehicles.view_vehicle",
                "inventory.view_vehicleunit",
                "inventory.change_vehicleunit",
                "inventory.view_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "inventory.view_stockmovement",
                "inventory.view_sale",
                "dealers.view_dealer",
            ),
        ),
        "Sales Manager": (
            "Full sales pipeline and inventory sales management access, including cancelling sales.",
            perms(
                "crm.view_lead",
                "crm.add_lead",
                "crm.change_lead",
                "crm.delete_lead",
                "crm.view_customer",
                "crm.add_customer",
                "crm.change_customer",
                "crm.view_testdrive",
                "crm.add_testdrive",
                "crm.change_testdrive",
                "crm.view_quotation",
                "crm.add_quotation",
                "crm.change_quotation",
                "crm.edit_quotation",
                "crm.revise_quotation",
                "crm.view_activity",
                "crm.add_activity",
                "crm.change_activity",
                "crm.view_opportunity",
                "crm.add_opportunity",
                "crm.change_opportunity",
                "crm.view_leadsource",
                "crm.view_activitytype",
                "crm.view_bank",
                "crm.view_bankbranch",
                "leads.view_enquiry",
                "leads.change_enquiry",
                "vehicles.view_vehicle",
                "inventory.view_vehicleunit",
                "inventory.change_vehicleunit",
                "inventory.view_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.manage_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "inventory.view_stockmovement",
                "inventory.view_sale",
                "inventory.change_sale",
                "inventory.cancel_sale",
                "dealers.view_dealer",
            ),
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
                "inventory.view_vehiclereceivechecklist",
                "inventory.add_vehiclereceivechecklist",
                "inventory.change_vehiclereceivechecklist",
                "inventory.delete_vehiclereceivechecklist",
                "inventory.view_vehiclereceivechecklistitem",
                "inventory.add_vehiclereceivechecklistitem",
                "inventory.change_vehiclereceivechecklistitem",
                "inventory.delete_vehiclereceivechecklistitem",
                "inventory.view_vehiclemodel",
                "inventory.add_vehiclemodel",
                "inventory.change_vehiclemodel",
                "inventory.delete_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.manage_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "inventory.view_importbatch",
                "inventory.add_importbatch",
                "inventory.change_importbatch",
                "inventory.delete_importbatch",
                "inventory.view_shipment_costs",
                "inventory.override_shipment_closed",
                "inventory.view_shipmentcosttype",
                "inventory.add_shipmentcosttype",
                "inventory.change_shipmentcosttype",
                "inventory.delete_shipmentcosttype",
                "inventory.view_shipmentcost",
                "inventory.add_shipmentcost",
                "inventory.change_shipmentcost",
                "inventory.delete_shipmentcost",
                "crm.view_document",
                "crm.add_document",
                "crm.change_document",
                "crm.delete_document",
                "crm.view_documenttypemaster",
                "crm.add_documenttypemaster",
                "crm.change_documenttypemaster",
                "crm.delete_documenttypemaster",
                "inventory.view_vehicleunit",
                "inventory.add_vehicleunit",
                "inventory.change_vehicleunit",
                "inventory.delete_vehicleunit",
                "inventory.view_stockmovement",
                "inventory.view_pditemplate",
                "inventory.manage_pditemplate",
                "inventory.add_pditemplate",
                "inventory.change_pditemplate",
                "inventory.delete_pditemplate",
                "inventory.view_pdichecklistitem",
                "inventory.add_pdichecklistitem",
                "inventory.change_pdichecklistitem",
                "inventory.delete_pdichecklistitem",
                "inventory.view_pdiinspection",
                "inventory.add_pdiinspection",
                "inventory.change_pdiinspection",
                "inventory.complete_pdiinspection",
                "inventory.print_pdiinspection",
                "inventory.reopen_pdiinspection",
                "inventory.delete_pdiinspection",
                "inventory.view_pdiresult",
                "inventory.add_pdiresult",
                "inventory.change_pdiresult",
                "inventory.delete_pdiresult",
                "inventory.view_inspectionissue",
                "inventory.add_inspectionissue",
                "inventory.change_inspectionissue",
                "inventory.delete_inspectionissue",
                "inventory.resolve_inspectionissue",
                "inventory.view_inspectionphoto",
                "inventory.add_inspectionphoto",
                "inventory.change_inspectionphoto",
                "inventory.delete_inspectionphoto",
                "inventory.view_conditionreport",
                "inventory.add_conditionreport",
                "inventory.change_conditionreport",
                "inventory.delete_conditionreport",
                "inventory.view_conditionresult",
                "inventory.add_conditionresult",
                "inventory.change_conditionresult",
                "inventory.delete_conditionresult",
                "inventory.view_conditionphoto",
                "inventory.add_conditionphoto",
                "inventory.change_conditionphoto",
                "inventory.delete_conditionphoto",
            ),
        ),
        "Technician": (
            "Update servicing status and parts.",
            perms(
                "servicing.view_servicerecord",
                "servicing.change_servicerecord",
                "servicing.view_servicerecordpart",
                "servicing.add_servicerecordpart",
                "servicing.change_servicerecordpart",
                "inventory.view_vehiclereceivechecklist",
                "inventory.add_vehiclereceivechecklist",
                "inventory.change_vehiclereceivechecklist",
                "inventory.view_vehiclereceivechecklistitem",
                "inventory.add_vehiclereceivechecklistitem",
                "inventory.change_vehiclereceivechecklistitem",
                "inventory.view_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "inventory.view_importbatch",
                "inventory.view_vehicleunit",
                "inventory.view_stockmovement",
                "inventory.view_pditemplate",
                "inventory.view_pdichecklistitem",
                "inventory.view_pdiinspection",
                "inventory.add_pdiinspection",
                "inventory.change_pdiinspection",
                "inventory.complete_pdiinspection",
                "inventory.print_pdiinspection",
                "inventory.view_pdiresult",
                "inventory.add_pdiresult",
                "inventory.change_pdiresult",
                "inventory.delete_pdiresult",
                "inventory.view_inspectionissue",
                "inventory.add_inspectionissue",
                "inventory.change_inspectionissue",
                "inventory.resolve_inspectionissue",
                "inventory.view_inspectionphoto",
                "inventory.add_inspectionphoto",
                "inventory.change_inspectionphoto",
                "inventory.view_conditionreport",
                "inventory.add_conditionreport",
                "inventory.change_conditionreport",
                "inventory.view_conditionresult",
                "inventory.add_conditionresult",
                "inventory.change_conditionresult",
                "inventory.delete_conditionresult",
                "inventory.view_conditionphoto",
                "inventory.add_conditionphoto",
                "inventory.change_conditionphoto",
                "inventory.delete_conditionphoto",
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
                "inventory.view_vehiclereceivechecklist",
                "inventory.add_vehiclereceivechecklist",
                "inventory.change_vehiclereceivechecklist",
                "inventory.view_vehiclemodel",
                "inventory.view_vehiclevariant",
                "inventory.view_vehiclebodytype",
                "crm.view_document",
                "crm.add_document",
                "inventory.view_vehicleunit",
                "inventory.change_vehicleunit",
                "inventory.view_stockmovement",
                "inventory.view_pditemplate",
                "inventory.view_pdichecklistitem",
                "inventory.view_pdiinspection",
                "inventory.print_pdiinspection",
                "inventory.view_inspectionissue",
                "inventory.view_inspectionphoto",
                "inventory.view_conditionreport",
                "inventory.view_conditionphoto",
            ),
        ),
        "HR/Admin": (
            "Human resources: employees, departments, calendar settings, employee documents, and staff attendance.",
            perms(
                "hrm.view_hrm",
                "hrm.manage_hr_settings",
                "hrm.view_employee",
                "hrm.add_employee",
                "hrm.change_employee",
                "hrm.delete_employee",
                "hrm.manage_employee",
                "hrm.change_employee_status",
                "hrm.view_employee_salary",
                "hrm.manage_department",
                "hrm.manage_employment_type",
                "hrm.assign_user",
                "hrm.export_employee",
                "accounts.view_employee_sensitive",
                "crm.view_document",
                "crm.add_document",
                "crm.change_document",
                "attendance.view_attendancerecord",
                "attendance.manage_attendance",
                "attendance.add_attendancerecord",
                "attendance.change_attendancerecord",
                "attendance.delete_attendancerecord",
            ),
        ),
        "Manager": (
            "Sees direct and indirect reports and departments they head. Can change employment status in that scope.",
            perms(
                "hrm.view_hrm",
                "hrm.view_employee",
                "hrm.change_employee_status",
            ),
        ),
        "Employee": (
            "Self-service access to the linked employee record only.",
            perms(
                "hrm.view_hrm",
            ),
        ),
    }
    has_dealer_role_field = any(
        f.name == "is_dealer_role" for f in RoleModel._meta.get_fields()
    )
    roles = {}
    for name, (description, permissions) in definitions.items():
        defaults = {"description": description}
        if name == "Super Admin":
            defaults["is_protected"] = True
        if has_dealer_role_field and "dealer" in name.lower():
            defaults["is_dealer_role"] = True
        role, _ = RoleModel.objects.get_or_create(name=name, defaults=defaults)
        # Never downgrade the protected flag once set; always upgrade legacy rows.
        if name == "Super Admin" and not role.is_protected:
            role.is_protected = True
            role.save(update_fields=["is_protected", "updated_at"])
        if has_dealer_role_field and "dealer" in name.lower() and not getattr(role, "is_dealer_role", False):
            role.is_dealer_role = True
            role.save(update_fields=["is_dealer_role", "updated_at"])
        role.permissions.set(permissions)
        roles[name] = role

    # Migration safety: every existing staff user becomes Super Admin so
    # nothing currently working loses access on deploy.
    super_admin = roles["Super Admin"]
    for user in UserModel.objects.filter(is_staff=True, is_active=True):
        profile, _ = UserProfileModel.objects.get_or_create(user=user)
        profile.roles.add(super_admin)
    return roles
