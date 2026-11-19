"""
Daily activity rollup service.
Aggregates staff actions across business models and audit logs into DailyActivityRollup.
Idempotent and safe to run repeatedly or before audit log purges.
"""

from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from common.models import AuditLog, DailyActivityRollup
from crm.models import Customer, Document, Lead, Quotation, TestDrive
from inventory.models import ConditionReport, PDIInspection, Sale, VehicleUnit
from servicing.models import ServiceRecord

logger = logging.getLogger(__name__)


def _to_date(val: Any) -> datetime.date:
    if isinstance(val, datetime.date):
        return val
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, str):
        parsed = parse_date(val)
        if parsed:
            return parsed
    return timezone.localdate()


def rollup_daily_activity(
    start_date: Any = None,
    end_date: Any = None,
    user_id: Optional[int] = None,
    dealer_id: Optional[int] = None,
) -> int:
    """
    Rolls up activities into DailyActivityRollup for the given date range.
    Returns total number of rollup records created or updated.
    """
    s_date = _to_date(start_date) if start_date else timezone.localdate()
    e_date = _to_date(end_date) if end_date else s_date

    if s_date > e_date:
        s_date, e_date = e_date, s_date

    total_records = 0
    cur_date = s_date

    while cur_date <= e_date:
        total_records += _rollup_single_day(
            day=cur_date,
            user_id=user_id,
            dealer_id=dealer_id,
        )
        cur_date += datetime.timedelta(days=1)

    return total_records


def _rollup_single_day(
    day: datetime.date,
    user_id: Optional[int] = None,
    dealer_id: Optional[int] = None,
) -> int:
    """Computes and stores all activity counts for a single calendar day."""
    # Key: (user_id, dealer_id, action_type, object_type) -> count
    counts: Dict[Tuple[int, Optional[int], str, str], int] = defaultdict(int)

    # 1. Leads Created
    lead_qs = Lead.objects.filter(created_at__date=day, created_by__isnull=False)
    if user_id:
        lead_qs = lead_qs.filter(created_by_id=user_id)
    if dealer_id:
        lead_qs = lead_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in lead_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "LEAD_CREATED", "lead")] += it["c"]

    # 2. Customers Created
    cust_qs = (
        Customer.objects.filter(created_at__date=day, created_by__isnull=False)
        .exclude(source="historical import")
    )
    if user_id:
        cust_qs = cust_qs.filter(created_by_id=user_id)
    if dealer_id:
        cust_qs = cust_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in cust_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "CUSTOMER_CREATED", "customer")] += it["c"]

    # 3. Quotations Created (revision 0)
    q_create_qs = Quotation.objects.filter(
        created_at__date=day, created_by__isnull=False, revision_number=0
    )
    if user_id:
        q_create_qs = q_create_qs.filter(created_by_id=user_id)
    if dealer_id:
        q_create_qs = q_create_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in q_create_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "QUOTATION_CREATED", "quotation")] += it["c"]

    # 4. Quotations Revised (revision > 0)
    q_rev_qs = Quotation.objects.filter(
        created_at__date=day, created_by__isnull=False, revision_number__gt=0
    )
    if user_id:
        q_rev_qs = q_rev_qs.filter(created_by_id=user_id)
    if dealer_id:
        q_rev_qs = q_rev_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in q_rev_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "QUOTATION_REVISED", "quotation")] += it["c"]

    # 5. Quotations Edited (from AuditLog)
    q_edit_qs = AuditLog.objects.filter(
        content_type__model="quotation",
        action=AuditLog.Action.UPDATE,
        timestamp__date=day,
        changed_by__isnull=False,
    )
    if user_id:
        q_edit_qs = q_edit_qs.filter(changed_by_id=user_id)
    if dealer_id:
        q_edit_qs = q_edit_qs.filter(changed_by__profile__dealer_id=dealer_id)
    for it in q_edit_qs.values("changed_by_id", "changed_by__profile__dealer_id").annotate(c=Count("id")):
        counts[(it["changed_by_id"], it["changed_by__profile__dealer_id"], "QUOTATION_EDITED", "quotation")] += it["c"]

    # 6. Sales Recorded
    sale_qs = (
        Sale.objects.filter(created_at__date=day, created_by__isnull=False)
        .exclude(source="historical import")
    )
    if user_id:
        sale_qs = sale_qs.filter(created_by_id=user_id)
    if dealer_id:
        sale_qs = sale_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in sale_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "SALE_RECORDED", "sale")] += it["c"]

    # 7. Test Drives Completed
    td_qs = TestDrive.objects.filter(date=day, status="completed", created_by__isnull=False)
    if user_id:
        td_qs = td_qs.filter(created_by_id=user_id)
    if dealer_id:
        td_qs = td_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in td_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "TEST_DRIVE_COMPLETED", "test_drive")] += it["c"]

    # 8. Servicing Jobs Created
    srv_create_qs = (
        ServiceRecord.objects.filter(created_at__date=day, created_by__isnull=False)
        .exclude(source="historical import")
    )
    if user_id:
        srv_create_qs = srv_create_qs.filter(created_by_id=user_id)
    if dealer_id:
        srv_create_qs = srv_create_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in srv_create_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "SERVICE_CREATED", "service_record")] += it["c"]

    # 9. Servicing Jobs Completed
    srv_comp_qs = (
        ServiceRecord.objects.filter(
            date_completed=day, status__in=["completed", "delivered"]
        )
        .exclude(source="historical import")
    )
    if user_id:
        srv_comp_qs = srv_comp_qs.filter(Q(technician_id=user_id) | Q(created_by_id=user_id))
    if dealer_id:
        srv_comp_qs = srv_comp_qs.filter(dealer_id=dealer_id)
    for it in srv_comp_qs.values(
        "technician_id",
        "created_by_id",
        "dealer_id",
        "technician__profile__dealer_id",
        "created_by__profile__dealer_id",
    ).annotate(c=Count("id")):
        u_id = it["technician_id"] or it["created_by_id"]
        d_id = it["dealer_id"] or it["technician__profile__dealer_id"] or it["created_by__profile__dealer_id"]
        if u_id:
            counts[(u_id, d_id, "SERVICE_COMPLETED", "service_record")] += it["c"]

    # 10. Inspections Done (PDI + VEI + Condition Reports)
    insp_qs = PDIInspection.objects.filter(inspection_date=day)
    if user_id:
        insp_qs = insp_qs.filter(Q(checked_by_user_id=user_id) | Q(created_by_id=user_id))
    for it in insp_qs.values(
        "checked_by_user_id",
        "created_by_id",
        "vehicle__dealer_id",
        "checked_by_user__profile__dealer_id",
        "created_by__profile__dealer_id",
        "inspection_type",
    ).annotate(c=Count("id")):
        u_id = it["checked_by_user_id"] or it["created_by_id"]
        d_id = (
            it["vehicle__dealer_id"]
            or it["checked_by_user__profile__dealer_id"]
            or it["created_by__profile__dealer_id"]
        )
        if u_id:
            insp_t = it["inspection_type"] or "PDI"
            if insp_t == "VEI":
                counts[(u_id, d_id, "VEI_COMPLETED", "vei")] += it["c"]
            else:
                counts[(u_id, d_id, "PDI_COMPLETED", "pdi")] += it["c"]
            counts[(u_id, d_id, "INSPECTION_COMPLETED", "inspection")] += it["c"]
            counts[(u_id, d_id, "INSPECTION_DONE", "inspection")] += it["c"]

    cr_qs = ConditionReport.objects.filter(report_date=day, created_by__isnull=False)
    if user_id:
        cr_qs = cr_qs.filter(created_by_id=user_id)
    for it in cr_qs.values(
        "created_by_id",
        "created_by__profile__dealer_id",
        "vehicle__dealer_id",
    ).annotate(c=Count("id")):
        u_id = it["created_by_id"]
        d_id = it["vehicle__dealer_id"] or it["created_by__profile__dealer_id"]
        if u_id:
            counts[(u_id, d_id, "INSPECTION_DONE", "inspection")] += it["c"]
            counts[(u_id, d_id, "INSPECTION_COMPLETED", "inspection")] += it["c"]

    # 11. Units Entered
    unit_qs = (
        VehicleUnit.objects.filter(created_at__date=day, created_by__isnull=False)
        .exclude(source="historical import")
    )
    if user_id:
        unit_qs = unit_qs.filter(created_by_id=user_id)
    if dealer_id:
        unit_qs = unit_qs.filter(Q(dealer_id=dealer_id) | Q(created_by__profile__dealer_id=dealer_id))
    for it in unit_qs.values("created_by_id", "dealer_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        d_id = it["dealer_id"] or it["created_by__profile__dealer_id"]
        counts[(it["created_by_id"], d_id, "UNIT_ENTERED", "vehicle_unit")] += it["c"]

    # 12. Documents Uploaded
    doc_qs = Document.objects.filter(created_at__date=day, created_by__isnull=False)
    if user_id:
        doc_qs = doc_qs.filter(created_by_id=user_id)
    if dealer_id:
        doc_qs = doc_qs.filter(created_by__profile__dealer_id=dealer_id)
    for it in doc_qs.values("created_by_id", "created_by__profile__dealer_id").annotate(c=Count("id")):
        counts[(it["created_by_id"], it["created_by__profile__dealer_id"], "DOCUMENT_UPLOADED", "document")] += it["c"]

    # 13. Logins (from AuditLog)
    login_qs = AuditLog.objects.filter(
        action=AuditLog.Action.LOGIN,
        timestamp__date=day,
        changed_by__isnull=False,
    )
    if user_id:
        login_qs = login_qs.filter(changed_by_id=user_id)
    if dealer_id:
        login_qs = login_qs.filter(changed_by__profile__dealer_id=dealer_id)
    for it in login_qs.values("changed_by_id", "changed_by__profile__dealer_id").annotate(c=Count("id")):
        counts[(it["changed_by_id"], it["changed_by__profile__dealer_id"], "LOGIN", "user")] += it["c"]

    # Check if AuditLog has been purged for this day
    audit_has_logs = AuditLog.objects.filter(timestamp__date=day).exists()

    record_count = 0
    with transaction.atomic():
        for (u_id, d_id, act_type, obj_type), cnt in counts.items():
            # If cnt is 0 and it's an audit-only action and audit logs were already purged, preserve positive count
            if cnt == 0 and not audit_has_logs and act_type in ("LOGIN", "QUOTATION_EDITED"):
                existing = _rollup_matches(u_id, d_id, day, act_type, obj_type).first()
                if existing and existing.count > 0:
                    continue

            _upsert_daily_rollup(u_id, d_id, day, act_type, obj_type, cnt)
            record_count += 1

    return record_count


def _rollup_matches(user_id, dealer_id, day, action_type, object_type):
    """Match rollup rows, treating NULL dealer as a real key (SQLite allows duplicate NULLs)."""
    qs = DailyActivityRollup.objects.filter(
        user_id=user_id,
        date=day,
        action_type=action_type,
        object_type=object_type,
    )
    if dealer_id is None:
        return qs.filter(dealer_id__isnull=True)
    return qs.filter(dealer_id=dealer_id)


def _upsert_daily_rollup(user_id, dealer_id, day, action_type, object_type, count):
    """Create/update a rollup row; collapse duplicate NULL-dealer rows from SQLite unique quirks."""
    matches = list(_rollup_matches(user_id, dealer_id, day, action_type, object_type))
    if not matches:
        DailyActivityRollup.objects.create(
            user_id=user_id,
            dealer_id=dealer_id,
            date=day,
            action_type=action_type,
            object_type=object_type,
            count=count,
        )
        return

    keep = matches[0]
    if len(matches) > 1:
        DailyActivityRollup.objects.filter(pk__in=[row.pk for row in matches[1:]]).delete()
    if keep.count != count:
        keep.count = count
        keep.save(update_fields=["count"])
