"""
generate_notifications management command
=========================================

Scans stored data to generate operational in-app notifications:
1. Routine service due within 7 days
2. Routine service overdue (once, then weekly while overdue)
3. Vehicle or battery warranty expiring within 30 days
4. Quotation or direct unit reservation expiring within 2 days

Scheduling:
-----------
Run this command periodically (e.g., daily or every 4-6 hours) via your scheduler:
  python manage.py generate_notifications [--dry-run]
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from common.notifications import (
    notify_reservation_expiring,
    notify_service_due,
    notify_service_overdue,
    notify_warranty_expiring,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Generate proactive in-app notifications for routine service due, "
        "overdue servicing, warranty expirations, and reservation deadlines."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Simulate and report what notifications would be created without writing to database.",
        )

    def handle(self, *args, **options):
        from common.lock import CommandAlreadyRunningError, command_lock

        try:
            with command_lock("generate_notifications"):
                self._handle_locked(*args, **options)
        except CommandAlreadyRunningError:
            self.stdout.write(self.style.WARNING("generate_notifications is already running. Skipping this cycle."))
            return

    def _handle_locked(self, *args, **options):
        from django.db.models import Exists, OuterRef, Q

        from crm.models import Quotation
        from inventory.models import Sale, VehicleUnit
        from servicing.models import ServiceRecord

        dry_run = options["dry_run"]
        today = timezone.localdate()
        now = timezone.now()

        prefix = "[DRY-RUN] " if dry_run else ""
        self.stdout.write(f"{prefix}Starting notification generation scan at {now}...")

        counts = {
            "service_due": 0,
            "service_overdue": 0,
            "warranty_expiring": 0,
            "reservation_expiring": 0,
        }

        # -------------------------------------------------------------------------
        # 1. Service Due and Overdue Scanning
        # -------------------------------------------------------------------------
        # Historically imported units/sales stay silent until a live service visit is recorded.
        live_service = ServiceRecord.objects.filter(
            vehicle_unit=OuterRef("pk"), is_deleted=False
        ).exclude(source="historical import")
        imported_sale = Sale.objects.filter(
            unit=OuterRef("pk"), is_current=True, is_deleted=False, source="historical import"
        )
        units_for_servicing = (
            VehicleUnit.objects.filter(status=VehicleUnit.Status.SOLD)
            .annotate(_live_service=Exists(live_service), _imported_sale=Exists(imported_sale))
            .exclude(
                (Q(source="historical import") | Q(_imported_sale=True)) & Q(_live_service=False)
            )
            .select_related("vehicle_model", "current_customer", "customer")
            .prefetch_related("service_records", "sales__dealer")
        )

        for unit in units_for_servicing:
            due = unit.next_service_due
            status_val = due.get("status")
            if status_val in ("not_configured", "none"):
                continue

            is_overdue = due.get("is_overdue", False)
            due_date = due.get("due_date")
            days_until_due = due.get("days_until_due")

            if is_overdue:
                created = notify_service_overdue(unit, due_date=due_date, dry_run=dry_run)
                counts["service_overdue"] += created
            elif days_until_due is not None and 0 <= days_until_due <= 7:
                created = notify_service_due(
                    unit,
                    due_date=due_date,
                    days_until_due=days_until_due,
                    dry_run=dry_run,
                )
                counts["service_due"] += created

        # -------------------------------------------------------------------------
        # 2. Warranty Expiration Scanning (Vehicle and Battery within 30 days)
        # -------------------------------------------------------------------------
        for unit in units_for_servicing:
            # Vehicle warranty
            v_end = unit.vehicle_warranty_end
            if v_end:
                days_left = (v_end - today).days
                if 0 <= days_left <= 30:
                    created = notify_warranty_expiring(
                        unit,
                        warranty_type="vehicle",
                        expiry_date=v_end,
                        days_remaining=days_left,
                        dry_run=dry_run,
                    )
                    counts["warranty_expiring"] += created

            # Battery warranty
            b_end = unit.battery_warranty_end
            if b_end:
                days_left = (b_end - today).days
                if 0 <= days_left <= 30:
                    created = notify_warranty_expiring(
                        unit,
                        warranty_type="battery",
                        expiry_date=b_end,
                        days_remaining=days_left,
                        dry_run=dry_run,
                    )
                    counts["warranty_expiring"] += created

        # -------------------------------------------------------------------------
        # 3. Reservation Expiring Scanning (Expiring within 2 days)
        # -------------------------------------------------------------------------
        two_days_future = now + timedelta(days=2)

        # Quotations
        expiring_quotations = (
            Quotation.objects.filter(
                reservation_expires_at__gt=now,
                reservation_expires_at__lte=two_days_future,
                reserved_unit__isnull=False,
            )
            .exclude(status__in=[Quotation.Status.REJECTED, Quotation.Status.EXPIRED])
            .select_related("reserved_unit", "lead", "customer")
        )

        for qt in expiring_quotations:
            created = notify_reservation_expiring(
                qt,
                expiry_datetime=qt.reservation_expires_at,
                dry_run=dry_run,
            )
            counts["reservation_expiring"] += created

        # Direct unit reservations
        expiring_units = VehicleUnit.objects.filter(
            status=VehicleUnit.Status.RESERVED,
            reservation_expires_at__gt=now,
            reservation_expires_at__lte=two_days_future,
        )

        for unit in expiring_units:
            created = notify_reservation_expiring(
                unit,
                expiry_datetime=unit.reservation_expires_at,
                dry_run=dry_run,
            )
            counts["reservation_expiring"] += created

        # -------------------------------------------------------------------------
        # Summary Reporting
        # -------------------------------------------------------------------------
        total_created = sum(counts.values())
        verb = "Would create" if dry_run else "Created"
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}{verb} {total_created} notification(s):\n"
                f"  - Service due soon: {counts['service_due']}\n"
                f"  - Service overdue: {counts['service_overdue']}\n"
                f"  - Warranty expiring: {counts['warranty_expiring']}\n"
                f"  - Reservation expiring: {counts['reservation_expiring']}"
            )
        )
