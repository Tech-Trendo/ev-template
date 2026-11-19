"""Read and write the person fields that now live on Employee.

UserProfile columns stay in the database and are deprecated. API reads use
the linked Employee when one exists, and fall back to UserProfile only when
a login has not been linked yet.
"""

from __future__ import annotations

from django.utils.dateparse import parse_date

from accounts.models import get_user_profile
from hrm.models import Department, Employee, EmploymentType
from hrm.scope import can_view_sensitive


def linked_employee(user):
    if not user or not getattr(user, "pk", None):
        return None
    return (
        Employee.objects.select_related("department", "employment_type")
        .filter(user_id=user.pk)
        .first()
    )


def _department_by_name(name: str, actor=None) -> Department | None:
    cleaned = (name or "").strip()
    if not cleaned:
        return None
    existing = Department.objects.filter(name=cleaned).first()
    if existing:
        return existing
    code = "".join(ch for ch in cleaned.upper() if ch.isalnum())[:24] or "DEPT"
    base = code
    n = 2
    while Department.objects.filter(code=code).exists():
        code = f"{base[:20]}-{n}"
        n += 1
    return Department.objects.create(name=cleaned, code=code, created_by=actor, updated_by=actor)


def person_snapshot(user, viewer) -> dict:
    """Fields the Users screen and My Profile display."""
    employee = linked_employee(user)
    profile = getattr(user, "profile", None) or get_user_profile(user)
    sensitive = can_view_sensitive(viewer)
    from accounts.serializers import mask_date, mask_value
    if employee:
        department = employee.department.name if employee.department_id else ""
        dob = employee.date_of_birth
        pan = employee.pan_vat_number
        citizenship = employee.citizenship_number
        phone = employee.phone
        payload = {
            "phone": phone or (profile.dealer.phone if profile.dealer_id else ""),
            "temporary_address": employee.temporary_address,
            "permanent_address": employee.permanent_address,
            "personal_email": employee.email,
            "emergency_contact_name": employee.emergency_contact_name,
            "emergency_contact_phone": employee.emergency_contact_phone,
            "join_date": employee.joining_date.isoformat() if employee.joining_date else None,
            "department": department,
            "designation": employee.designation,
            "employment_status": employee.employment_status,
            "employee_id": employee.id,
            "employee_code": employee.employee_code,
            "employee_name": employee.full_name,
        }
    else:
        dob = profile.date_of_birth
        pan = profile.pan_vat_number
        citizenship = profile.citizenship_number
        payload = {
            "phone": profile.phone or (profile.dealer.phone if profile.dealer_id else ""),
            "temporary_address": profile.temporary_address or "",
            "permanent_address": profile.permanent_address or "",
            "personal_email": profile.personal_email or "",
            "emergency_contact_name": profile.emergency_contact_name or "",
            "emergency_contact_phone": profile.emergency_contact_phone or "",
            "join_date": profile.join_date.isoformat() if profile.join_date else None,
            "department": profile.department or "",
            "designation": profile.designation or "",
            "employment_status": profile.employment_status or "active",
            "employee_id": None,
            "employee_code": "",
            "employee_name": "",
        }
    if sensitive:
        payload["date_of_birth"] = dob.isoformat() if dob else None
        payload["pan_vat_number"] = pan or ""
        payload["citizenship_number"] = citizenship or ""
    else:
        payload["date_of_birth"] = mask_date(dob) if dob else None
        payload["pan_vat_number"] = mask_value(pan) if pan else ""
        payload["citizenship_number"] = mask_value(citizenship) if citizenship else ""
    return payload


def _masked(value) -> bool:
    return isinstance(value, str) and "*" in value


def apply_user_person_fields(user, fields: dict, actor) -> Employee | None:
    """Write person fields onto the linked Employee, creating one if needed.

    Masked sensitive values are ignored. Deprecated UserProfile columns are
    not updated.
    """
    if not fields:
        return linked_employee(user)
    meaningful = {}
    for key, value in fields.items():
        if key in {"pan_vat_number", "citizenship_number", "date_of_birth"} and (
            value in (None, "") or _masked(value)
        ):
            continue
        if value in (None, ""):
            continue
        meaningful[key] = value
    employee = linked_employee(user)
    if not meaningful:
        return employee
    if employee is None:
        profile = get_user_profile(user)
        full_name = (user.get_full_name() or user.username).strip()
        employee = Employee(
            full_name=full_name or user.username,
            phone=profile.phone or "",
            email=profile.personal_email or "",
            temporary_address=profile.temporary_address or "",
            permanent_address=profile.permanent_address or "",
            pan_vat_number=profile.pan_vat_number or "",
            citizenship_number=profile.citizenship_number or "",
            designation=profile.designation or "",
            joining_date=profile.join_date,
            date_of_birth=profile.date_of_birth,
            emergency_contact_name=profile.emergency_contact_name or "",
            emergency_contact_phone=profile.emergency_contact_phone or "",
            employment_status=_status_from_profile(profile.employment_status),
            user=user,
            dealer=profile.dealer,
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )
        if profile.department:
            employee.department = _department_by_name(profile.department, actor)
        if profile.employment_status == "probation":
            employee.employment_type = EmploymentType.objects.filter(code="PROBATION").first()
        if profile.photo:
            employee.photo.name = profile.photo.name
        employee.save()
        from hrm.changes import record_changes

        record_changes(employee, {}, actor, created=True)
    from hrm.changes import update_employee

    mapped = _map_user_fields(meaningful, actor)
    if "first_name" in fields or "last_name" in fields:
        mapped["full_name"] = (user.get_full_name() or employee.full_name).strip()
    update_employee(employee, mapped, actor)
    return employee


def _status_from_profile(raw: str) -> str:
    if raw in {"resigned", "terminated", "inactive"}:
        return raw
    return Employee.Status.ACTIVE


def _map_user_fields(fields: dict, actor) -> dict:
    mapped = {}
    rename = {
        "personal_email": "email",
        "join_date": "joining_date",
    }
    for key, value in fields.items():
        target = rename.get(key, key)
        if target == "department":
            mapped["department"] = _department_by_name(value, actor)
        elif target == "date_of_birth" and isinstance(value, str):
            mapped["date_of_birth"] = parse_date(value)
        elif target == "employment_status":
            if value == "probation":
                mapped["employment_status"] = Employee.Status.ACTIVE
                mapped["employment_type"] = EmploymentType.objects.filter(code="PROBATION").first()
            elif value in Employee.Status.values:
                mapped["employment_status"] = value
        elif target in {
            "phone",
            "email",
            "temporary_address",
            "permanent_address",
            "designation",
            "emergency_contact_name",
            "emergency_contact_phone",
            "pan_vat_number",
            "citizenship_number",
            "joining_date",
            "date_of_birth",
        }:
            mapped[target] = value
    return mapped
