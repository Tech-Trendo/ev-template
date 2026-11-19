from __future__ import annotations

from typing import Any

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone


class AuditTrackedModel(models.Model):
    """
    Abstract base class adding created_by and updated_by fields
    with automatic 'System / legacy' fallback name properties.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_updated",
    )

    class Meta:
        abstract = True

    @property
    def created_by_name(self) -> str:
        if self.created_by:
            return self.created_by.get_full_name() or self.created_by.username
        return "System / legacy"

    @property
    def updated_by_name(self) -> str:
        if self.updated_by:
            return self.updated_by.get_full_name() or self.updated_by.username
        return "System / legacy"


class CreatedTrackedModel(models.Model):
    """
    Abstract base class for insert-only records adding created_by field
    with automatic 'System / legacy' fallback name property.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(app_label)s_%(class)s_created",
    )

    class Meta:
        abstract = True

    @property
    def created_by_name(self) -> str:
        if self.created_by:
            return self.created_by.get_full_name() or self.created_by.username
        return "System / legacy"


class AuditLog(models.Model):
    """
    Generic audit ledger for tracking sensitive object changes and staff activities.
    Used for customer contact edits, sale corrections, sale cancellations,
    registration updates, model CRUD, and staff login/logout.
    """

    class Action(models.TextChoices):
        LOGIN = "LOGIN", "Login"
        LOGOUT = "LOGOUT", "Logout"
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"
        PRINT = "PRINT", "Print"
        OTHER = "OTHER", "Other"

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    object_id = models.CharField(max_length=100, blank=True, default="", db_index=True)
    content_object = GenericForeignKey("content_type", "object_id")

    field_name = models.CharField(max_length=100, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    action = models.CharField(
        max_length=30,
        choices=Action.choices,
        default=Action.UPDATE,
        db_index=True,
    )
    summary = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    source = models.CharField(
        max_length=50,
        db_index=True,
        help_text="e.g. SERVICING, SALE_EDIT, SALE_CANCEL, REGISTRATION_CHANGE, STAFF_ACTIVITY, AUTH",
    )
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-timestamp", "-id"]

    def __str__(self):
        if self.summary:
            return self.summary
        ct_name = self.content_type.model if self.content_type else "system"
        return f"{self.action}: {ct_name} #{self.object_id} ({self.field_name})"


class Notification(models.Model):
    """
    In-app notification for operational signals (service due, warranty expiry,
    reservation expiration).
    """

    class NotificationType(models.TextChoices):
        SERVICE_DUE_SOON = "SERVICE_DUE_SOON", "Service Due Soon"
        SERVICE_OVERDUE = "SERVICE_OVERDUE", "Service Overdue"
        WARRANTY_EXPIRING = "WARRANTY_EXPIRING", "Warranty Expiring"
        RESERVATION_EXPIRING = "RESERVATION_EXPIRING", "Reservation Expiring"
        RESERVATION_EXPIRED = "RESERVATION_EXPIRED", "Reservation Expired"
        DOCUMENT_EXPIRING = "DOCUMENT_EXPIRING", "Document Expiring"
        DOCUMENT_EXPIRED = "DOCUMENT_EXPIRED", "Document Expired"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=50,
        choices=NotificationType.choices,
        db_index=True,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    dedup_key = models.CharField(max_length=255, db_index=True, null=True, blank=True)

    # Optional generic foreign key to the associated entity
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    object_id = models.CharField(max_length=100, blank=True, default="")
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
            models.Index(fields=["recipient", "dedup_key"]),
        ]

    def __str__(self):
        return f"[{self.notification_type}] {self.title} -> {self.recipient}"


def log_audit_event(
    *,
    instance: Any = None,
    field_name: str = "",
    old_value: Any = None,
    new_value: Any = None,
    changed_by: Any = None,
    source: str = "SYSTEM",
    action: str = AuditLog.Action.UPDATE,
    summary: str = "",
    ip_address: str | None = None,
) -> AuditLog:
    """Helper to record a generic audit log entry."""
    ct = None
    obj_id = ""
    if instance is not None:
        ct = ContentType.objects.get_for_model(instance)
        obj_id = str(instance.pk)
        setattr(instance, "_skip_audit_signal", True)

    acting_user = (
        changed_by
        if (changed_by and getattr(changed_by, "is_authenticated", False))
        else None
    )

    if not summary:
        user_name = (
            acting_user.get_full_name() or acting_user.username
            if acting_user
            else "System"
        )
        ct_model = ct.model if ct else "item"
        if field_name:
            summary = f"{user_name} updated {ct_model} #{obj_id} ({field_name})"
        else:
            summary = f"{user_name} performed {action} on {ct_model} #{obj_id}"

    return AuditLog.objects.create(
        content_type=ct,
        object_id=obj_id,
        field_name=field_name,
        old_value=str(old_value) if old_value is not None else "",
        new_value=str(new_value) if new_value is not None else "",
        changed_by=acting_user,
        source=source,
        action=action,
        summary=summary,
        ip_address=ip_address,
    )


def record_print_event(
    *,
    user: Any,
    document_type: str,
    object_id: Any = "",
    title: str = "",
    ip_address: str | None = None,
) -> AuditLog:
    """
    Record every print or PDF generation in the audit ledger.
    document_type: QUOTATION, SALES_RECEIPT, SERVICING_JOB_SHEET, REPORT, TEAM_PERFORMANCE, etc.
    """
    acting_user = (
        user if (user and getattr(user, "is_authenticated", False)) else None
    )
    user_name = (
        acting_user.get_full_name() or acting_user.username
        if acting_user
        else "System / Anonymous"
    )
    obj_str = str(object_id).strip() if object_id is not None else ""
    if obj_str:
        summary = f"Printed {document_type} #{obj_str} by {user_name}"
    else:
        summary = f"Printed {document_type} by {user_name}"
    if title:
        summary += f" ({title})"

    return AuditLog.objects.create(
        object_id=obj_str,
        field_name="print",
        old_value="",
        new_value=document_type,
        action=AuditLog.Action.PRINT,
        summary=summary,
        changed_by=acting_user,
        source="PRINT",
        ip_address=ip_address,
    )


class DailyActivityRollup(models.Model):
    """
    Daily rollup aggregating raw AuditLog actions and CRM events before purging.
    Persists long-term performance counts per employee and dealership.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="daily_activity_rollups",
    )
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="daily_activity_rollups",
    )
    date = models.DateField(db_index=True)
    action_type = models.CharField(max_length=50, db_index=True)
    object_type = models.CharField(max_length=50, db_index=True)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-date", "user"]
        unique_together = [("user", "dealer", "date", "action_type", "object_type")]
        indexes = [
            models.Index(fields=["date", "user"]),
            models.Index(fields=["dealer", "date"]),
            models.Index(fields=["action_type", "date"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.date} - {self.action_type} ({self.count})"


