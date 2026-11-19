"""HRM departments, employees, attendance and activity rollups."""

from __future__ import annotations

from datetime import time

from attendance.models import AttendanceRecord
from common.models import DailyActivityRollup
from hrm.models import (
    BSYearOverride,
    Department,
    Employee,
    EmployeeChangeLog,
    EmployeeStatusHistory,
    EmploymentType,
)

from .helpers import CENTRAL_DEALER, day, dec, log, stamp

DEPARTMENTS = (
    ("Operations", "OPS", None),
    ("Sales", "SAL", "Operations"),
    ("Service", "SVC", "Operations"),
    ("Finance", "FIN", "Operations"),
    ("Human Resources", "HR", "Operations"),
    ("Inventory", "INV", "Operations"),
    ("Dealer Operations", "DLR", "Sales"),
)

EMPLOYEES = (
    {
        "code": "EMP-0001",
        "user": "ops.manager",
        "department": "Operations",
        "designation": "General Manager",
        "employment": "Permanent",
        "joining": "2022-01-10",
        "salary": "185000",
        "reports_to": None,
    },
    {
        "code": "EMP-0002",
        "user": "sales.manager",
        "department": "Sales",
        "designation": "Sales Manager",
        "employment": "Permanent",
        "joining": "2022-04-01",
        "salary": "125000",
        "reports_to": "EMP-0001",
    },
    {
        "code": "EMP-0003",
        "user": "sales.exec",
        "department": "Sales",
        "designation": "Sales Executive",
        "employment": "Permanent",
        "joining": "2023-02-15",
        "salary": "72000",
        "reports_to": "EMP-0002",
    },
    {
        "code": "EMP-0004",
        "user": "service.manager",
        "department": "Service",
        "designation": "Service Manager",
        "employment": "Permanent",
        "joining": "2022-07-18",
        "salary": "118000",
        "reports_to": "EMP-0001",
    },
    {
        "code": "EMP-0005",
        "user": "technician",
        "department": "Service",
        "designation": "EV Technician",
        "employment": "Contract",
        "joining": "2024-03-05",
        "salary": "56000",
        "reports_to": "EMP-0004",
    },
    {
        "code": "EMP-0006",
        "user": "hr.admin",
        "department": "Human Resources",
        "designation": "HR Administrator",
        "employment": "Permanent",
        "joining": "2023-06-12",
        "salary": "85000",
        "reports_to": "EMP-0001",
    },
    {
        "code": "EMP-0007",
        "user": "employee",
        "department": "Inventory",
        "designation": "Inventory Coordinator",
        "employment": "Probation",
        "joining": "2026-08-01",
        "salary": "48000",
        "reports_to": "EMP-0001",
    },
    {
        "code": "EMP-0008",
        "user": "dealer.staff",
        "department": "Dealer Operations",
        "designation": "Branch Coordinator",
        "employment": "Permanent",
        "joining": "2023-10-20",
        "salary": "62000",
        "reports_to": "EMP-0002",
    },
    {
        "code": "EMP-0009",
        "user": "accounts",
        "department": "Finance",
        "designation": "Finance & Accounts Officer",
        "employment": "Permanent",
        "joining": "2023-01-09",
        "salary": "78000",
        "reports_to": "EMP-0001",
    },
)


def seed_hrm(crm: dict, users: dict, dealers: dict) -> dict[str, object]:
    log("HRM and attendance")
    departments = {}
    for name, code, parent_code in DEPARTMENTS:
        parent = departments.get(parent_code)
        department, _ = Department.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "parent": parent,
                "is_active": True,
            },
        )
        departments[name] = department

    employment_types = {}
    for index, (name, code) in enumerate(
        (("Permanent", "PERM"), ("Probation", "PROB"), ("Contract", "CONTR"), ("Intern", "INT"))
    ):
        employment_type, _ = EmploymentType.objects.get_or_create(
            name=name,
            defaults={"code": code, "is_active": True, "sort_order": index},
        )
        employment_types[name] = employment_type

    employees = {}
    for spec in EMPLOYEES:
        user = users.get(spec["user"])
        profile = getattr(user, "profile", None) if user else None
        employee, _ = Employee.objects.update_or_create(
            employee_code=spec["code"],
            defaults={
                "full_name": user.get_full_name() if user else spec["designation"],
                "date_of_birth": day(-12000),
                "phone": profile.phone if profile else "+977-9800000100",
                "email": user.email if user else f"{spec['code'].lower()}@evos.example.com",
                "temporary_address": "Kathmandu, Nepal",
                "permanent_address": "Kathmandu, Nepal",
                "pan_vat_number": f"PAN-{spec['code']}",
                "citizenship_number": f"CIT-{spec['code']}",
                "designation": spec["designation"],
                "department": departments.get(spec["department"]),
                "employment_type": employment_types.get(spec["employment"]),
                "joining_date": day(-900),
                "probation_end_date": day(-700),
                "basic_salary": dec(spec["salary"]),
                "employment_status": "active",
                "status_effective_date": day(-900),
                "emergency_contact_name": "Family Contact",
                "emergency_contact_phone": "+977-9800000199",
                "notes": "Demo employee created by the EV OS seeder.",
                "dealer": profile.dealer if profile else dealers.get(CENTRAL_DEALER),
                "user": user,
                "created_by": users.get("hr.admin"),
            },
        )
        employees[spec["code"]] = employee

    # Reporting lines after every employee exists.
    for spec in EMPLOYEES:
        manager = employees.get(spec["reports_to"])
        employee = employees[spec["code"]]
        if manager and employee.reports_to_id != manager.id:
            employee.reports_to = manager
            employee.save(update_fields=["reports_to"])

    departments["Operations"].head = employees["EMP-0001"]
    departments["Operations"].save(update_fields=["head"])
    departments["Sales"].head = employees["EMP-0002"]
    departments["Sales"].save(update_fields=["head"])
    departments["Service"].head = employees["EMP-0004"]
    departments["Service"].save(update_fields=["head"])

    # Former employee with a complete status history.
    former, _ = Employee.objects.update_or_create(
        employee_code="EMP-0010",
        defaults={
            "full_name": "Bimal Gurung",
            "date_of_birth": day(-13500),
            "phone": "+977-9800000110",
            "email": "bimal.gurung@evos.example.com",
            "temporary_address": "Lalitpur, Nepal",
            "permanent_address": "Gorkha, Nepal",
            "designation": "Sales Executive",
            "department": departments["Sales"],
            "employment_type": employment_types["Permanent"],
            "joining_date": day(-1200),
            "basic_salary": dec("65000"),
            "employment_status": "resigned",
            "status_effective_date": day(-90),
            "status_reason": "Relocated outside Nepal.",
            "notes": "Former employee retained for HR history.",
            "dealer": dealers.get(CENTRAL_DEALER),
            "created_by": users.get("hr.admin"),
        },
    )
    employees["EMP-0010"] = former

    for code, employee in employees.items():
        EmployeeStatusHistory.objects.get_or_create(
            employee=employee,
            status="active",
            effective_date=day(-900),
            defaults={"reason": "Joined the company.", "changed_by": users.get("hr.admin")},
        )
        if code == "EMP-0010":
            EmployeeStatusHistory.objects.get_or_create(
                employee=employee,
                status="resigned",
                effective_date=day(-90),
                defaults={
                    "reason": "Relocated outside Nepal.",
                    "changed_by": users.get("hr.admin"),
                },
            )

    for code, field_name, old_value, new_value in (
        ("EMP-0003", "designation", "Sales Associate", "Sales Executive"),
        ("EMP-0005", "employment_type", "Probation", "Contract"),
        ("EMP-0007", "department", "Operations", "Inventory"),
    ):
        employee = employees.get(code)
        if not employee:
            continue
        EmployeeChangeLog.objects.get_or_create(
            employee=employee,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            defaults={"changed_by": users.get("hr.admin")},
        )

    # Attendance for the past two working weeks.
    attendance_users = [user for user in users.values() if user]
    AttendanceRecord.objects.filter(
        user__in=attendance_users,
        timestamp__date__gte=day(-14),
    ).delete()
    for offset in range(-13, 1):
        record_date = day(offset)
        if record_date.weekday() >= 5:
            continue
        for user in attendance_users:
            AttendanceRecord.objects.create(
                user=user,
                timestamp=stamp(offset, 9, 5),
                type="check_in",
                confidence_score=0.99,
                device="Demo Face Terminal",
                location="Head Office",
            )
            AttendanceRecord.objects.create(
                user=user,
                timestamp=stamp(offset, 18, 10),
                type="check_out",
                confidence_score=0.98,
                device="Demo Face Terminal",
                location="Head Office",
            )

    BSYearOverride.objects.update_or_create(
        year=2082,
        defaults={
            "month_lengths": [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
            "note": "Demo Bikram Sambat calendar override.",
            "source": "seed",
            "entered_by": users.get("hr.admin"),
        },
    )

    for offset in range(-6, 1):
        for username in ("template", "sales.exec", "service.manager"):
            user = users.get(username)
            if not user:
                continue
            DailyActivityRollup.objects.update_or_create(
                user=user,
                date=day(offset),
                action_type="CREATE",
                object_type="Lead",
                defaults={
                    "dealer": dealers.get(CENTRAL_DEALER),
                    "count": 2 + (abs(offset) % 4),
                },
            )

    log(f"  departments: {len(departments)}, employees: {len(employees)}")
    return {
        "departments": departments,
        "employees": employees,
        "employment_types": employment_types,
    }
