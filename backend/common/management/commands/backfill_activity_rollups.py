"""
backfill_activity_rollups management command
============================================

Backfills DailyActivityRollup records for staff activity and CRM events across past days.

Usage:
------
python manage.py backfill_activity_rollups --days 30
python manage.py backfill_activity_rollups --all
python manage.py backfill_activity_rollups --start-date 2026-01-01 --end-date 2026-03-31
"""

from __future__ import annotations

import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_date

from common.models import AuditLog
from common.services.rollup import rollup_daily_activity
from crm.models import Lead


class Command(BaseCommand):
    help = "Backfill DailyActivityRollup records across past dates."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=None,
            help="Number of past days to backfill (default: 30 if no dates provided).",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            default=False,
            help="Backfill from the earliest recorded event to today.",
        )
        parser.add_argument(
            "--start-date",
            type=str,
            default=None,
            help="Start date in YYYY-MM-DD format.",
        )
        parser.add_argument(
            "--end-date",
            type=str,
            default=None,
            help="End date in YYYY-MM-DD format.",
        )

    def handle(self, *args, **options):
        today = timezone.localdate()

        if options["all"]:
            # Find earliest date among AuditLog and Lead
            earliest_dates = []
            first_log = AuditLog.objects.order_by("timestamp").first()
            if first_log and first_log.timestamp:
                earliest_dates.append(first_log.timestamp.date())
            first_lead = Lead.objects.order_by("created_at").first()
            if first_lead and first_lead.created_at:
                earliest_dates.append(first_lead.created_at.date())

            start_date = min(earliest_dates) if earliest_dates else today - datetime.timedelta(days=30)
            end_date = today
        elif options["start_date"]:
            start_date = parse_date(options["start_date"]) or today
            end_date = parse_date(options["end_date"]) if options["end_date"] else today
        else:
            days = options["days"] or 30
            start_date = today - datetime.timedelta(days=days)
            end_date = today

        self.stdout.write(
            f"Backfilling activity rollups from {start_date} to {end_date}..."
        )

        total = rollup_daily_activity(start_date=start_date, end_date=end_date)
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully backfilled {total} DailyActivityRollup record(s)."
            )
        )
