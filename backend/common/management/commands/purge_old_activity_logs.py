"""
purge_old_activity_logs management command
==========================================

Deletes AuditLog entries older than the configured retention period
(default: 60 days, configurable via ACTIVITY_LOG_RETENTION_DAYS setting).

Scheduling:
-----------
Run this command daily via cron or Windows Task Scheduler:
  python manage.py purge_old_activity_logs [--dry-run] [--days 60]
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from common.models import AuditLog

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Purge AuditLog and staff activity records older than the retention period "
        "(defaults to settings.ACTIVITY_LOG_RETENTION_DAYS or 60 days)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Simulate and report how many records would be deleted without removing them.",
        )
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="Override retention threshold in days (e.g. --days 30).",
        )

    def handle(self, *args, **options):
        from common.lock import CommandAlreadyRunningError, command_lock

        try:
            with command_lock("purge_old_activity_logs"):
                self._handle_locked(*args, **options)
        except CommandAlreadyRunningError:
            self.stdout.write(
                self.style.WARNING(
                    "purge_old_activity_logs is already running. Skipping this cycle."
                )
            )

    def _handle_locked(self, *args, **options):
        dry_run: bool = options["dry_run"]
        days_arg = options.get("days")
        retention_days = (
            days_arg
            if days_arg is not None
            else getattr(settings, "ACTIVITY_LOG_RETENTION_DAYS", 60)
        )

        cutoff = timezone.now() - timedelta(days=retention_days)
        qs = AuditLog.objects.filter(timestamp__lt=cutoff)
        count = qs.count()

        if dry_run:
            self.stdout.write(
                f"[DRY-RUN] Would delete {count} audit log record(s) older than {retention_days} days (prior to {cutoff.isoformat()})."
            )
            return

        # Ensure daily activity rollups are computed before deleting audit logs
        from django.db import models
        from common.services.rollup import rollup_daily_activity

        dates_to_rollup = sorted(
            filter(
                None,
                set(
                    qs.annotate(d=models.functions.TruncDate("timestamp"))
                    .values_list("d", flat=True)
                    .distinct()
                ),
            )
        )
        for d in dates_to_rollup:
            rollup_daily_activity(start_date=d, end_date=d)

        deleted_count, _ = qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully purged {deleted_count} audit log record(s) older than {retention_days} days (prior to {cutoff.isoformat()}). Rolled up {len(dates_to_rollup)} date(s)."
            )
        )
