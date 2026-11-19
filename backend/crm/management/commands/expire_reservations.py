"""
expire_reservations management command
=======================================

Expires quotation unit reservations whose reservation_expires_at has passed
and releases the associated VehicleUnit back to READY_FOR_SALE.

Scheduling
----------
Run this command periodically (e.g., once per hour) via your scheduler of choice:

  cron (Linux/macOS)
  ------------------
  0 * * * * /path/to/venv/bin/python /path/to/manage.py expire_reservations >> /var/log/ev_os_expire.log 2>&1

  Windows Task Scheduler
  ----------------------
  Create a Basic Task that runs:
    Program: C:\\path\\to\\venv\\Scripts\\python.exe
    Arguments: C:\\path\\to\\manage.py expire_reservations

  Celery beat (if you add Celery later)
  --------------------------------------
  CELERY_BEAT_SCHEDULE = {
      'expire-reservations': {
          'task': 'crm.tasks.expire_reservations',
          'schedule': crontab(minute=0),  # every hour
      },
  }
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Expire quotation unit reservations that have passed their reservation_expires_at "
        "and release the associated VehicleUnit back to READY_FOR_SALE."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Show what would be expired without making any changes.",
        )

    def handle(self, *args, **options):
        from common.lock import CommandAlreadyRunningError, command_lock

        try:
            with command_lock("expire_reservations"):
                self._handle_locked(*args, **options)
        except CommandAlreadyRunningError:
            self.stdout.write(self.style.WARNING("expire_reservations is already running. Skipping this cycle."))
            return

    def _handle_locked(self, *args, **options):
        from crm.models import Quotation
        from crm.services.pipeline import handle_quotation_rejection_or_expiry
        from inventory.models import VehicleUnit

        dry_run = options["dry_run"]
        now = timezone.now()

        # --- Part 1: Quotation-linked reservations ---
        expired_qs = Quotation.objects.filter(
            reservation_expires_at__lte=now,
            reserved_unit__isnull=False,
        ).exclude(
            status__in=[Quotation.Status.REJECTED, Quotation.Status.EXPIRED]
        ).select_related("reserved_unit", "lead", "customer")

        qt_count = expired_qs.count()

        # --- Part 2: Direct (non-quotation) unit reservations ---
        direct_qs = VehicleUnit.objects.filter(
            status=VehicleUnit.Status.RESERVED,
            reservation_expires_at__lte=now,
        )
        direct_count = direct_qs.count()

        total = qt_count + direct_count
        if total == 0:
            self.stdout.write("No expired reservations found.")
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] {total} reservation(s) would be expired:"))
            for qt in expired_qs:
                self.stdout.write(
                    f"  [Quotation] {qt.display_id} | Unit {qt.reserved_unit.vin_chassis_no} "
                    f"| Expired at {qt.reservation_expires_at}"
                )
            for unit in direct_qs:
                self.stdout.write(
                    f"  [Direct]    Unit {unit.vin_chassis_no} | Expired at {unit.reservation_expires_at}"
                )
            return

        expired_count = 0
        error_count = 0

        for qt in expired_qs:
            try:
                with transaction.atomic():
                    qt.status = Quotation.Status.EXPIRED
                    qt.save(update_fields=["status", "updated_at"])
                    handle_quotation_rejection_or_expiry(qt, user=None)
                expired_count += 1
                logger.info(
                    "Expired reservation: quotation=%s unit=%s",
                    qt.display_id,
                    qt.reserved_unit.vin_chassis_no if qt.reserved_unit else "none",
                )
                try:
                    from common.notifications import notify_reservation_expired
                    notify_reservation_expired(qt)
                except Exception:
                    logger.exception("Failed to dispatch expiration notification for quotation %s", qt.display_id)
            except Exception:
                error_count += 1
                logger.exception("Failed to expire reservation for quotation %s", qt.display_id)

        for unit in direct_qs:
            try:
                with transaction.atomic():
                    unit.status = VehicleUnit.Status.READY_FOR_SALE
                    unit.reservation_expires_at = None
                    unit.save(update_fields=["status", "reservation_expires_at", "updated_at"])
                expired_count += 1
                logger.info("Released direct reservation for unit %s", unit.vin_chassis_no)
                try:
                    from common.notifications import notify_reservation_expired
                    notify_reservation_expired(unit)
                except Exception:
                    logger.exception("Failed to dispatch expiration notification for direct unit %s", unit.vin_chassis_no)
            except Exception:
                error_count += 1
                logger.exception("Failed to release direct reservation for unit %s", unit.vin_chassis_no)

        msg = f"Expired {expired_count} reservation(s)."
        if error_count:
            msg += f" {error_count} error(s) encountered (see logs)."
            self.stdout.write(self.style.ERROR(msg))
        else:
            self.stdout.write(self.style.SUCCESS(msg))

