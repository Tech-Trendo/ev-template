"""
Team and individual performance views.
Provides daily and range aggregations, audit drilldown, CSV export with print tracking,
and personal "my-activity" feeds. Strictly dealer-scoped.
"""

from __future__ import annotations

import csv
import datetime
from collections import defaultdict
from typing import Any, Dict, List, Optional

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import role_is_dealer_scoped, user_has_perm, user_is_super_admin
from common.models import AuditLog, DailyActivityRollup, record_print_event
from common.services.rollup import rollup_daily_activity

User = get_user_model()


def get_scoped_dealer_id(user: Any) -> Optional[int]:
    """
    Returns home dealer id if the user has a dealer-scoped role.
    Returns -1 if the user has a dealer-scoped role but NO home dealer assigned (edge case).
    Returns None if the user is a superuser or central staff (can see all).
    """
    if not user or not user.is_authenticated:
        return -1
    if user.is_superuser:
        return None

    profile = getattr(user, "profile", None)
    if not profile:
        return None

    has_dealer_role = profile.roles.filter(is_dealer_role=True).exists() or any(
        role_is_dealer_scoped(r) for r in profile.roles.all()
    )
    if has_dealer_role:
        return profile.dealer_id if profile.dealer_id is not None else -1
    return None


class DailyPerformanceView(APIView):
    """
    GET /api/performance/daily/?date=YYYY-MM-DD[&dealer=<id>][&user_id=<id>]
    Returns per-employee metrics for a specific date with optional audit drilldown.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_str = request.query_params.get("date")
        target_date = parse_date(date_str) if date_str else timezone.localdate()
        if not target_date:
            target_date = timezone.localdate()

        scoped_dealer = get_scoped_dealer_id(request.user)
        dealer_param = request.query_params.get("dealer")
        filter_user_id = request.query_params.get("user_id")

        if scoped_dealer == -1:
            # Dealer-less user sees empty data
            return Response({
                "date": str(target_date),
                "users": [],
                "total_actions": 0,
                "drilldown": [],
            })

        effective_dealer_id = scoped_dealer if scoped_dealer is not None else (
            int(dealer_param) if dealer_param and dealer_param.isdigit() else None
        )

        # Refresh rollup for target date if it's today or recent (within last 3 days)
        if target_date >= timezone.localdate() - datetime.timedelta(days=3):
            rollup_daily_activity(
                start_date=target_date,
                end_date=target_date,
                dealer_id=effective_dealer_id,
            )

        qs = DailyActivityRollup.objects.filter(date=target_date)
        if effective_dealer_id is not None:
            qs = qs.filter(Q(dealer_id=effective_dealer_id) | Q(user__profile__dealer_id=effective_dealer_id))

        if filter_user_id and filter_user_id.isdigit():
            qs = qs.filter(user_id=int(filter_user_id))

        # Build user aggregation map
        user_metrics: Dict[int, Dict[str, Any]] = {}
        rollups = qs.select_related("user", "user__profile", "user__profile__dealer", "dealer")

        for r in rollups:
            u = r.user
            if u.id not in user_metrics:
                role_names = [role.name for role in u.profile.roles.all()] if hasattr(u, "profile") else []
                d_name = (
                    r.dealer.name
                    if r.dealer
                    else (u.profile.dealer.name if hasattr(u, "profile") and u.profile.dealer else "Central Office")
                )
                user_metrics[u.id] = {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.get_full_name() or u.username,
                    "roles": role_names,
                    "role": role_names[0] if role_names else "Staff",
                    "dealer_id": r.dealer_id or (u.profile.dealer_id if hasattr(u, "profile") else None),
                    "dealer_name": d_name,
                    "counts": {
                        "LEAD_CREATED": 0,
                        "CUSTOMER_CREATED": 0,
                        "QUOTATION_CREATED": 0,
                        "QUOTATION_EDITED": 0,
                        "QUOTATION_REVISED": 0,
                        "SALE_RECORDED": 0,
                        "TEST_DRIVE_COMPLETED": 0,
                        "SERVICE_CREATED": 0,
                        "SERVICE_COMPLETED": 0,
                        "INSPECTION_DONE": 0,
                        "INSPECTION_COMPLETED": 0,
                        "VEI_COMPLETED": 0,
                        "PDI_COMPLETED": 0,
                        "UNIT_ENTERED": 0,
                        "DOCUMENT_UPLOADED": 0,
                        "LOGIN": 0,
                    },
                    "total_actions": 0,
                }

            user_metrics[u.id]["counts"][r.action_type] = r.count
            user_metrics[u.id]["total_actions"] += r.count

        user_list = sorted(user_metrics.values(), key=lambda x: x["total_actions"], reverse=True)
        overall_total = sum(u["total_actions"] for u in user_list)

        # Drilldown activity items
        drilldown = []
        can_drilldown = filter_user_id and filter_user_id.isdigit() and (
            int(filter_user_id) == request.user.id
            or user_is_super_admin(request.user)
            or user_has_perm(request.user, "common.view_auditlog")
        )
        if can_drilldown:
            logs = AuditLog.objects.filter(
                timestamp__date=target_date,
                changed_by_id=int(filter_user_id),
            ).order_by("-timestamp")[:100]
            for l in logs:
                ct = l.content_type.model if l.content_type else "object"
                drilldown.append({
                    "id": l.id,
                    "timestamp": l.timestamp.isoformat(),
                    "action": l.action,
                    "source": l.source,
                    "object_type": ct,
                    "object_id": l.object_id,
                    "summary": l.summary or f"{l.action} on {ct} #{l.object_id}",
                })

        return Response({
            "date": str(target_date),
            "users": user_list,
            "total_actions": overall_total,
            "drilldown": drilldown,
        })


class RangePerformanceView(APIView):
    """
    GET /api/performance/range/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD[&dealer=<id>][&role=<name>]
    Returns aggregate performance metrics across a date range with daily trends.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")

        date_from = parse_date(date_from_str) if date_from_str else (today - datetime.timedelta(days=30))
        date_to = parse_date(date_to_str) if date_to_str else today
        if not date_from or not date_to or date_from > date_to:
            date_from = today - datetime.timedelta(days=30)
            date_to = today

        scoped_dealer = get_scoped_dealer_id(request.user)
        dealer_param = request.query_params.get("dealer")
        role_param = request.query_params.get("role")

        if scoped_dealer == -1:
            return Response({
                "date_from": str(date_from),
                "date_to": str(date_to),
                "users": [],
                "trend": [],
                "action_breakdown": {},
                "total_actions": 0,
            })

        effective_dealer_id = scoped_dealer if scoped_dealer is not None else (
            int(dealer_param) if dealer_param and dealer_param.isdigit() else None
        )

        qs = DailyActivityRollup.objects.filter(date__gte=date_from, date__lte=date_to)
        if effective_dealer_id is not None:
            qs = qs.filter(Q(dealer_id=effective_dealer_id) | Q(user__profile__dealer_id=effective_dealer_id))

        if role_param:
            qs = qs.filter(user__profile__roles__name__iexact=role_param)

        rollups = qs.select_related("user", "user__profile", "user__profile__dealer", "dealer")

        user_metrics: Dict[int, Dict[str, Any]] = {}
        daily_trends: Dict[str, int] = defaultdict(int)
        action_breakdown: Dict[str, int] = defaultdict(int)

        for r in rollups:
            u = r.user
            if u.id not in user_metrics:
                role_names = [role.name for role in u.profile.roles.all()] if hasattr(u, "profile") else []
                d_name = (
                    r.dealer.name
                    if r.dealer
                    else (u.profile.dealer.name if hasattr(u, "profile") and u.profile.dealer else "Central Office")
                )
                user_metrics[u.id] = {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.get_full_name() or u.username,
                    "roles": role_names,
                    "role": role_names[0] if role_names else "Staff",
                    "dealer_id": r.dealer_id or (u.profile.dealer_id if hasattr(u, "profile") else None),
                    "dealer_name": d_name,
                    "counts": defaultdict(int),
                    "total_actions": 0,
                }

            user_metrics[u.id]["counts"][r.action_type] += r.count
            user_metrics[u.id]["total_actions"] += r.count
            daily_trends[str(r.date)] += r.count
            action_breakdown[r.action_type] += r.count

        # Build continuous trend series
        trend_series = []
        c_date = date_from
        while c_date <= date_to:
            d_str = str(c_date)
            trend_series.append({
                "date": d_str,
                "count": daily_trends.get(d_str, 0),
            })
            c_date += datetime.timedelta(days=1)

        user_list = sorted(user_metrics.values(), key=lambda x: x["total_actions"], reverse=True)
        overall_total = sum(u["total_actions"] for u in user_list)

        return Response({
            "date_from": str(date_from),
            "date_to": str(date_to),
            "users": user_list,
            "trend": trend_series,
            "action_breakdown": dict(action_breakdown),
            "total_actions": overall_total,
        })


class ExportPerformanceCsvView(APIView):
    """
    GET /api/performance/export-csv/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD[&dealer=<id>]
    Exports rolled-up activity as CSV and records a print audit log.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        date_from_str = request.query_params.get("date_from")
        date_to_str = request.query_params.get("date_to")

        date_from = parse_date(date_from_str) if date_from_str else (today - datetime.timedelta(days=30))
        date_to = parse_date(date_to_str) if date_to_str else today
        if not date_from or not date_to or date_from > date_to:
            date_from = today - datetime.timedelta(days=30)
            date_to = today

        scoped_dealer = get_scoped_dealer_id(request.user)
        dealer_param = request.query_params.get("dealer")

        if scoped_dealer == -1:
            # Empty CSV
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="team_performance.csv"'
            writer = csv.writer(response)
            writer.writerow(["Date", "Employee", "Username", "Role", "Dealership", "Action Type", "Object Type", "Count"])
            return response

        effective_dealer_id = scoped_dealer if scoped_dealer is not None else (
            int(dealer_param) if dealer_param and dealer_param.isdigit() else None
        )

        qs = DailyActivityRollup.objects.filter(
            date__gte=date_from, date__lte=date_to, count__gt=0
        ).select_related("user", "user__profile", "user__profile__dealer", "dealer")

        if effective_dealer_id is not None:
            qs = qs.filter(Q(dealer_id=effective_dealer_id) | Q(user__profile__dealer_id=effective_dealer_id))

        # Record print/export event in AuditLog
        record_print_event(
            user=request.user,
            document_type="TEAM_PERFORMANCE_CSV",
            object_id=f"{date_from}_to_{date_to}",
            title=f"Team Performance CSV ({date_from} to {date_to})",
        )

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="team_performance_{date_from}_{date_to}.csv"'

        writer = csv.writer(response)
        writer.writerow(["Date", "Employee", "Username", "Role", "Dealership", "Action Type", "Object Type", "Count"])

        for r in qs.order_by("-date", "user__first_name"):
            u = r.user
            role_names = [role.name for role in u.profile.roles.all()] if hasattr(u, "profile") else []
            d_name = (
                r.dealer.name
                if r.dealer
                else (u.profile.dealer.name if hasattr(u, "profile") and u.profile.dealer else "Central Office")
            )
            writer.writerow([
                str(r.date),
                u.get_full_name() or u.username,
                u.username,
                role_names[0] if role_names else "Staff",
                d_name,
                r.action_type,
                r.object_type,
                r.count,
            ])

        return response


class MyActivityView(APIView):
    """
    GET /api/performance/my-activity/
    Returns recent activities and historical activity counts for the authenticated user.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        thirty_days_ago = today - datetime.timedelta(days=30)

        # Refresh today's activity
        rollup_daily_activity(start_date=today, end_date=today, user_id=user.id)

        # Action counts in last 30 days
        rollups = DailyActivityRollup.objects.filter(
            user=user,
            date__gte=thirty_days_ago,
            date__lte=today,
        )

        counts_by_action: Dict[str, int] = defaultdict(int)
        today_counts: Dict[str, int] = defaultdict(int)

        for r in rollups:
            counts_by_action[r.action_type] += r.count
            if r.date == today:
                today_counts[r.action_type] += r.count

        # Recent timeline from AuditLog
        recent_logs = AuditLog.objects.filter(changed_by=user).order_by("-timestamp")[:30]
        timeline = []
        for l in recent_logs:
            ct = l.content_type.model if l.content_type else "object"
            timeline.append({
                "id": l.id,
                "timestamp": l.timestamp.isoformat(),
                "action": l.action,
                "source": l.source,
                "object_type": ct,
                "object_id": l.object_id,
                "summary": l.summary or f"{l.action} on {ct} #{l.object_id}",
            })

        profile = getattr(user, "profile", None)
        d_name = profile.dealer.name if profile and profile.dealer else "Central Office"
        role_names = [r.name for r in profile.roles.all()] if profile else []

        return Response({
            "user_id": user.id,
            "username": user.username,
            "full_name": user.get_full_name() or user.username,
            "roles": role_names,
            "role": role_names[0] if role_names else "Staff",
            "dealer_name": d_name,
            "today_total": sum(today_counts.values()),
            "today_counts": dict(today_counts),
            "month_total": sum(counts_by_action.values()),
            "month_counts": dict(counts_by_action),
            "recent_activities": timeline,
        })
