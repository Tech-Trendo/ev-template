"""HR employee, department, and employment-type API."""

from __future__ import annotations

import csv
import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role, get_user_profile, user_is_super_admin
from accounts.permissions import HasRolePermission
from accounts.serializers import mask_date, mask_value
from common.models import record_print_event
from common.signed_urls import private_media_url
from hrm.changes import change_status, snapshot, update_employee
from hrm.models import Department, Employee, EmployeeChangeLog, EmployeeStatusHistory, EmploymentType
from hrm.scope import can_view_salary, can_view_sensitive, employee_queryset_for

User = get_user_model()

SENSITIVE_LOG_FIELDS = {"pan_vat_number", "citizenship_number", "basic_salary"}


def _actor(request):
    user = getattr(request, "user", None)
    return user if user and user.is_authenticated else None


def _error(exc: Exception) -> ValidationError:
    if isinstance(exc, ValidationError):
        return exc
    detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
    return ValidationError(detail)


def _employee_payload(employee: Employee, request) -> dict:
    salary_ok = can_view_salary(request.user)
    sensitive_ok = can_view_sensitive(request.user)
    photo = ""
    if employee.photo:
        photo = private_media_url(request, f"/api/hrm/employees/{employee.id}/photo/")
    return {
        "id": employee.id,
        "employee_code": employee.employee_code,
        "full_name": employee.full_name,
        "photo_url": photo,
        "date_of_birth": (
            employee.date_of_birth.isoformat()
            if sensitive_ok and employee.date_of_birth
            else (mask_date(employee.date_of_birth) if employee.date_of_birth else None)
        ),
        "phone": employee.phone,
        "email": employee.email,
        "temporary_address": employee.temporary_address,
        "permanent_address": employee.permanent_address,
        "pan_vat_number": (
            employee.pan_vat_number
            if sensitive_ok
            else (mask_value(employee.pan_vat_number) if employee.pan_vat_number else "")
        ),
        "citizenship_number": (
            employee.citizenship_number
            if sensitive_ok
            else (mask_value(employee.citizenship_number) if employee.citizenship_number else "")
        ),
        "designation": employee.designation,
        "department": employee.department_id,
        "department_name": employee.department.name if employee.department_id else "",
        "reports_to": employee.reports_to_id,
        "reports_to_name": (
            f"{employee.reports_to.employee_code} {employee.reports_to.full_name}" if employee.reports_to_id else ""
        ),
        "employment_type": employee.employment_type_id,
        "employment_type_name": employee.employment_type.name if employee.employment_type_id else "",
        "joining_date": employee.joining_date.isoformat() if employee.joining_date else None,
        "probation_end_date": employee.probation_end_date.isoformat() if employee.probation_end_date else None,
        "basic_salary": str(employee.basic_salary) if salary_ok and employee.basic_salary is not None else None,
        "employment_status": employee.employment_status,
        "status_effective_date": employee.status_effective_date.isoformat() if employee.status_effective_date else None,
        "status_reason": employee.status_reason,
        "emergency_contact_name": employee.emergency_contact_name,
        "emergency_contact_phone": employee.emergency_contact_phone,
        "notes": employee.notes,
        "dealer": employee.dealer_id,
        "dealer_name": employee.dealer.name if employee.dealer_id else "",
        "user": employee.user_id,
        "username": employee.user.username if employee.user_id else "",
        "user_is_active": employee.user.is_active if employee.user_id else None,
    }


def _apply(employee: Employee, data, request) -> Employee:
    changes = {}
    mapping = {
        "full_name": "full_name",
        "phone": "phone",
        "email": "email",
        "temporary_address": "temporary_address",
        "permanent_address": "permanent_address",
        "designation": "designation",
        "emergency_contact_name": "emergency_contact_name",
        "emergency_contact_phone": "emergency_contact_phone",
        "notes": "notes",
        "status_reason": "status_reason",
    }
    for src, dest in mapping.items():
        if src in data:
            changes[dest] = data.get(src) or ""
    for src, dest in (
        ("department", "department_id"),
        ("reports_to", "reports_to_id"),
        ("employment_type", "employment_type_id"),
        ("dealer", "dealer_id"),
    ):
        if src in data:
            raw = data.get(src)
            changes[dest] = int(raw) if raw not in (None, "", "null") else None
    for src in ("joining_date", "probation_end_date", "date_of_birth", "status_effective_date"):
        if src in data:
            raw = data.get(src)
            if isinstance(raw, str) and "*" in raw:
                continue
            changes[src] = parse_date(raw) if isinstance(raw, str) and raw else (raw or None)
    if "pan_vat_number" in data and "*" not in str(data.get("pan_vat_number") or ""):
        changes["pan_vat_number"] = str(data.get("pan_vat_number") or "").strip()
    if "citizenship_number" in data and "*" not in str(data.get("citizenship_number") or ""):
        changes["citizenship_number"] = str(data.get("citizenship_number") or "").strip()
    if "basic_salary" in data and can_view_salary(request.user):
        raw = data.get("basic_salary")
        changes["basic_salary"] = None if raw in (None, "") else Decimal(str(raw))
    if "employment_status" in data:
        changes["employment_status"] = data.get("employment_status") or Employee.Status.ACTIVE
    if request.FILES.get("photo"):
        changes["photo"] = request.FILES["photo"]
    try:
        return update_employee(employee, changes, _actor(request))
    except (DjangoValidationError, ValidationError, ValueError, TypeError) as exc:
        raise _error(exc)


class DepartmentViewSet(viewsets.ModelViewSet):
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["hrm.view_employee", "hrm.manage_department"],
        "retrieve": ["hrm.view_employee", "hrm.manage_department"],
        "create": ["hrm.manage_department"],
        "update": ["hrm.manage_department"],
        "partial_update": ["hrm.manage_department"],
        "destroy": ["hrm.manage_department"],
    }
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Department.objects.select_related("parent", "head").annotate(employee_count=Count("employees"))

    def list(self, request, *args, **kwargs):
        return Response([self._row(row) for row in self.get_queryset()])

    def retrieve(self, request, *args, **kwargs):
        return Response(self._row(self.get_object()))

    def create(self, request, *args, **kwargs):
        row = Department(created_by=_actor(request), updated_by=_actor(request))
        self._fill(row, request.data)
        try:
            row.full_clean()
            row.save()
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(self._row(self.get_queryset().get(pk=row.pk)), status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        row = self.get_object()
        row.updated_by = _actor(request)
        self._fill(row, request.data)
        try:
            row.full_clean()
            row.save()
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(self._row(self.get_queryset().get(pk=row.pk)))

    def _fill(self, row, data):
        if "name" in data:
            row.name = str(data.get("name") or "").strip()
        if "code" in data:
            row.code = str(data.get("code") or "").strip().upper()
        if "is_active" in data:
            row.is_active = bool(data.get("is_active"))
        if "parent" in data:
            raw = data.get("parent")
            row.parent_id = int(raw) if raw not in (None, "", "null") else None
        if "head" in data:
            raw = data.get("head")
            row.head_id = int(raw) if raw not in (None, "", "null") else None

    def _row(self, row):
        return {
            "id": row.id,
            "name": row.name,
            "code": row.code,
            "parent": row.parent_id,
            "parent_name": row.parent.name if row.parent_id else "",
            "head": row.head_id,
            "head_name": f"{row.head.employee_code} {row.head.full_name}" if row.head_id else "",
            "is_active": row.is_active,
            "employee_count": getattr(row, "employee_count", row.employees.count()),
        }


class EmploymentTypeViewSet(viewsets.ModelViewSet):
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["hrm.view_employee", "hrm.manage_employment_type"],
        "retrieve": ["hrm.view_employee", "hrm.manage_employment_type"],
        "create": ["hrm.manage_employment_type"],
        "update": ["hrm.manage_employment_type"],
        "partial_update": ["hrm.manage_employment_type"],
        "destroy": ["hrm.manage_employment_type"],
    }
    queryset = EmploymentType.objects.all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def list(self, request, *args, **kwargs):
        return Response([self._row(row) for row in self.get_queryset()])

    def retrieve(self, request, *args, **kwargs):
        return Response(self._row(self.get_object()))

    def create(self, request, *args, **kwargs):
        row = EmploymentType(
            name=str(request.data.get("name") or "").strip(),
            code=str(request.data.get("code") or "").strip().upper(),
            is_active=bool(request.data.get("is_active", True)),
            sort_order=int(request.data.get("sort_order") or 0),
        )
        try:
            row.full_clean()
            row.save()
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(self._row(row), status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        row = self.get_object()
        if "name" in request.data:
            row.name = str(request.data.get("name") or "").strip()
        if "code" in request.data:
            row.code = str(request.data.get("code") or "").strip().upper()
        if "is_active" in request.data:
            row.is_active = bool(request.data.get("is_active"))
        if "sort_order" in request.data:
            row.sort_order = int(request.data.get("sort_order") or 0)
        try:
            row.full_clean()
            row.save()
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(self._row(row))

    def _row(self, row):
        return {
            "id": row.id,
            "name": row.name,
            "code": row.code,
            "is_active": row.is_active,
            "sort_order": row.sort_order,
        }


class EmployeeViewSet(viewsets.ViewSet):
    permission_classes = [HasRolePermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    perm_map = {
        "list": ["hrm.view_employee"],
        "retrieve": ["hrm.view_employee"],
        "create": ["hrm.manage_employee"],
        "partial_update": ["hrm.manage_employee"],
        "status": ["hrm.change_employee_status"],
        "activity": ["hrm.view_employee"],
        "account": ["hrm.assign_user"],
        "export_csv": ["hrm.export_employee"],
        "photo": ["hrm.view_employee"],
    }

    def get_queryset(self):
        qs = employee_queryset_for(self.request.user)
        params = self.request.query_params
        search = (params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(employee_code__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(department__name__icontains=search)
                | Q(designation__icontains=search)
            )
        if params.get("department"):
            qs = qs.filter(department_id=params["department"])
        if params.get("employment_status"):
            qs = qs.filter(employment_status=params["employment_status"])
        if params.get("employment_type"):
            qs = qs.filter(employment_type_id=params["employment_type"])
        if params.get("reports_to"):
            qs = qs.filter(reports_to_id=params["reports_to"])
        if params.get("dealer"):
            qs = qs.filter(dealer_id=params["dealer"])
        return qs

    def list(self, request):
        queryset = self.get_queryset()
        ordering = self._ordering(request)
        queryset = queryset.order_by(*ordering)
        page = request.query_params.get("page")
        page_size = request.query_params.get("page_size") or request.query_params.get("pageSize")
        # Opt-in pagination so pickers/managers can still load the full directory.
        if page is None and page_size is None:
            return Response([_employee_payload(row, request) for row in queryset])

        try:
            page = int(page) if page is not None else 1
            page_size = int(page_size) if page_size is not None else 10
        except (TypeError, ValueError):
            page, page_size = 1, 10
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        total = queryset.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, total_pages)
        start = (page - 1) * page_size
        rows = [_employee_payload(row, request) for row in queryset[start : start + page_size]]
        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": rows,
            }
        )

    def _ordering(self, request):
        allowed = {
            "employee_code": "employee_code",
            "full_name": "full_name",
            "department_name": "department__name",
            "employment_type_name": "employment_type__name",
            "phone": "phone",
            "employment_status": "employment_status",
        }
        raw = (request.query_params.get("ordering") or request.query_params.get("sort") or "").strip()
        if not raw:
            return ("employee_code",)
        descending = raw.startswith("-")
        key = raw[1:] if descending else raw
        field = allowed.get(key)
        if not field:
            return ("employee_code",)
        return (f"-{field}" if descending else field, "employee_code")

    def retrieve(self, request, pk=None):
        return Response(_employee_payload(self._get(pk), request))

    def create(self, request):
        employee = Employee(
            full_name=str(request.data.get("full_name") or "").strip(),
            employment_status=request.data.get("employment_status") or Employee.Status.ACTIVE,
            created_by=_actor(request),
        )
        if not employee.full_name:
            raise ValidationError({"full_name": "Full name is required."})
        employee.save()
        employee = _apply(employee, request.data, request)
        return Response(_employee_payload(employee, request), status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        employee = _apply(self._get(pk), request.data, request)
        return Response(_employee_payload(employee, request))

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        employee = self._get(pk)
        raw_date = request.data.get("effective_date")
        effective = parse_date(raw_date) if isinstance(raw_date, str) else raw_date
        if not effective:
            raise ValidationError({"effective_date": "An effective date is required."})
        deactivate = request.data.get("deactivate_user", None)
        if isinstance(deactivate, str):
            deactivate = deactivate.lower() in ("true", "1", "yes")
        try:
            change_status(
                employee,
                status=request.data.get("employment_status") or request.data.get("status"),
                effective_date=effective,
                reason=str(request.data.get("reason") or ""),
                actor=_actor(request),
                deactivate_user=deactivate,
            )
        except DjangoValidationError as exc:
            raise _error(exc)
        employee.refresh_from_db()
        return Response(_employee_payload(employee, request))

    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        employee = self._get(pk)
        sensitive_ok = can_view_sensitive(request.user)
        salary_ok = can_view_salary(request.user)
        changes = []
        for row in employee.change_log.all()[:200]:
            old, new = row.old_value, row.new_value
            if row.field_name in {"pan_vat_number", "citizenship_number"} and not sensitive_ok:
                old, new = mask_value(old), mask_value(new)
            if row.field_name == "basic_salary" and not salary_ok:
                old, new = ("****" if old else ""), ("****" if new else "")
            changes.append(
                {
                    "id": row.id,
                    "field_name": row.field_name,
                    "old_value": old,
                    "new_value": new,
                    "changed_by": row.changed_by.get_username() if row.changed_by_id else "",
                    "changed_at": row.changed_at.isoformat(),
                }
            )
        history = [
            {
                "id": row.id,
                "status": row.status,
                "effective_date": row.effective_date.isoformat(),
                "reason": row.reason,
                "changed_by": row.changed_by.get_username() if row.changed_by_id else "",
                "changed_at": row.changed_at.isoformat(),
            }
            for row in employee.status_history.all()[:200]
        ]
        return Response({"changes": changes, "status_history": history})

    @action(detail=True, methods=["post"])
    def account(self, request, pk=None):
        employee = self._get(pk)
        action_name = str(request.data.get("action") or "").strip()
        try:
            if action_name == "link":
                self._link(employee, request)
            elif action_name == "unlink":
                self._unlink(employee, request)
            elif action_name == "create":
                self._create_user(employee, request)
            elif action_name == "activate":
                self._set_active(employee, request, True)
            elif action_name == "deactivate":
                self._set_active(employee, request, False)
            else:
                raise ValidationError({"action": "Action must be create, link, unlink, activate, or deactivate."})
        except DjangoValidationError as exc:
            raise _error(exc)
        employee.refresh_from_db()
        return Response(_employee_payload(employee, request))

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        salary_ok = can_view_salary(request.user)
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="employees.csv"'
        writer = csv.writer(response)
        header = [
            "Employee ID",
            "Full name",
            "Phone",
            "Email",
            "Department",
            "Position",
            "Employment type",
            "Status",
            "Reports to",
            "Dealer",
            "Joining date",
        ]
        if salary_ok:
            header.append("Basic salary")
        writer.writerow(header)
        for employee in self.get_queryset().order_by("employee_code"):
            row = [
                employee.employee_code,
                employee.full_name,
                employee.phone,
                employee.email,
                employee.department.name if employee.department_id else "",
                employee.designation,
                employee.employment_type.name if employee.employment_type_id else "",
                employee.get_employment_status_display(),
                employee.reports_to.full_name if employee.reports_to_id else "",
                employee.dealer.name if employee.dealer_id else "",
                employee.joining_date.isoformat() if employee.joining_date else "",
            ]
            if salary_ok:
                row.append("" if employee.basic_salary is None else str(employee.basic_salary))
            writer.writerow(row)
        record_print_event(
            user=request.user,
            document_type="EMPLOYEE_DIRECTORY",
            title="Employee directory CSV",
        )
        return response

    @action(detail=True, methods=["get"], url_path="photo", permission_classes=[IsAuthenticated])
    def photo(self, request, pk=None):
        employee = employee_queryset_for(request.user).filter(pk=pk).first()
        if employee is None:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if not employee.photo:
            raise Http404("No photo uploaded.")
        from django.http import FileResponse
        import mimetypes
        import os

        filename = os.path.basename(employee.photo.name)
        content_type, _ = mimetypes.guess_type(filename)
        response = FileResponse(employee.photo.open("rb"), content_type=content_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

    def _get(self, pk) -> Employee:
        employee = self.get_queryset().filter(pk=pk).first()
        if employee is None:
            raise Http404("Employee not found.")
        return employee

    def _link(self, employee, request):
        user_id = request.data.get("user_id")
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise ValidationError({"user_id": "Choose a user account."})
        other = Employee.objects.filter(user=user).exclude(pk=employee.pk).first()
        if other:
            raise ValidationError(
                {"user_id": f"{user.username} is already linked to {other.employee_code} {other.full_name}."}
            )
        if employee.user_id and employee.user_id != user.id:
            raise ValidationError(
                {"user_id": f"This employee is already linked to {employee.user.username}. Unlink that account first."}
            )
        before = snapshot(employee)
        employee.user = user
        employee.save(update_fields=["user"])
        from hrm.changes import record_changes

        record_changes(employee, before, _actor(request))

    def _unlink(self, employee, request):
        before = snapshot(employee)
        employee.user = None
        employee.save(update_fields=["user"])
        from hrm.changes import record_changes

        record_changes(employee, before, _actor(request))

    def _set_active(self, employee, request, active: bool):
        if not employee.user_id:
            raise ValidationError({"user": "This employee has no user account."})
        employee.user.is_active = active
        employee.user.save(update_fields=["is_active"])
        EmployeeChangeLog.objects.create(
            employee=employee,
            field_name="user",
            old_value=employee.user.username,
            new_value=f"{employee.user.username} {'active' if active else 'inactive'}",
            changed_by=_actor(request),
        )

    def _create_user(self, employee, request):
        if employee.user_id:
            raise ValidationError({"user": "This employee already has a user account. Unlink it before creating another."})
        username = str(request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if not username or not password:
            raise ValidationError({"username": "Username and password are required."})
        if User.objects.filter(username__iexact=username).exists():
            raise ValidationError({"username": "A user with this username already exists."})
        user = User.objects.create_user(username=username, email=employee.email or "", password=password)
        user.first_name = employee.full_name
        user.is_staff = True
        user.is_active = True
        user.save()
        profile = get_user_profile(user)
        role_ids = request.data.get("role_ids") or []
        if role_ids:
            profile.roles.set(Role.objects.filter(id__in=role_ids))
        if employee.dealer_id:
            profile.dealer = employee.dealer
            profile.save(update_fields=["dealer"])
        before = snapshot(employee)
        employee.user = user
        employee.save(update_fields=["user"])
        from hrm.changes import record_changes

        record_changes(employee, before, _actor(request))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    employee = Employee.objects.select_related("department", "employment_type", "reports_to", "dealer", "user").filter(
        user=request.user
    ).first()
    if employee is None:
        return Response({"detail": "No employee record is linked to this account."}, status=status.HTTP_404_NOT_FOUND)
    return Response(_employee_payload(employee, request))
