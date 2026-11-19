from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, List, Optional

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from accounts.models import user_dealer_id, user_has_perm, user_is_super_admin
from common.models import Notification

logger = logging.getLogger(__name__)


def create_notification(
    *,
    recipient: Any,
    notification_type: str,
    title: str,
    message: str,
    link: str = "",
    dedup_key: Optional[str] = None,
    content_object: Optional[Any] = None,
    dry_run: bool = False,
) -> Optional[Notification]:
    """
    Create a notification if one does not already exist with the same dedup_key
    for this recipient. Returns the created Notification or None if skipped.
    """
    if dedup_key:
        exists = Notification.objects.filter(
            recipient=recipient,
            dedup_key=dedup_key,
        ).exists()
        if exists:
            logger.debug(
                "Skipping duplicate notification [%s] for user %s",
                dedup_key,
                recipient,
            )
            return None

    if dry_run:
        logger.info(
            "[DRY-RUN] Notification would be created: type=%s, recipient=%s, dedup=%s",
            notification_type,
            recipient,
            dedup_key,
        )
        return None

    ct = ContentType.objects.get_for_model(content_object) if content_object else None
    obj_id = str(content_object.pk) if content_object else ""

    return Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title,
        message=message,
        link=link,
        dedup_key=dedup_key,
        content_type=ct,
        object_id=obj_id,
    )


def get_recipients_for_event(
    perm_label: str,
    dealer_id: Optional[int] = None,
) -> List[Any]:
    """
    Determine staff recipients for an event.
    - User must be active and have the required permission.
    - If event has a dealer_id, dealer staff must match that dealer_id.
      Super Admin and staff with no home dealer (e.g. Service Manager) receive it.
    - If event has no dealer_id, all staff with the permission receive it.
    """
    User = get_user_model()
    candidates = User.objects.filter(is_active=True).select_related("profile")
    recipients = []

    for user in candidates:
        if not user_has_perm(user, perm_label):
            continue

        if user_is_super_admin(user):
            recipients.append(user)
            continue

        u_dealer = user_dealer_id(user)
        if dealer_id is not None:
            # Dealer-specific item: unscoped managers or matching dealer staff
            if u_dealer is None or u_dealer == dealer_id:
                recipients.append(user)
        else:
            # Unassigned item: all authorized staff receive it
            recipients.append(user)

    return recipients


def notify_service_due(
    unit: Any,
    due_date: Optional[date],
    days_until_due: Optional[int],
    dry_run: bool = False,
) -> int:
    """
    Notify relevant servicing staff when a unit is due for service within 7 days.
    Deduplication: once per unit per due date.
    """
    if not due_date:
        return 0

    dedup_key = f"SERVICE_DUE_SOON:{unit.id}:{due_date}"
    sale = getattr(unit, "latest_sale", None)
    dealer_id = sale.dealer_id if sale else None

    recipients = get_recipients_for_event("servicing.view_servicerecord", dealer_id=dealer_id)
    created_count = 0

    due_str = due_date.strftime("%Y-%m-%d")
    timing_str = f"in {days_until_due} days" if (days_until_due is not None and days_until_due > 0) else "today"
    title = f"Service due soon: {unit.vin_chassis_no}"
    message = (
        f"Unit {unit.vin_chassis_no} ({unit.vehicle_model or 'Vehicle'}) is due for routine "
        f"service on {due_str} ({timing_str})."
    )
    link = f"/units/{unit.id}"

    for recipient in recipients:
        notif = create_notification(
            recipient=recipient,
            notification_type=Notification.NotificationType.SERVICE_DUE_SOON,
            title=title,
            message=message,
            link=link,
            dedup_key=dedup_key,
            content_object=unit,
            dry_run=dry_run,
        )
        if notif or dry_run:
            created_count += 1

    return created_count


def notify_service_overdue(
    unit: Any,
    due_date: Optional[date] = None,
    dry_run: bool = False,
) -> int:
    """
    Notify relevant servicing staff when a unit is overdue for service.
    Deduplication: once per calendar week while overdue.
    """
    now = timezone.localdate()
    iso_year, iso_week, _ = now.isocalendar()
    dedup_key = f"SERVICE_OVERDUE:{unit.id}:{iso_year}-W{iso_week:02d}"

    sale = getattr(unit, "latest_sale", None)
    dealer_id = sale.dealer_id if sale else None

    recipients = get_recipients_for_event("servicing.view_servicerecord", dealer_id=dealer_id)
    created_count = 0

    title = f"Service overdue: {unit.vin_chassis_no}"
    message = (
        f"Unit {unit.vin_chassis_no} ({unit.vehicle_model or 'Vehicle'}) is overdue for routine service."
    )
    link = f"/units/{unit.id}"

    for recipient in recipients:
        notif = create_notification(
            recipient=recipient,
            notification_type=Notification.NotificationType.SERVICE_OVERDUE,
            title=title,
            message=message,
            link=link,
            dedup_key=dedup_key,
            content_object=unit,
            dry_run=dry_run,
        )
        if notif or dry_run:
            created_count += 1

    return created_count


def notify_warranty_expiring(
    unit: Any,
    warranty_type: str,
    expiry_date: date,
    days_remaining: int,
    dry_run: bool = False,
) -> int:
    """
    Notify staff when vehicle or battery warranty expires within 30 days.
    Deduplication: once per unit per warranty type and expiry date.
    """
    dedup_key = f"WARRANTY_EXPIRING:{unit.id}:{warranty_type}:{expiry_date}"
    sale = getattr(unit, "latest_sale", None)
    dealer_id = sale.dealer_id if sale else None

    recipients = get_recipients_for_event("inventory.view_vehicleunit", dealer_id=dealer_id)
    created_count = 0

    w_label = "Vehicle warranty" if warranty_type == "vehicle" else "Traction battery warranty"
    title = f"{w_label} expiring: {unit.vin_chassis_no}"
    message = (
        f"{w_label} for {unit.vin_chassis_no} expires on {expiry_date.strftime('%Y-%m-%d')} "
        f"(in {days_remaining} days)."
    )
    link = f"/units/{unit.id}"

    for recipient in recipients:
        notif = create_notification(
            recipient=recipient,
            notification_type=Notification.NotificationType.WARRANTY_EXPIRING,
            title=title,
            message=message,
            link=link,
            dedup_key=dedup_key,
            content_object=unit,
            dry_run=dry_run,
        )
        if notif or dry_run:
            created_count += 1

    return created_count


def notify_reservation_expiring(
    target_obj: Any,
    expiry_datetime: datetime,
    dry_run: bool = False,
) -> int:
    """
    Notify sales staff when a unit or quotation reservation expires within 2 days.
    """
    is_quotation = hasattr(target_obj, "display_id")
    exp_date = expiry_datetime.date() if isinstance(expiry_datetime, datetime) else expiry_datetime
    time_str = expiry_datetime.strftime("%Y-%m-%d %H:%M") if isinstance(expiry_datetime, datetime) else str(exp_date)

    if is_quotation:
        dedup_key = f"RESERVATION_EXPIRING:quotation:{target_obj.id}:{exp_date}"
        unit_vin = target_obj.reserved_unit.vin_chassis_no if target_obj.reserved_unit else "Unit"
        dealer_id = getattr(target_obj, "dealer_id", None)
        title = f"Reservation expiring soon: Quotation {target_obj.display_id}"
        message = (
            f"Quotation {target_obj.display_id} reservation for {unit_vin} expires at {time_str}."
        )
        link = f"/crm-quotations/{target_obj.id}"
        perm = "crm.view_quotation"
    else:
        dedup_key = f"RESERVATION_EXPIRING:unit:{target_obj.id}:{exp_date}"
        title = f"Direct reservation expiring soon: Unit {target_obj.vin_chassis_no}"
        message = f"Reservation for unit {target_obj.vin_chassis_no} expires at {time_str}."
        link = f"/units/{target_obj.id}"
        dealer_id = None
        perm = "inventory.view_vehicleunit"

    recipients = get_recipients_for_event(perm, dealer_id=dealer_id)
    created_count = 0

    for recipient in recipients:
        notif = create_notification(
            recipient=recipient,
            notification_type=Notification.NotificationType.RESERVATION_EXPIRING,
            title=title,
            message=message,
            link=link,
            dedup_key=dedup_key,
            content_object=target_obj,
            dry_run=dry_run,
        )
        if notif or dry_run:
            created_count += 1

    return created_count


def notify_reservation_expired(
    target_obj: Any,
    dry_run: bool = False,
) -> int:
    """
    Notify sales staff when a unit or quotation reservation has expired.
    """
    today = timezone.localdate()
    is_quotation = hasattr(target_obj, "display_id")

    if is_quotation:
        dedup_key = f"RESERVATION_EXPIRED:quotation:{target_obj.id}:{today}"
        unit_vin = target_obj.reserved_unit.vin_chassis_no if target_obj.reserved_unit else "Unit"
        dealer_id = getattr(target_obj, "dealer_id", None)
        title = f"Reservation expired: Quotation {target_obj.display_id}"
        message = (
            f"Quotation {target_obj.display_id} reservation for {unit_vin} expired. "
            f"The unit was released back to stock."
        )
        link = f"/crm-quotations/{target_obj.id}"
        perm = "crm.view_quotation"
    else:
        dedup_key = f"RESERVATION_EXPIRED:unit:{target_obj.id}:{today}"
        title = f"Direct reservation expired: Unit {target_obj.vin_chassis_no}"
        message = f"Direct reservation for unit {target_obj.vin_chassis_no} expired. Unit released to stock."
        link = f"/units/{target_obj.id}"
        dealer_id = None
        perm = "inventory.view_vehicleunit"

    recipients = get_recipients_for_event(perm, dealer_id=dealer_id)
    created_count = 0

    for recipient in recipients:
        notif = create_notification(
            recipient=recipient,
            notification_type=Notification.NotificationType.RESERVATION_EXPIRED,
            title=title,
            message=message,
            link=link,
            dedup_key=dedup_key,
            content_object=target_obj,
            dry_run=dry_run,
        )
        if notif or dry_run:
            created_count += 1

    return created_count
