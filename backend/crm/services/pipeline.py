"""
Pipeline lifecycle and business operations for CRM.
Single source of truth for pipeline stage derivation, stage transitions,
and automatic Activity logging.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from crm.models import Activity, Customer, Lead, Quotation, TestDrive


ALLOWED_TEST_DRIVE_TRANSITIONS: dict[str, list[str]] = {
    TestDrive.Status.REQUESTED: [
        TestDrive.Status.SCHEDULED,
        TestDrive.Status.CANCELLED,
        TestDrive.Status.NO_SHOW,
    ],
    TestDrive.Status.SCHEDULED: [
        TestDrive.Status.CONFIRMED,
        TestDrive.Status.CANCELLED,
        TestDrive.Status.NO_SHOW,
    ],
    TestDrive.Status.CONFIRMED: [
        TestDrive.Status.COMPLETED,
        TestDrive.Status.CANCELLED,
        TestDrive.Status.NO_SHOW,
    ],
    TestDrive.Status.COMPLETED: [],
    TestDrive.Status.CANCELLED: [],
    TestDrive.Status.NO_SHOW: [],
}


def _resolved_user_name(user: Any) -> str:
    if not user or not getattr(user, "is_authenticated", False):
        return "System"
    return user.get_full_name() or user.username or "System"


def _activity_dealer_and_creator(user: Any, entity: Any = None):
    from accounts.models import user_dealer_id
    dealer = getattr(entity, "dealer", None) if entity else None
    if not dealer and entity and hasattr(entity, "customer") and getattr(entity.customer, "dealer", None):
        dealer = entity.customer.dealer
    if not dealer and entity and hasattr(entity, "lead") and getattr(entity.lead, "dealer", None):
        dealer = entity.lead.dealer
    if not dealer and user and getattr(user, "is_authenticated", False):
        d_id = user_dealer_id(user)
        if d_id:
            from dealers.models import Dealer
            dealer = Dealer.objects.filter(id=d_id).first()
    creator = user if user and getattr(user, "is_authenticated", False) else None
    return dealer, creator


def validate_test_drive_transition(current_status: str, new_status: str) -> None:
    """Validates whether transitioning from current_status to new_status is permitted."""
    if current_status == new_status:
        return
    if current_status in [TestDrive.Status.COMPLETED, TestDrive.Status.CANCELLED, TestDrive.Status.NO_SHOW]:
        raise ValidationError(f"Cannot transition test drive from final status '{current_status}'.")
    allowed = ALLOWED_TEST_DRIVE_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise ValidationError(f"Invalid transition from '{current_status}' to '{new_status}'.")


def check_test_drive_conflict(
    unit: Any,
    date: Any,
    time: Any,
    exclude_id: Optional[int] = None,
) -> Optional[TestDrive]:
    """
    Checks if a vehicle unit is already booked for an overlapping test drive on the given date.
    Overlap window is determined by settings.TEST_DRIVE_DURATION_MINUTES (default 60).
    """
    if not unit or not date or not time:
        return None

    duration = getattr(settings, "TEST_DRIVE_DURATION_MINUTES", 60)
    start_dt = datetime.datetime.combine(date, time)
    end_dt = start_dt + datetime.timedelta(minutes=duration)

    active_statuses = [
        TestDrive.Status.REQUESTED,
        TestDrive.Status.SCHEDULED,
        TestDrive.Status.CONFIRMED,
    ]

    qs = TestDrive.objects.filter(
        unit=unit,
        date=date,
        time__isnull=False,
        status__in=active_statuses,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)

    for other in qs:
        other_start = datetime.datetime.combine(other.date, other.time)
        other_end = other_start + datetime.timedelta(minutes=duration)
        if start_dt < other_end and other_start < end_dt:
            return other

    return None


def transition_test_drive_status(
    test_drive: TestDrive,
    new_status: str,
    user: Any = None,
    notes: str = "",
) -> TestDrive:
    """
    Transitions a test drive to a new status using the allowed-transition map.
    Logs an Activity with the acting user for the change.
    """
    with transaction.atomic():
        old_status = test_drive.status
        validate_test_drive_transition(old_status, new_status)
        if old_status == new_status:
            return test_drive

        test_drive.status = new_status
        if notes:
            test_drive.notes = f"{test_drive.notes}\n{notes}".strip() if test_drive.notes else notes
        test_drive.save(update_fields=["status", "notes", "updated_at"])

        old_label = dict(TestDrive.Status.choices).get(old_status, old_status)
        new_label = dict(TestDrive.Status.choices).get(new_status, new_status)
        user_name = _resolved_user_name(user)
        dealer, creator = _activity_dealer_and_creator(user, test_drive)

        Activity.objects.create(
            customer=test_drive.customer,
            lead=test_drive.lead,
            dealer=dealer,
            created_by=creator,
            type=Activity.Type.STATUS_CHANGE,
            subject=f"Test drive {new_label.lower()}: {test_drive.vehicle}",
            description=f"Test drive status changed from {old_label} to {new_label}." + (f" Note: {notes}" if notes else ""),
            user=user if user and getattr(user, "is_authenticated", False) else None,
            user_name=user_name,
        )

        now = timezone.now()
        if test_drive.lead:
            update_fields = ["last_activity", "updated_at"]
            if new_status == TestDrive.Status.COMPLETED and test_drive.lead.status == Lead.Status.NEW:
                test_drive.lead.status = Lead.Status.CONTACTED
                update_fields.append("status")
            test_drive.lead.last_activity = now
            test_drive.lead.save(update_fields=update_fields)

        if test_drive.customer:
            test_drive.customer.last_activity = now
            test_drive.customer.save(update_fields=["last_activity", "updated_at"])

        return test_drive


def log_unit_reserved_activity(
    unit: Any,
    user: Any = None,
    note: str = "",
    lead: Any = None,
    customer: Any = None,
) -> Activity:
    """
    Logs an Activity when a vehicle unit is reserved, and advances lead status if applicable.
    """
    cust = customer or getattr(unit, "current_customer", None)
    lead_obj = lead or getattr(unit, "lead", None)

    if lead_obj and lead_obj.status in [Lead.Status.NEW, Lead.Status.CONTACTED]:
        lead_obj.status = Lead.Status.QUALIFIED
        lead_obj.save(update_fields=["status", "updated_at"])

    user_name = _resolved_user_name(user)
    dealer, creator = _activity_dealer_and_creator(user, unit)
    if not dealer and cust:
        dealer = getattr(cust, "dealer", None)
    if not dealer and lead_obj:
        dealer = getattr(lead_obj, "dealer", None)

    return Activity.objects.create(
        customer=cust,
        lead=lead_obj,
        dealer=dealer,
        created_by=creator,
        type=Activity.Type.STATUS_CHANGE,
        subject=f"Unit reserved: {unit.vin_chassis_no}",
        description=f"{unit.vehicle_model} reserved. {note}".strip(),
        user=user if user and getattr(user, "is_authenticated", False) else None,
        user_name=user_name,
    )


def log_unit_released_activity(
    unit: Any,
    user: Any = None,
    note: str = "",
    lead: Any = None,
    customer: Any = None,
) -> Activity:
    """
    Logs an Activity when a vehicle unit reservation is released.
    """
    cust = customer or getattr(unit, "current_customer", None)
    lead_obj = lead or getattr(unit, "lead", None)

    user_name = _resolved_user_name(user)
    dealer, creator = _activity_dealer_and_creator(user, unit)
    if not dealer and cust:
        dealer = getattr(cust, "dealer", None)
    if not dealer and lead_obj:
        dealer = getattr(lead_obj, "dealer", None)

    return Activity.objects.create(
        customer=cust,
        lead=lead_obj,
        dealer=dealer,
        created_by=creator,
        type=Activity.Type.STATUS_CHANGE,
        subject=f"Unit reservation released: {unit.vin_chassis_no}",
        description=f"{unit.vehicle_model} reservation released. {note}".strip(),
        user=user if user and getattr(user, "is_authenticated", False) else None,
        user_name=user_name,
    )


def handle_quotation_rejection_or_expiry(
    quotation: Quotation,
    user: Any = None,
    note: str = "",
) -> None:
    """
    When a quotation is rejected or expired:
    1. Releases any reserved unit associated with this quotation.
    2. Reverts the lead pipeline stage / status back to contacted if it was qualified by this quote.
    """
    with transaction.atomic():
        from inventory.models import VehicleUnit

        # 1. Release reserved unit if one is attached
        unit_to_release = getattr(quotation, "reserved_unit", None)
        if not unit_to_release and quotation.unit and quotation.unit.status == VehicleUnit.Status.RESERVED:
            unit_to_release = quotation.unit

        if unit_to_release:
            if unit_to_release.status == VehicleUnit.Status.RESERVED:
                rel_note = note or f"Quotation {quotation.display_id} {quotation.status}."
                unit_to_release.transition_to(
                    VehicleUnit.Status.READY_FOR_SALE,
                    by=user if user and getattr(user, "is_authenticated", False) else None,
                    note=rel_note,
                )
                unit_to_release.save(update_fields=["status", "updated_at"])
                log_unit_released_activity(
                    unit=unit_to_release,
                    user=user,
                    note=rel_note,
                    lead=quotation.lead,
                    customer=quotation.customer,
                )

            if hasattr(quotation, "reserved_unit") and quotation.reserved_unit:
                quotation.reserved_unit = None
                quotation.save(update_fields=["reserved_unit", "updated_at"])

        # 2. Revert lead pipeline stage if applicable
        lead = quotation.lead
        if lead:
            other_active_quotes = lead.quotations.exclude(pk=quotation.pk).exclude(
                status__in=[Quotation.Status.REJECTED, Quotation.Status.EXPIRED]
            ).exists()
            has_active_td = lead.test_drives.filter(
                status__in=[TestDrive.Status.SCHEDULED, TestDrive.Status.CONFIRMED, TestDrive.Status.COMPLETED]
            ).exists()

            if not other_active_quotes and not has_active_td:
                if lead.status == Lead.Status.QUALIFIED:
                    lead.status = Lead.Status.CONTACTED
                    lead.last_activity = timezone.now()
                    lead.save(update_fields=["status", "last_activity", "updated_at"])

                    user_name = _resolved_user_name(user)
                    dealer, creator = _activity_dealer_and_creator(user, quotation)
                    Activity.objects.create(
                        customer=quotation.customer,
                        lead=lead,
                        dealer=dealer,
                        created_by=creator,
                        type=Activity.Type.STATUS_CHANGE,
                        subject="Lead pipeline stage reverted to Contacted",
                        description=f"Quotation {quotation.display_id} {quotation.status}. Pipeline stage reverted.",
                        user=user if user and getattr(user, "is_authenticated", False) else None,
                        user_name=user_name,
                    )


def compute_lead_pipeline_stage(lead: Lead) -> str:
    """
    Computes a lead's pipeline stage from linked records and current status:
    1. "lost": if lead status is lost.
    2. "won": if lead status is converted OR an active Sale exists.
    3. "negotiation": if an accepted quotation exists.
    4. "quotation": if an active (non-rejected, non-expired) quotation exists.
    5. "test_drive": if a scheduled, confirmed, or completed test drive exists.
    6. "contacted": if lead status is contacted.
    7. "new": initial state.
    """
    if lead.status == Lead.Status.LOST:
        return "lost"
    if lead.status == Lead.Status.CONVERTED:
        return "won"

    # Check if a current sale exists
    from inventory.models import Sale
    if Sale.objects.filter(lead=lead, is_current=True).exists():
        return "won"

    cust = getattr(lead, "customer", None)
    if cust and Sale.objects.filter(customer=cust, is_current=True).exists():
        return "won"

    # Check active quotations (ignore rejected and expired)
    quotes = lead.quotations.all()
    active_quotes = [q for q in quotes if q.status not in (Quotation.Status.REJECTED, Quotation.Status.EXPIRED)]
    if any(q.status == Quotation.Status.ACCEPTED for q in active_quotes):
        return "negotiation"
    if cust:
        c_quotes = cust.quotations.all()
        c_active = [q for q in c_quotes if q.status not in (Quotation.Status.REJECTED, Quotation.Status.EXPIRED)]
        if any(q.status == Quotation.Status.ACCEPTED for q in c_active):
            return "negotiation"
        if not active_quotes and c_active:
            return "quotation"
    if active_quotes:
        return "quotation"

    # Check test drives
    tds = lead.test_drives.all()
    valid_td_statuses = [
        TestDrive.Status.SCHEDULED,
        TestDrive.Status.CONFIRMED,
        TestDrive.Status.COMPLETED,
    ]
    if any(td.status in valid_td_statuses for td in tds):
        return "test_drive"
    if cust:
        c_tds = cust.test_drives.all()
        if any(td.status in valid_td_statuses for td in c_tds):
            return "test_drive"

    if lead.status == Lead.Status.CONTACTED:
        return "contacted"

    return "new"


def get_pipeline_summary(leads=None) -> dict[str, int]:
    """
    Returns counts of leads grouped by their computed pipeline stage.
    Used by CRM overview and dashboard so all numbers match.
    Pass a dealer-scoped ``leads`` queryset for non-admin callers.
    """
    counts = {
        "new": 0,
        "contacted": 0,
        "test_drive": 0,
        "quotation": 0,
        "negotiation": 0,
        "won": 0,
        "lost": 0,
    }

    leads = (Lead.objects.all() if leads is None else leads).prefetch_related(
        "quotations", "test_drives", "customer"
    )
    for lead in leads:
        stage = compute_lead_pipeline_stage(lead)
        if stage in counts:
            counts[stage] += 1
        else:
            counts["new"] += 1

    return counts


def schedule_test_drive(
    *,
    lead: Optional[Lead] = None,
    customer: Optional[Customer] = None,
    unit: Optional[Any] = None,
    vehicle: str,
    date: Any,
    time: Any = None,
    salesperson: str = "",
    location: str = "",
    notes: str = "",
    user: Any = None,
) -> TestDrive:
    """Schedule a test drive for a lead or customer."""
    if not lead and not customer:
        raise ValidationError("A test drive must be linked to either a lead or a customer.")

    if unit and date and time:
        conflict = check_test_drive_conflict(unit=unit, date=date, time=time)
        if conflict:
            raise ValidationError(
                f"Vehicle unit {unit.vin_chassis_no} is already booked for a test drive at {conflict.time}."
            )

    with transaction.atomic():
        customer_name = ""
        if customer:
            customer_name = customer.name
        elif lead:
            customer_name = lead.name

        dealer, creator = _activity_dealer_and_creator(user, customer or lead)

        td = TestDrive.objects.create(
            lead=lead,
            customer=customer,
            unit=unit,
            customer_name=customer_name,
            vehicle=vehicle,
            date=date,
            time=time,
            salesperson=salesperson,
            location=location,
            notes=notes,
            status=TestDrive.Status.SCHEDULED,
            dealer=dealer,
            created_by=creator,
        )

        user_name = _resolved_user_name(user) or salesperson or "System"

        Activity.objects.create(
            customer=customer,
            lead=lead,
            dealer=dealer,
            created_by=creator,
            type=Activity.Type.TEST_DRIVE,
            subject=f"Test drive scheduled: {vehicle}",
            description=f"Test drive scheduled for {customer_name} on {date} at {time or 'unspecified time'}.",
            user=user if user and getattr(user, "is_authenticated", False) else None,
            user_name=user_name,
        )

        if lead:
            lead.last_activity = timezone.now()
            lead.save(update_fields=["last_activity", "updated_at"])
        if customer:
            customer.last_activity = timezone.now()
            customer.save(update_fields=["last_activity", "updated_at"])

        return td


def accept_quotation(quotation: Quotation, user: Any = None) -> Quotation:
    """Accept a quotation and advance lead status to qualified if applicable."""
    with transaction.atomic():
        quotation.status = Quotation.Status.ACCEPTED
        quotation.save(update_fields=["status", "updated_at"])

        user_name = _resolved_user_name(user) or quotation.salesperson or "System"
        dealer, creator = _activity_dealer_and_creator(user, quotation)

        Activity.objects.create(
            customer=quotation.customer,
            lead=quotation.lead,
            dealer=dealer,
            created_by=creator,
            type=Activity.Type.QUOTATION,
            subject=f"Quotation {quotation.display_id} accepted",
            description=f"{quotation.vehicle} quotation accepted by {quotation.resolved_customer_name}.",
            user=user if user and getattr(user, "is_authenticated", False) else None,
            user_name=user_name,
        )

        if quotation.lead and quotation.lead.status in [Lead.Status.NEW, Lead.Status.CONTACTED]:
            quotation.lead.status = Lead.Status.QUALIFIED
            quotation.lead.last_activity = timezone.now()
            quotation.lead.save(update_fields=["status", "last_activity", "updated_at"])

        return quotation


def reserve_unit_for_quotation(
    quotation: Quotation,
    unit: Any,
    user: Any = None,
    days: Optional[int] = None,
) -> Quotation:
    """
    Reserve a specific VehicleUnit for a quotation.

    - Sets quotation.reserved_unit and quotation.reservation_expires_at.
    - Transitions unit.status to RESERVED.
    - Logs an Activity.
    - Raises ValidationError if the unit is already reserved by another active quotation.
    """
    from inventory.models import VehicleUnit

    if days is None:
        days = getattr(settings, "RESERVATION_DEFAULT_DAYS", 7)

    with transaction.atomic():
        # Lock the unit row so no concurrent reservation can sneak in
        locked_unit = VehicleUnit.objects.select_for_update().get(pk=unit.pk)

        # Check for an existing active reservation on this unit (not by this quotation)
        now = timezone.now()
        conflict_qs = Quotation.objects.filter(
            reserved_unit=locked_unit,
        ).exclude(
            status__in=[Quotation.Status.REJECTED, Quotation.Status.EXPIRED]
        ).exclude(
            # Treat time-expired reservations as free even if the command hasn't run yet
            reservation_expires_at__lte=now,
        ).exclude(pk=quotation.pk)

        if conflict_qs.exists():
            other = conflict_qs.first()
            raise ValidationError(
                f"Unit {locked_unit.vin_chassis_no} is already reserved by quotation {other.display_id}."
            )

        if locked_unit.status not in (VehicleUnit.Status.READY_FOR_SALE, VehicleUnit.Status.RESERVED):
            raise ValidationError(
                f"Unit {locked_unit.vin_chassis_no} cannot be reserved (current status: {locked_unit.status})."
            )

        expires_at = timezone.now() + datetime.timedelta(days=days)

        # Release any previously reserved unit on this quotation
        if quotation.reserved_unit and quotation.reserved_unit.pk != locked_unit.pk:
            prev_unit = quotation.reserved_unit
            if prev_unit.status == VehicleUnit.Status.RESERVED:
                prev_unit.status = VehicleUnit.Status.READY_FOR_SALE
                prev_unit.save(update_fields=["status", "updated_at"])

        quotation.reserved_unit = locked_unit
        quotation.reservation_expires_at = expires_at
        quotation.save(update_fields=["reserved_unit", "reservation_expires_at", "updated_at"])

        locked_unit.status = VehicleUnit.Status.RESERVED
        locked_unit.save(update_fields=["status", "updated_at"])

        user_name = _resolved_user_name(user)
        dealer, creator = _activity_dealer_and_creator(user, quotation)
        Activity.objects.create(
            customer=quotation.customer,
            lead=quotation.lead,
            dealer=dealer,
            created_by=creator,
            type=Activity.Type.STATUS_CHANGE,
            subject=f"Unit reserved for quotation {quotation.display_id}: {locked_unit.vin_chassis_no}",
            description=(
                f"Unit {locked_unit.vin_chassis_no} reserved for {days} day(s) "
                f"until {expires_at.date()}."
            ),
            user=user if user and getattr(user, "is_authenticated", False) else None,
            user_name=user_name,
        )

        if quotation.lead and quotation.lead.status in [Lead.Status.NEW, Lead.Status.CONTACTED]:
            quotation.lead.status = Lead.Status.QUALIFIED
            quotation.lead.last_activity = timezone.now()
            quotation.lead.save(update_fields=["status", "last_activity", "updated_at"])

        return quotation

