import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from common.models import AuditLog, log_audit_event
from common.signed_urls import private_media_url
from dealers.models import Dealer

from .models import (
    Role,
    get_user_profile,
    role_is_dealer_scoped,
    user_has_perm,
    user_is_super_admin,
)

User = get_user_model()


def mask_value(val: str, keep_last: int = 3) -> str:
    if not val:
        return ""
    val_str = str(val).strip()
    if len(val_str) <= keep_last:
        return "*" * len(val_str)
    return "*" * (len(val_str) - keep_last) + val_str[-keep_last:]


def mask_date(d) -> str:
    if not d:
        return ""
    parts = str(d).split("-")
    if len(parts) == 3:
        return f"****-**-{parts[2]}"
    return "****-**-**"


def _permission_label(perm):
    return f"{perm.content_type.app_label}.{perm.codename}"


class RoleSerializer(serializers.ModelSerializer):
    # Write: list of "app_label.codename" labels. Read: same labels (injected
    # in to_representation, since the M2M manager isn't a valid ListField source).
    permissions = serializers.ListField(
        child=serializers.CharField(), required=False, write_only=True
    )
    permission_names = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "is_dealer_role",
            "permissions",
            "permission_names",
            "user_count",
            "is_protected",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_protected", "created_at", "updated_at"]

    def get_permission_names(self, obj):
        return {_permission_label(p): p.name for p in obj.permissions.all()}

    def get_user_count(self, obj):
        return obj.profiles.count()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["permissions"] = [_permission_label(p) for p in instance.permissions.all()]
        return data

    def validate_permissions(self, value):
        resolved = []
        unknown = []
        for label in value:
            try:
                app_label, codename = label.split(".", 1)
            except ValueError:
                unknown.append(label)
                continue
            perm = Permission.objects.filter(
                content_type__app_label=app_label, codename=codename
            ).first()
            if perm is None:
                unknown.append(label)
            else:
                resolved.append(perm)
        if unknown:
            raise serializers.ValidationError(
                f"Unknown permission(s): {', '.join(unknown)}"
            )
        return resolved

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        # Reserve "Super Admin" (case-insensitive): only the protected system
        # role may carry it. Creating a second one is blocked here; renaming
        # the protected role away is blocked in update() below and in the view.
        if cleaned.lower() == "super admin":
            if self.instance is None:
                if Role.objects.filter(name__iexact="super admin").exists():
                    raise serializers.ValidationError('The name "Super Admin" is reserved.')
            else:
                is_protected = bool(getattr(self.instance, "is_protected", False)) or (
                    self.instance.name == "Super Admin"
                )
                if not is_protected:
                    raise serializers.ValidationError('The name "Super Admin" is reserved.')
        return cleaned

    def create(self, validated_data):
        perms = validated_data.pop("permissions", [])
        # is_protected is read-only via the API; never allow creating a
        # protected role directly.
        validated_data.pop("is_protected", None)
        role = Role.objects.create(**validated_data)
        if perms:
            role.permissions.set(perms)
        return role

    def update(self, instance, validated_data):
        perms = validated_data.pop("permissions", None)
        validated_data.pop("is_protected", None)
        is_protected = bool(getattr(instance, "is_protected", False)) or (
            instance.name == "Super Admin"
        )
        if is_protected and "name" in validated_data:
            if validated_data["name"].strip() != instance.name:
                raise serializers.ValidationError(
                    {"name": "The Super Admin role cannot be renamed."}
                )
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if perms is not None:
            instance.permissions.set(perms)
        return instance


MODULE_NAMES = {
    "inventory": "Inventory & Logistics",
    "servicing": "Servicing & Workshop",
    "crm": "CRM & Sales Pipeline",
    "leads": "Inbound Enquiries & Quotes",
    "vehicles": "Vehicle Catalog",
    "dealers": "Dealer Network",
    "events": "Events & Expos",
    "stories": "Blog & Customer Stories",
    "cms": "Website CMS",
    "attendance": "Staff Attendance",
    "accounts": "Users & Access Control",
    "hrm": "Human Resources",
}

SYSTEM_APPS = {"admin", "auth", "contenttypes", "sessions", "authtoken"}

ENTITY_NAMES = {
    "vehiclereceivechecklist": (
        "Vehicle Arrival Checklist",
        "China transporter delivery condition and defect inspection checklists",
    ),
    "vehiclereceivechecklistitem": (
        "Checklist Tool Kit Items",
        "China arrival tool kit bag items and missing parts records",
    ),
    "vehicleunit": (
        "Vehicle Units (Chassis/VIN)",
        "Physical vehicles in inventory, landed costs, and sales tracking",
    ),
    "importbatch": (
        "China Import Shipments",
        "Customs import consignments, bills of lading, and shipping batches",
    ),
    "vehiclemodel": (
        "Vehicle Models",
        "Catalog vehicle specifications and commercial models",
    ),
    "stockmovement": (
        "Stock Movements",
        "Warehouse allocations and vehicle transfer audit trails",
    ),
    "pditemplate": (
        "PDI Templates",
        "Pre-delivery inspection criteria and standards checklists",
    ),
    "pdichecklistitem": (
        "PDI Checklist Items",
        "Specific inspection points for pre-delivery checklists",
    ),
    "pdiinspection": (
        "PDI Inspections",
        "Pre-delivery inspection sign-offs and readiness approvals",
    ),
    "pdiresult": (
        "PDI Results",
        "Individual pass/fail entries for vehicle PDI checks",
    ),
    "pdisequence": (
        "PDI Numbering",
        "Automated numbering sequences for PDI certificates",
    ),
    "inspectionissue": (
        "Inspection Issues",
        "Logged issues and defect resolutions from inspections",
    ),
    "inspectionphoto": (
        "Inspection Photos",
        "General inspection photo attachments",
    ),
    "conditionreport": (
        "Condition Reports",
        "Comprehensive cosmetic and mechanical condition audit reports",
    ),
    "conditionphoto": (
        "Condition Photos",
        "Attached inspection photos of vehicle condition and damages",
    ),
    "conditionresult": (
        "Condition Checklist Results",
        "Specific condition checkpoints for vehicle audits",
    ),
    "servicerecord": (
        "Vehicle Repair Orders (VRO)",
        "Workshop service records, repair jobs, and entry/exit time logs",
    ),
    "servicerecordpart": (
        "Servicing Spare Parts",
        "Spare parts, labour items, and billed quantities on repair orders",
    ),
    "lead": (
        "Sales Leads",
        "Prospective buyers in the CRM sales pipeline",
    ),
    "customer": (
        "Customers",
        "Customer accounts, company records, and vehicle ownership history",
    ),
    "opportunity": (
        "Sales Opportunities",
        "Pipeline commercial deals, stages, and expected close values",
    ),
    "testdrive": (
        "Test Drives",
        "Customer test drive bookings, schedules, and feedback",
    ),
    "quotation": (
        "Sales Quotations",
        "Vehicle price quotations, pro-forma invoices, and tax calculations",
    ),
    "activity": (
        "CRM Activities",
        "Timeline calls, meetings, follow-ups, and customer touchpoints",
    ),
    "leadsource": (
        "Lead Sources",
        "Lead acquisition channels (e.g. Website, Walk-in, Expo)",
    ),
    "activitytype": (
        "Activity Types",
        "Categories for CRM activities (e.g. Call, Meeting, Email)",
    ),
    "bank": (
        "Banks",
        "Banks printed on quotations and managed in CRM settings",
    ),
    "bankbranch": (
        "Bank Branches",
        "Bank branches printed on quotations and managed in CRM settings",
    ),
    "enquiry": (
        "Website Inquiries & Quotes",
        "Inbound requests submitted via public website quote forms",
    ),
    "vehicle": (
        "Vehicle Catalog",
        "Public showcase vehicles, brochures, and specifications",
    ),
    "dealer": (
        "Dealerships",
        "Showrooms, regional dealer branches, and service centers",
    ),
    "event": (
        "Events & Expos",
        "Auto exhibitions, trade shows, and public marketing events",
    ),
    "interestlevel": (
        "Interest Levels",
        "Customer excitement tiers (Hot, Warm, Cold) for event visitors",
    ),
    "eventvisitor": (
        "Event Visitors",
        "Registered attendees and leads gathered during exhibitions",
    ),
    "story": (
        "Blog & Stories",
        "Articles, customer case studies, and corporate news updates",
    ),
    "cmspage": (
        "Website CMS Pages",
        "Public website editable content, hero banners, and copy",
    ),
    "attendancerecord": (
        "Attendance Records",
        "Staff daily check-in, check-out, and work hour logs",
    ),
    "role": (
        "User Roles",
        "Permission bundles assigned to staff members",
    ),
    "user": (
        "Staff Users",
        "User login accounts and profile information",
    ),
}

ACTION_MAP = {
    "view": ("View", "Can view and inspect"),
    "add": ("Create", "Can create and add new"),
    "change": ("Edit", "Can update, modify, or advance"),
    "delete": ("Delete", "Can permanently remove or delete"),
}


def get_permission_human_meta(perm):
    app = perm.content_type.app_label
    code = perm.codename
    is_system = app in SYSTEM_APPS

    module = MODULE_NAMES.get(app, app.replace("_", " ").title())

    # Special attendance custom permissions
    if code == "manage_attendance":
        return {
            "human_title": "Manage All Staff Attendance",
            "action": "Manage",
            "module_name": module,
            "description": "Can record attendance, correct times, export logs, and oversee all staff",
            "is_system": is_system,
        }
    if code == "view_own_attendance":
        return {
            "human_title": "View Own Attendance",
            "action": "View",
            "module_name": module,
            "description": "Can view personal attendance logs and check-in history only",
            "is_system": is_system,
        }

    # Match standard Django prefix: view_, add_, change_, delete_
    for prefix, (action_label, verb_desc) in ACTION_MAP.items():
        if code.startswith(f"{prefix}_"):
            entity_key = code[len(prefix) + 1 :]
            if entity_key in ENTITY_NAMES:
                entity_title, entity_desc = ENTITY_NAMES[entity_key]
                return {
                    "human_title": f"{action_label} {entity_title}",
                    "action": action_label,
                    "module_name": module,
                    "description": f"{verb_desc} {entity_desc}",
                    "is_system": is_system,
                }
            # Fallback for unmapped entity
            clean_entity = entity_key.replace("_", " ").title()
            return {
                "human_title": f"{action_label} {clean_entity}",
                "action": action_label,
                "module_name": module,
                "description": f"{verb_desc} {clean_entity}",
                "is_system": is_system,
            }

    # Generic fallback
    clean_name = perm.name or code.replace("_", " ").title()
    return {
        "human_title": clean_name,
        "action": "Manage",
        "module_name": module,
        "description": f"Access to {clean_name}",
        "is_system": is_system,
    }


class PermissionSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    app_label = serializers.SerializerMethodField()
    human_title = serializers.SerializerMethodField()
    action = serializers.SerializerMethodField()
    module_name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    is_system = serializers.SerializerMethodField()

    class Meta:
        model = Permission
        fields = [
            "id",
            "label",
            "name",
            "app_label",
            "codename",
            "human_title",
            "action",
            "module_name",
            "description",
            "is_system",
        ]

    def get_label(self, obj):
        return _permission_label(obj)

    def get_app_label(self, obj):
        return obj.content_type.app_label

    def get_human_title(self, obj):
        return get_permission_human_meta(obj)["human_title"]

    def get_action(self, obj):
        return get_permission_human_meta(obj)["action"]

    def get_module_name(self, obj):
        return get_permission_human_meta(obj)["module_name"]

    def get_description(self, obj):
        return get_permission_human_meta(obj)["description"]

    def get_is_system(self, obj):
        return get_permission_human_meta(obj)["is_system"]


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    # Disable auto UniqueValidator so our case-insensitive check controls the error message
    username = serializers.CharField(validators=[])
    # RBAC: role ids + home dealer, stored on the user's profile.
    roles = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), many=True, required=False
    )
    dealer = serializers.PrimaryKeyRelatedField(
        queryset=Dealer.objects.all(), required=False, allow_null=True
    )
    role_names = serializers.SerializerMethodField()
    dealer_name = serializers.SerializerMethodField()

    # Extended employee profile fields
    phone = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    pan_vat_number = serializers.CharField(required=False, allow_blank=True)
    citizenship_number = serializers.CharField(required=False, allow_blank=True)
    temporary_address = serializers.CharField(required=False, allow_blank=True)
    permanent_address = serializers.CharField(required=False, allow_blank=True)
    personal_email = serializers.EmailField(required=False, allow_blank=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True)
    join_date = serializers.DateField(required=False, allow_null=True)
    department = serializers.CharField(required=False, allow_blank=True)
    designation = serializers.CharField(required=False, allow_blank=True)
    employment_status = serializers.CharField(required=False, allow_blank=True)
    photo_url = serializers.CharField(required=False, allow_blank=True)
    can_view_sensitive = serializers.BooleanField(read_only=True)
    employee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "password",
            "roles",
            "dealer",
            "role_names",
            "dealer_name",
            "phone",
            "date_of_birth",
            "pan_vat_number",
            "citizenship_number",
            "temporary_address",
            "permanent_address",
            "personal_email",
            "emergency_contact_name",
            "emergency_contact_phone",
            "join_date",
            "department",
            "designation",
            "employment_status",
            "photo_url",
            "can_view_sensitive",
            "employee_id",
        ]
        read_only_fields = ["id", "is_staff", "is_superuser", "date_joined", "last_login", "can_view_sensitive"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Refresh the queryset per-instance so tests with a fresh DB work.
        self.fields["dealer"].queryset = Dealer.objects.all()

    def get_role_names(self, obj):
        profile = getattr(obj, "profile", None)
        if profile is None:
            return []
        return list(profile.roles.values_list("name", flat=True))

    def get_dealer_name(self, obj):
        profile = getattr(obj, "profile", None)
        if profile is None or profile.dealer_id is None:
            return ""
        return profile.dealer.name

    def to_representation(self, instance):
        data = super().to_representation(instance)
        profile = getattr(instance, "profile", None)
        data["roles"] = (
            list(profile.roles.values_list("id", flat=True)) if profile else []
        )
        data["dealer"] = profile.dealer_id if profile else None

        request = self.context.get("request")
        user = request.user if request and getattr(request, "user", None) and request.user.is_authenticated else None
        can_view_sensitive = bool(
            user and (
                user.is_superuser
                or user_is_super_admin(user)
                or user_has_perm(user, "accounts.view_employee_sensitive")
            )
        )
        data["can_view_sensitive"] = can_view_sensitive

        from hrm.people import linked_employee, person_snapshot

        data.update(person_snapshot(instance, user))
        profile = getattr(instance, "profile", None)
        linked = linked_employee(instance)
        if linked and linked.photo:
            data["photo_url"] = private_media_url(
                self.context.get("request"), f"/api/hrm/employees/{linked.id}/photo/"
            )
        elif profile:
            data["photo_url"] = private_media_url(self.context.get("request"), profile.resolved_photo_url())
            data["photo_external_url"] = profile.photo_url or ""
        else:
            data["photo_url"] = ""
            data["photo_external_url"] = ""
        if profile and "photo_external_url" not in data:
            data["photo_external_url"] = profile.photo_url or ""
        return data

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Username is required.")
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value):
        if value and value.strip():
            qs = User.objects.filter(email__iexact=value.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            pass
        return value.strip() if value else ""

    def validate_pan_vat_number(self, value):
        if not value:
            return ""
        val = str(value).strip()
        if "*" in val:
            return val
        clean = re.sub(r"[\s\-]", "", val)
        if not clean.isdigit() or len(clean) < 8 or len(clean) > 10:
            raise serializers.ValidationError("PAN/VAT must be an 8 to 10 digit number.")
        return clean

    def validate_photo_url(self, value):
        """Only external photo URLs are stored; echoing back a signed internal link keeps the current value."""
        val = (value or "").strip()
        if "/api/" in val:
            profile = getattr(self.instance, "profile", None) if self.instance else None
            return profile.photo_url if profile else ""
        return val

    def validate_password(self, value):
        if value:
            temp_user = self.instance or User(
                username=self.initial_data.get("username", ""),
                email=self.initial_data.get("email", ""),
            )
            validate_password(value, user=temp_user)
        return value

    def validate(self, attrs):
        # On create, password is required
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required."})

        # When a dealer role is assigned, a home dealer is strictly required.
        roles_val = attrs.get("roles")
        dealer_val = attrs.get("dealer", "___not_passed___")

        if roles_val is None and self.instance:
            profile = getattr(self.instance, "profile", None)
            roles_val = list(profile.roles.all()) if profile else []
        elif roles_val is None:
            roles_val = []

        if dealer_val == "___not_passed___" and self.instance:
            profile = getattr(self.instance, "profile", None)
            dealer_val = profile.dealer if profile else None
        elif dealer_val == "___not_passed___":
            dealer_val = None

        has_dealer_role = any(role_is_dealer_scoped(r) for r in roles_val)
        if has_dealer_role and not dealer_val:
            raise serializers.ValidationError(
                {"dealer": "A home dealership is required when assigning a dealer role."}
            )
        if self.instance is None and not attrs.get("employee_id"):
            raise serializers.ValidationError(
                {"employee_id": "Choose an employee. Add the person on the Employees page first."}
            )

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        roles = validated_data.pop("roles", None)
        dealer = validated_data.pop("dealer", None)
        employee_id = validated_data.pop("employee_id", None)
        profile_fields = self._pop_person_fields(validated_data)

        user = User(**validated_data)
        user.is_staff = True
        user.is_active = validated_data.get("is_active", True)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        profile = get_user_profile(user)
        if roles is not None:
            profile.roles.set(roles)
        if dealer is not None:
            profile.dealer = dealer
        photo_url = profile_fields.pop("photo_url", None)
        if photo_url is not None:
            profile.photo_url = photo_url
        profile.save()

        request = self.context.get("request")
        acting_user = request.user if request and getattr(request, "user", None) and request.user.is_authenticated else None
        from hrm.people import apply_user_person_fields

        # Link the payroll record before writing person fields, so this does
        # not create a second employee. Name/email come from HR — do not re-ask.
        if employee_id:
            from hrm.models import Employee

            self._assign_employee(user, employee_id)
            emp = Employee.objects.filter(pk=employee_id).first()
            if emp:
                parts = (emp.full_name or "").strip().split()
                user.first_name = parts[0] if parts else ""
                user.last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
                if not (user.email or "").strip() and emp.email:
                    user.email = emp.email
                user.save(update_fields=["first_name", "last_name", "email"])
                # Create only links a login; person fields already live on Employee.
                profile_fields = {}
        apply_user_person_fields(user, profile_fields, acting_user)

        for sf in ["pan_vat_number", "citizenship_number", "date_of_birth"]:
            val = profile_fields.get(sf)
            if val and not (isinstance(val, str) and "*" in val):
                log_audit_event(
                    instance=profile,
                    field_name=sf,
                    old_value="",
                    new_value=mask_value(str(val)),
                    changed_by=acting_user,
                    action=AuditLog.Action.CREATE,
                    summary=f"Set sensitive field {sf} for employee @{user.username}",
                )

        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        roles = validated_data.pop("roles", None)
        dealer = validated_data.pop("dealer", "___unset___")
        employee_id = validated_data.pop("employee_id", "___unset___")
        profile_fields = self._pop_person_fields(validated_data, only_present=True)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.is_staff = True
        if password:
            instance.set_password(password)
        instance.save()

        profile = get_user_profile(instance)
        if roles is not None:
            profile.roles.set(roles)
        if dealer != "___unset___":
            profile.dealer = dealer

        request = self.context.get("request")
        acting_user = request.user if request and getattr(request, "user", None) and request.user.is_authenticated else None

        photo_url = profile_fields.pop("photo_url", None)
        if photo_url is not None:
            profile.photo_url = photo_url
            profile.save(update_fields=["photo_url"])

        sensitive_fields = {"pan_vat_number", "citizenship_number", "date_of_birth"}
        from hrm.people import apply_user_person_fields, linked_employee

        before = linked_employee(instance)
        before_values = {}
        if before:
            before_values = {
                "pan_vat_number": before.pan_vat_number,
                "citizenship_number": before.citizenship_number,
                "date_of_birth": before.date_of_birth,
            }
        else:
            before_values = {
                "pan_vat_number": profile.pan_vat_number,
                "citizenship_number": profile.citizenship_number,
                "date_of_birth": profile.date_of_birth,
            }
        apply_user_person_fields(instance, profile_fields, acting_user)
        for field in sensitive_fields:
            if field not in profile_fields:
                continue
            value = profile_fields[field]
            if value is None or (isinstance(value, str) and ("*" in value or not str(value).strip())):
                continue
            old_val = before_values.get(field)
            if str(old_val or "") != str(value or ""):
                log_audit_event(
                    instance=profile,
                    field_name=field,
                    old_value=mask_value(str(old_val)) if old_val else "",
                    new_value=mask_value(str(value)),
                    changed_by=acting_user,
                    action=AuditLog.Action.UPDATE,
                    summary=f"Updated sensitive field {field} for employee @{instance.username}",
                )
        if employee_id != "___unset___":
            self._assign_employee(instance, employee_id)
        if dealer != "___unset___":
            profile.save()
        return instance

    def _pop_person_fields(self, validated_data, only_present=False):
        names = [
            "phone",
            "temporary_address",
            "permanent_address",
            "personal_email",
            "emergency_contact_name",
            "emergency_contact_phone",
            "join_date",
            "department",
            "designation",
            "employment_status",
            "photo_url",
            "date_of_birth",
            "pan_vat_number",
            "citizenship_number",
        ]
        fields = {}
        for name in names:
            if only_present:
                if name in validated_data:
                    fields[name] = validated_data.pop(name)
            else:
                fields[name] = validated_data.pop(name, "" if name not in {"join_date", "date_of_birth"} else None)
        return fields

    def _assign_employee(self, user, employee_id):
        from hrm.models import Employee

        if employee_id in (None, ""):
            Employee.objects.filter(user=user).update(user=None)
            return
        employee = Employee.objects.filter(pk=employee_id).first()
        if employee is None:
            raise serializers.ValidationError({"employee_id": "That employee record was not found."})
        if employee.user_id and employee.user_id != user.id:
            raise serializers.ValidationError(
                {"employee_id": f"{employee.employee_code} is already linked to {employee.user.username}."}
            )
        other = Employee.objects.filter(user=user).exclude(pk=employee.pk).first()
        if other:
            raise serializers.ValidationError(
                {"employee_id": f"This account is already linked to {other.employee_code} {other.full_name}."}
            )
        employee.user = user
        employee.save(update_fields=["user"])
