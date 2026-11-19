from __future__ import annotations

import contextlib
import contextvars
import logging
from typing import Any, Iterator

from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from common.middleware import get_client_ip, get_current_request_context
from common.models import AuditLog

logger = logging.getLogger(__name__)

_audit_signal_suppressed: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "audit_signal_suppressed", default=False
)


@contextlib.contextmanager
def suppress_audit_signal() -> Iterator[None]:
    """Disable per-row generic audit entries (bulk operations log one summary entry instead)."""
    token = _audit_signal_suppressed.set(True)
    try:
        yield
    finally:
        _audit_signal_suppressed.reset(token)

AUDITABLE_MODEL_LABELS = {
    "inventory.vehicleunit",
    "inventory.sale",
    "inventory.vehiclemodel",
    "inventory.importbatch",
    "inventory.pdiinspection",
    "inventory.conditionreport",
    "inventory.vehiclereceivechecklist",
    "inventory.stockmovement",
    "crm.customer",
    "crm.lead",
    "crm.quotation",
    "crm.opportunity",
    "crm.testdrive",
    "crm.activity",
    "servicing.servicerecord",
    "dealers.dealer",
    "vehicles.vehicle",
    "cms.cmspage",
    "events.event",
    "stories.story",
    "leads.enquiry",
    "accounts.role",
    "accounts.user",
}


def get_object_reference(instance: Any) -> str:
    """Return a human-friendly linkable identifier for the object."""
    if hasattr(instance, "vin_chassis_no") and instance.vin_chassis_no:
        return f"VIN {instance.vin_chassis_no}"
    if hasattr(instance, "display_id") and instance.display_id:
        return f"#{instance.display_id}"
    if hasattr(instance, "vro_no") and instance.vro_no:
        return f"VRO #{instance.vro_no}"
    if hasattr(instance, "name") and instance.name:
        return f"'{instance.name}'"
    if hasattr(instance, "title") and instance.title:
        return f"'{instance.title}'"
    if hasattr(instance, "username") and instance.username:
        return f"'{instance.username}'"
    if hasattr(instance, "full_name") and instance.full_name:
        return f"'{instance.full_name}'"
    return f"#{instance.pk}"


@receiver(post_save)
def audit_model_post_save(sender, instance, created, **kwargs):
    label = instance._meta.label_lower
    if label not in AUDITABLE_MODEL_LABELS:
        return

    # Duplicate guard: skip if specific handler already logged this save
    if getattr(instance, "_skip_audit_signal", False) or _audit_signal_suppressed.get():
        return

    req, ip = get_current_request_context()
    if not (req and getattr(req, "user", None) and req.user.is_authenticated):
        return

    user = req.user
    # Ensure acting user is staff / admin
    if not (user.is_staff or getattr(user, "is_superuser", False) or getattr(user, "is_active", False)):
        return

    action = AuditLog.Action.CREATE if created else AuditLog.Action.UPDATE
    user_name = user.get_full_name() or user.username
    model_name = instance._meta.verbose_name.title()
    obj_ref = get_object_reference(instance)
    summary = f"{user_name} {'created' if created else 'updated'} {model_name} {obj_ref}"

    try:
        ct = ContentType.objects.get_for_model(instance)
        AuditLog.objects.create(
            content_type=ct,
            object_id=str(instance.pk),
            field_name="",
            old_value="",
            new_value="",
            changed_by=user,
            source="STAFF_ACTIVITY",
            action=action,
            summary=summary,
            ip_address=ip,
        )
    except Exception as e:
        logger.warning("Failed to record audit log for %s save: %s", label, e)


@receiver(post_delete)
def audit_model_post_delete(sender, instance, **kwargs):
    label = instance._meta.label_lower
    if label not in AUDITABLE_MODEL_LABELS:
        return

    # Duplicate guard: skip if specific handler already logged this deletion
    if getattr(instance, "_skip_audit_signal", False) or _audit_signal_suppressed.get():
        return

    req, ip = get_current_request_context()
    if not (req and getattr(req, "user", None) and req.user.is_authenticated):
        return

    user = req.user
    if not (user.is_staff or getattr(user, "is_superuser", False) or getattr(user, "is_active", False)):
        return

    user_name = user.get_full_name() or user.username
    model_name = instance._meta.verbose_name.title()
    obj_ref = get_object_reference(instance)
    summary = f"{user_name} deleted {model_name} {obj_ref}"

    try:
        ct = ContentType.objects.get_for_model(instance)
        AuditLog.objects.create(
            content_type=ct,
            object_id=str(instance.pk),
            field_name="",
            old_value="",
            new_value="",
            changed_by=user,
            source="STAFF_ACTIVITY",
            action=AuditLog.Action.DELETE,
            summary=summary,
            ip_address=ip,
        )
    except Exception as e:
        logger.warning("Failed to record audit log for %s delete: %s", label, e)


@receiver(user_logged_in)
def audit_user_logged_in(sender, request, user, **kwargs):
    if not user or not user.is_authenticated:
        return
    if request and getattr(request, "_auth_audit_login_recorded", False):
        return
    if request:
        request._auth_audit_login_recorded = True

    ip = get_client_ip(request) if request else None
    user_name = user.get_full_name() or user.username
    try:
        AuditLog.objects.create(
            changed_by=user,
            action=AuditLog.Action.LOGIN,
            source="AUTH",
            summary=f"{user_name} logged in",
            ip_address=ip,
        )
    except Exception as e:
        logger.warning("Failed to record login audit log for %s: %s", user, e)


@receiver(user_logged_out)
def audit_user_logged_out(sender, request, user, **kwargs):
    if not user:
        return
    if request and getattr(request, "_auth_audit_logout_recorded", False):
        return
    if request:
        request._auth_audit_logout_recorded = True

    ip = get_client_ip(request) if request else None
    user_name = user.get_full_name() or user.username
    try:
        AuditLog.objects.create(
            changed_by=user,
            action=AuditLog.Action.LOGOUT,
            source="AUTH",
            summary=f"{user_name} logged out",
            ip_address=ip,
        )
    except Exception as e:
        logger.warning("Failed to record logout audit log for %s: %s", user, e)
