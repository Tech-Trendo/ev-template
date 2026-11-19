from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from common.storage import private_storage


def default_weekly_off():
    return ["saturday"]


class HRCalendarPolicy(models.Model):
    """One immutable version of the company's HR calendar rules.

    The row with the latest ``effective_from`` that is still on or before a
    date is the version in force that day. Older rows are history.
    """

    class MonthMode(models.TextChoices):
        BS_MONTH = "bs_month", "BS calendar month"
        CUSTOM_START = "custom_start", "Custom start day"

    month_mode = models.CharField(
        max_length=20,
        choices=MonthMode.choices,
        default=MonthMode.BS_MONTH,
    )
    custom_start_day = models.PositiveSmallIntegerField(
        default=1,
        help_text="Used when month mode is custom. 1-31. Short months clamp to their last day.",
    )
    weekly_off_days = models.JSONField(
        default=default_weekly_off,
        blank=True,
        help_text="Lowercase English weekday names. Default is Saturday.",
    )
    fiscal_year_start_month = models.PositiveSmallIntegerField(
        default=4,
        help_text="BS month the fiscal year starts in. 4 is Shrawan.",
    )
    fiscal_year_start_day = models.PositiveSmallIntegerField(default=1)
    hours_per_day = models.DecimalField(max_digits=4, decimal_places=2, default=8)
    effective_from = models.DateField(
        unique=True,
        db_index=True,
        help_text="First AD date this version applies. Always an HR-month boundary under these rules.",
    )
    note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hr_calendar_policies",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_from", "-id"]
        verbose_name = "HR calendar settings"
        permissions = [
            ("view_hrm", "Can view the HRM module"),
            ("manage_hr_settings", "Can manage HR calendar and payroll-month settings"),
        ]

    def __str__(self):
        return f"HR calendar from {self.effective_from.isoformat()} ({self.get_month_mode_display()})"

    def clean(self):
        super().clean()
        if self.custom_start_day < 1 or self.custom_start_day > 31:
            raise ValidationError({"custom_start_day": "Start day must be from 1 to 31."})
        if self.fiscal_year_start_month < 1 or self.fiscal_year_start_month > 12:
            raise ValidationError({"fiscal_year_start_month": "Fiscal year month must be from 1 to 12."})
        if self.fiscal_year_start_day < 1 or self.fiscal_year_start_day > 31:
            raise ValidationError({"fiscal_year_start_day": "Fiscal year start day must be from 1 to 31."})
        if self.hours_per_day <= 0 or self.hours_per_day > 24:
            raise ValidationError({"hours_per_day": "Working hours per day must be greater than 0 and at most 24."})
        allowed = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}
        days = [str(day).strip().lower() for day in (self.weekly_off_days or [])]
        unknown = [day for day in days if day not in allowed]
        if unknown:
            raise ValidationError({"weekly_off_days": f"Unknown weekday(s): {', '.join(unknown)}."})
        self.weekly_off_days = days


class BSYearOverride(models.Model):
    """Official month lengths for a BS year after the verified table.

    Entered by a Super Admin. The converter refuses any year that is not in
    the verified JSON and not in an unbroken chain of these rows.
    """

    SOURCE_MANUAL = "entered manually"
    SOURCE_API = "api"
    SOURCE_CHOICES = (
        (SOURCE_MANUAL, "Entered manually"),
        (SOURCE_API, "API"),
    )

    year = models.PositiveSmallIntegerField(unique=True)
    month_lengths = models.JSONField()
    note = models.TextField(blank=True, default="")
    source = models.CharField(
        max_length=32,
        choices=SOURCE_CHOICES,
        default=SOURCE_MANUAL,
        blank=True,
    )
    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bs_year_overrides",
    )
    entered_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["year"]

    def __str__(self):
        return f"BS {self.year} ({self.source or self.SOURCE_MANUAL})"

    def clean(self):
        from hrm.calendar import CalendarRangeError, validate_manual_year

        updating = bool(self.pk)
        try:
            self.month_lengths = validate_manual_year(int(self.year), self.month_lengths, updating=updating)
        except CalendarRangeError as exc:
            raise ValidationError(str(exc)) from exc


class Department(models.Model):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=40, unique=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    head = models.ForeignKey(
        "Employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_departments",
    )
    is_active = models.BooleanField(default=True)
    migrated_from_profile = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        permissions = [
            ("manage_department", "Can manage HR departments"),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        if self.parent_id and self.pk and self.parent_id == self.pk:
            raise ValidationError({"parent": "A department cannot be its own parent."})
        seen = set()
        current = self.parent_id
        while current:
            if current == self.pk or current in seen:
                raise ValidationError({"parent": "That parent would create a department cycle."})
            seen.add(current)
            current = Department.objects.filter(pk=current).values_list("parent_id", flat=True).first()


class EmploymentType(models.Model):
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=40, unique=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        permissions = [
            ("manage_employment_type", "Can manage employment types"),
        ]

    def __str__(self):
        return self.name


class EmployeeNumbering(models.Model):
    """One row. last_number only increases, so employee IDs are never reused."""

    prefix = models.CharField(max_length=12, default="EMP-")
    padding = models.PositiveSmallIntegerField(default=4)
    last_number = models.PositiveIntegerField(default=0)

    def clean(self):
        if self.padding < 1 or self.padding > 8:
            raise ValidationError({"padding": "Padding must be from 1 to 8."})
        if not (self.prefix or "").strip():
            raise ValidationError({"prefix": "A prefix is required."})


def allocate_employee_code() -> str:
    from django.db import transaction

    with transaction.atomic():
        row, _ = EmployeeNumbering.objects.select_for_update().get_or_create(
            pk=1,
            defaults={"prefix": "EMP-", "padding": 4, "last_number": 0},
        )
        row.last_number += 1
        row.save(update_fields=["last_number"])
        return f"EMP-{row.last_number:04d}"


class Employee(models.Model):
    """The HR person. A login is optional. Sensitive fields live only here."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        RESIGNED = "resigned", "Resigned"
        TERMINATED = "terminated", "Terminated"
        INACTIVE = "inactive", "Inactive"

    employee_code = models.CharField(max_length=32, unique=True, db_index=True)
    full_name = models.CharField(max_length=200)
    photo = models.ImageField(
        upload_to="employee_photos/",
        null=True,
        blank=True,
        storage=private_storage,
    )
    date_of_birth = models.DateField(null=True, blank=True)
    phone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    temporary_address = models.CharField(max_length=255, blank=True, default="")
    permanent_address = models.CharField(max_length=255, blank=True, default="")
    pan_vat_number = models.CharField(max_length=30, blank=True, default="")
    citizenship_number = models.CharField(max_length=50, blank=True, default="")
    designation = models.CharField(max_length=120, blank=True, default="")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    reports_to = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="direct_reports"
    )
    employment_type = models.ForeignKey(
        EmploymentType, on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    joining_date = models.DateField(null=True, blank=True)
    probation_end_date = models.DateField(null=True, blank=True)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    employment_status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    status_effective_date = models.DateField(null=True, blank=True)
    status_reason = models.TextField(blank=True, default="")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    dealer = models.ForeignKey(
        "dealers.Dealer", on_delete=models.SET_NULL, null=True, blank=True, related_name="employees"
    )
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee",
    )
    migrated_from_profile = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["employee_code"]
        permissions = [
            ("manage_employee", "Can create and edit employees"),
            ("change_employee_status", "Can change employee employment status"),
            ("view_employee_salary", "Can view employee salary"),
            ("assign_user", "Can link a user account to an employee"),
            ("export_employee", "Can export the employee directory"),
        ]

    def __str__(self):
        return f"{self.employee_code} {self.full_name}"

    def clean(self):
        if self.reports_to_id and self.pk and self.reports_to_id == self.pk:
            raise ValidationError({"reports_to": "An employee cannot report to themselves."})
        seen = set()
        current = self.reports_to_id
        while current:
            if current == self.pk or current in seen:
                raise ValidationError({"reports_to": "That manager would create a reporting cycle."})
            seen.add(current)
            current = Employee.objects.filter(pk=current).values_list("reports_to_id", flat=True).first()

    def save(self, *args, **kwargs):
        if not self.employee_code:
            self.employee_code = allocate_employee_code()
        super().save(*args, **kwargs)


class EmployeeStatusHistory(models.Model):
    """Permanent. Not removed by the 60-day audit purge."""

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="status_history")
    status = models.CharField(max_length=20, choices=Employee.Status.choices)
    effective_date = models.DateField()
    reason = models.TextField(blank=True, default="")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-effective_date", "-id"]


class EmployeeChangeLog(models.Model):
    """Permanent field history. Not removed by the 60-day audit purge."""

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

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="change_log")
    field_name = models.CharField(max_length=40)
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at", "-id"]
