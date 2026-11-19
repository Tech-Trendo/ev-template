"""Who can see which employees.

HR/Admin (manage_employee) and Super Admin see everyone.
A user with view_employee sees their direct and indirect reports plus
departments they head.
Anyone else with a linked employee sees only that record.
A user with no linked employee and no HR permission sees nothing.
"""

from __future__ import annotations

from accounts.models import user_has_perm, user_is_super_admin
from hrm.models import Department, Employee


def can_see_all_employees(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False) or not user.is_active:
        return False
    if user.is_superuser or user_is_super_admin(user):
        return True
    return user_has_perm(user, "hrm.manage_employee")


def can_view_salary(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user_is_super_admin(user):
        return True
    return user_has_perm(user, "hrm.view_employee_salary")


def can_view_sensitive(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if user.is_superuser or user_is_super_admin(user):
        return True
    return user_has_perm(user, "accounts.view_employee_sensitive")


def _descendant_ids(root_id: int) -> set[int]:
    found: set[int] = set()
    frontier = [root_id]
    while frontier:
        children = list(
            Employee.objects.filter(reports_to_id__in=frontier).values_list("id", flat=True)
        )
        frontier = [child for child in children if child not in found and child != root_id]
        found.update(frontier)
    return found


def _headed_department_ids(employee_id: int) -> set[int]:
    roots = list(Department.objects.filter(head_id=employee_id).values_list("id", flat=True))
    found = set(roots)
    frontier = list(roots)
    while frontier:
        children = list(Department.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
        frontier = [child for child in children if child not in found]
        found.update(frontier)
    return found


def employee_queryset_for(user):
    base = Employee.objects.select_related(
        "department", "employment_type", "reports_to", "dealer", "user"
    )
    if not user or not getattr(user, "is_authenticated", False) or not user.is_active:
        return base.none()
    if can_see_all_employees(user):
        return base
    linked = Employee.objects.filter(user=user).only("id").first()
    if user_has_perm(user, "hrm.view_employee") and linked:
        ids = {linked.id} | _descendant_ids(linked.id)
        dept_ids = _headed_department_ids(linked.id)
        if dept_ids:
            ids.update(Employee.objects.filter(department_id__in=dept_ids).values_list("id", flat=True))
        return base.filter(id__in=ids)
    if user_has_perm(user, "hrm.view_employee") and not linked:
        return base.none()
    if linked:
        return base.filter(pk=linked.pk)
    return base.none()
