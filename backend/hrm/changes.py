"""Permanent employee field history. These rows are not audit-log entries."""

from __future__ import annotations

from hrm.models import Employee, EmployeeChangeLog, EmployeeStatusHistory

TRACKED = (
    "basic_salary",
    "department",
    "designation",
    "reports_to",
    "employment_type",
    "employment_status",
    "user",
    "pan_vat_number",
    "citizenship_number",
)


def _display(field: str, value) -> str:
    if value is None or value == "":
        return ""
    if field == "department":
        return getattr(value, "name", str(value))
    if field in {"reports_to", "user"}:
        if hasattr(value, "employee_code"):
            return f"{value.employee_code} {value.full_name}"
        if hasattr(value, "username"):
            return value.username
        return str(value)
    if field == "employment_type":
        return getattr(value, "name", str(value))
    if field == "basic_salary":
        return str(value)
    return str(value)


def _current(employee: Employee, field: str):
    if field == "department":
        return employee.department
    if field == "reports_to":
        return employee.reports_to
    if field == "employment_type":
        return employee.employment_type
    if field == "user":
        return employee.user
    return getattr(employee, field)


def record_changes(employee: Employee, before: dict, actor, *, created: bool = False) -> None:
    user = actor if getattr(actor, "is_authenticated", False) else None
    if created:
        EmployeeChangeLog.objects.create(
            employee=employee,
            field_name="created",
            old_value="",
            new_value=employee.employee_code,
            changed_by=user,
        )
        return
    for field in TRACKED:
        if field not in before:
            continue
        old = before[field]
        new = _display(field, _current(employee, field))
        if old != new:
            EmployeeChangeLog.objects.create(
                employee=employee,
                field_name=field,
                old_value=old,
                new_value=new,
                changed_by=user,
            )


def snapshot(employee: Employee) -> dict:
    return {field: _display(field, _current(employee, field)) for field in TRACKED}


def update_employee(employee: Employee, changes: dict, actor) -> Employee:
    before = snapshot(employee)
    for key, value in changes.items():
        setattr(employee, key, value)
    employee.updated_by = actor if getattr(actor, "is_authenticated", False) else employee.updated_by
    employee.full_clean()
    employee.save()
    record_changes(employee, before, actor)
    return employee


def change_status(employee: Employee, *, status: str, effective_date, reason: str, actor, deactivate_user=None):
    if status not in Employee.Status.values:
        from django.core.exceptions import ValidationError

        raise ValidationError({"employment_status": "Status must be Active, Resigned, Terminated, or Inactive."})
    leaving = status in {Employee.Status.RESIGNED, Employee.Status.TERMINATED, Employee.Status.INACTIVE}
    if leaving and employee.user_id and deactivate_user is None:
        from django.core.exceptions import ValidationError

        raise ValidationError(
            {
                "deactivate_user": "Choose whether to deactivate the linked user account. It is not changed unless you say so."
            }
        )
    before = snapshot(employee)
    employee.employment_status = status
    employee.status_effective_date = effective_date
    employee.status_reason = reason or ""
    employee.updated_by = actor if getattr(actor, "is_authenticated", False) else None
    employee.save()
    EmployeeStatusHistory.objects.create(
        employee=employee,
        status=status,
        effective_date=effective_date,
        reason=reason or "",
        changed_by=employee.updated_by,
    )
    record_changes(employee, before, actor)
    if leaving and employee.user_id and deactivate_user:
        employee.user.is_active = False
        employee.user.save(update_fields=["is_active"])
    return employee
