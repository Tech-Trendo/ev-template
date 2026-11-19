import datetime
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import HasRolePermission
from common.models import AuditLog, log_audit_event
from hrm.calendar import (
    WEEKDAY_NAMES,
    CalendarRangeError,
    ad_to_bs,
    bs_to_ad,
    calendar_window,
    format_ad,
    format_bs,
    load_calendar,
    manual_year_lengths,
    month_name,
    supported_range,
)
from hrm.models import HRCalendarPolicy
from hrm.months import get_hr_month_for_date, hr_month_span, period_start, _shift_month


def _as_validation_error(exc: Exception) -> ValidationError:
    if isinstance(exc, ValidationError):
        return exc
    detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
    return ValidationError(detail)


def _policy_payload(policy: HRCalendarPolicy) -> dict:
    return {
        "id": policy.id,
        "month_mode": policy.month_mode,
        "month_mode_display": policy.get_month_mode_display(),
        "custom_start_day": policy.custom_start_day,
        "weekly_off_days": policy.weekly_off_days,
        "fiscal_year_start_month": policy.fiscal_year_start_month,
        "fiscal_year_start_month_name": month_name(policy.fiscal_year_start_month),
        "fiscal_year_start_day": policy.fiscal_year_start_day,
        "hours_per_day": str(policy.hours_per_day),
        "effective_from": policy.effective_from.isoformat(),
        "note": policy.note,
        "created_at": policy.created_at.isoformat() if policy.created_at else None,
    }


def _draft_from_data(data, base: HRCalendarPolicy | None = None) -> HRCalendarPolicy:
    """Unsaved policy used only for boundary maths."""
    hours = data.get("hours_per_day")
    if hours in (None, "") and base is not None:
        hours = base.hours_per_day
    draft = HRCalendarPolicy(
        month_mode=data.get("month_mode") or (base.month_mode if base else HRCalendarPolicy.MonthMode.BS_MONTH),
        custom_start_day=int(data.get("custom_start_day") or (base.custom_start_day if base else 1)),
        weekly_off_days=data.get("weekly_off_days") if "weekly_off_days" in data else (base.weekly_off_days if base else ["saturday"]),
        fiscal_year_start_month=int(data.get("fiscal_year_start_month") or (base.fiscal_year_start_month if base else 4)),
        fiscal_year_start_day=int(data.get("fiscal_year_start_day") or (base.fiscal_year_start_day if base else 1)),
        hours_per_day=Decimal(str(hours or 8)),
        effective_from=datetime.date(1918, 4, 13),
    )
    draft.clean()
    return draft


def _current_and_next(policy, today: datetime.date) -> dict:
    current = get_hr_month_for_date(today, policy)
    start_day = 1 if policy.month_mode == HRCalendarPolicy.MonthMode.BS_MONTH else policy.custom_start_day
    next_year, next_month = _shift_month(current.bs_year, current.bs_month, 1)
    nxt = hr_month_span(next_year, next_month, start_day)
    return {"current": current.as_dict(), "next": nxt.as_dict()}


class HRSettingsViewSet(viewsets.ViewSet):
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["hrm.manage_hr_settings"],
        "create": ["hrm.manage_hr_settings"],
        "preview": ["hrm.manage_hr_settings"],
        "default": ["hrm.manage_hr_settings"],
    }

    def list(self, request):
        today = timezone.localdate()
        current = (
            HRCalendarPolicy.objects.filter(effective_from__lte=today).order_by("-effective_from", "-id").first()
        )
        if current is None:
            current = HRCalendarPolicy.objects.order_by("effective_from", "id").first()
        versions = HRCalendarPolicy.objects.order_by("-effective_from", "-id")[:12]
        payload = {
            "policy": _policy_payload(current) if current else None,
            "versions": [_policy_payload(row) for row in versions],
            "weekdays": list(WEEKDAY_NAMES),
            "months": [{"value": index, "label": month_name(index)} for index in range(1, 13)],
        }
        if current is not None:
            payload.update(_current_and_next(current, today))
        payload["calendar_window"] = calendar_window(today)
        return Response(payload)

    def create(self, request):
        try:
            draft = _draft_from_data(request.data)
            policy = self._save_version(request, draft)
        except (CalendarRangeError, DjangoValidationError, ValidationError, ValueError, TypeError, KeyError) as exc:
            raise _as_validation_error(exc)
        return Response(_policy_payload(policy), status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def preview(self, request):
        today = timezone.localdate()
        current = (
            HRCalendarPolicy.objects.filter(effective_from__lte=today).order_by("-effective_from", "-id").first()
        )
        try:
            draft = _draft_from_data(request.data, current)
            body = _current_and_next(draft, today)
            if request.data.get("effective_bs_year") and request.data.get("effective_bs_month"):
                start_day = 1 if draft.month_mode == HRCalendarPolicy.MonthMode.BS_MONTH else draft.custom_start_day
                start = period_start(
                    int(request.data["effective_bs_year"]),
                    int(request.data["effective_bs_month"]),
                    start_day,
                )
                body["effective_from"] = start.isoformat()
                body["effective_from_label"] = {"bs": format_bs(ad_to_bs(start)), "ad": format_ad(start)}
            sample_raw = request.data.get("sample_date")
            if sample_raw:
                sample = datetime.date.fromisoformat(str(sample_raw))
                body["sample"] = get_hr_month_for_date(sample, draft).as_dict()
        except (CalendarRangeError, DjangoValidationError, ValidationError, ValueError, TypeError, KeyError) as exc:
            raise _as_validation_error(exc)
        return Response(body)

    def _save_version(self, request, draft: HRCalendarPolicy) -> HRCalendarPolicy:
        from hrm.months import add_policy_version

        year = int(request.data["effective_bs_year"])
        month = int(request.data["effective_bs_month"])
        policy = add_policy_version(
            effective_bs_year=year,
            effective_bs_month=month,
            today=timezone.localdate(),
            month_mode=draft.month_mode,
            custom_start_day=draft.custom_start_day,
            weekly_off_days=draft.weekly_off_days,
            fiscal_year_start_month=draft.fiscal_year_start_month,
            fiscal_year_start_day=draft.fiscal_year_start_day,
            hours_per_day=draft.hours_per_day,
            note=str(request.data.get("note") or ""),
            created_by=request.user if request.user.is_authenticated else None,
        )
        log_audit_event(
            instance=policy,
            action=AuditLog.Action.CREATE,
            changed_by=request.user,
            source="HR_SETTINGS",
            summary=(
                f"HR calendar settings scheduled from {policy.effective_from.isoformat()} "
                f"({policy.get_month_mode_display()})"
            ),
            new_value=_policy_payload(policy),
        )
        return policy


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def calendar_data(request):
    """The one month-length table, for the frontend date picker."""
    data = load_calendar()
    start, end = supported_range()
    months = {str(year): lengths for year, lengths in data["months"].items()}
    manual = manual_year_lengths()
    for year, lengths in manual.items():
        if year > int(data["max_year"]):
            months[str(year)] = lengths
    return Response(
        {
            "epoch_bs": list(data["epoch_bs"]),
            "epoch_ad": data["epoch_ad"].isoformat(),
            "min_year": data["min_year"],
            "max_year": end.year,
            "verified_max_year": data["max_year"],
            "min_ad": bs_to_ad(start.year, start.month, start.day).isoformat(),
            "max_ad": bs_to_ad(end.year, end.month, end.day).isoformat(),
            "month_names": list(data.get("month_names") or []),
            "months": months,
            "manual_years": [
                {"year": year, "month_lengths": lengths, "source": "entered manually"}
                for year, lengths in sorted(manual.items())
            ],
            "sources": data.get("sources", []),
        }
    )


class BSYearOverrideViewSet(viewsets.ViewSet):
    """Super Admin enters official month lengths for years after the verified window."""

    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["hrm.manage_hr_settings"],
        "create": ["hrm.manage_hr_settings"],
        "destroy": ["hrm.manage_hr_settings"],
        "from_api": ["hrm.manage_hr_settings"],
    }

    def _super(self, request):
        from accounts.models import user_is_super_admin

        if request.user.is_superuser or user_is_super_admin(request.user):
            return None
        return Response({"detail": "Only a Super Admin can enter official BS month lengths."}, status=status.HTTP_403_FORBIDDEN)

    def list(self, request):
        from hrm.models import BSYearOverride

        denied = self._super(request)
        if denied and not request.user.is_superuser:
            # HR can see the window; only Super Admin sees the entry form data fully.
            # Listing the years is useful for the warning screen, so allow manage_hr_settings.
            pass
        rows = BSYearOverride.objects.select_related("entered_by")
        return Response(
            [
                {
                    "year": row.year,
                    "month_lengths": row.month_lengths,
                    "note": row.note,
                    "entered_by": row.entered_by.get_username() if row.entered_by_id else "",
                    "entered_at": row.entered_at.isoformat(),
                    "source": row.source or BSYearOverride.SOURCE_MANUAL,
                }
                for row in rows
            ]
        )

    @action(detail=False, methods=["get"], url_path="from-api")
    def from_api(self, request):
        """Prefill BS month lengths from the free public Nepali calendar dataset."""
        from hrm.calendar import covered_max_year
        from hrm.nepali_calendar_api import (
            NepaliCalendarApiError,
            clear_community_dataset_cache,
            fetch_bs_year_month_lengths,
        )

        denied = self._super(request)
        if denied:
            return denied
        raw_year = request.query_params.get("year")
        try:
            year = int(raw_year) if raw_year not in (None, "") else covered_max_year() + 1
            # Explicit refresh so revised upstream data is visible without a process restart.
            clear_community_dataset_cache()
            payload = fetch_bs_year_month_lengths(year)
        except (CalendarRangeError, NepaliCalendarApiError, ValueError, TypeError) as exc:
            raise _as_validation_error(exc)
        return Response(payload)

    def create(self, request):
        from hrm.models import BSYearOverride

        denied = self._super(request)
        if denied:
            return denied
        try:
            year = int(request.data["year"])
            note = str(request.data.get("note") or "")
            source_label = str(request.data.get("source_label") or "").strip()
            source = (
                BSYearOverride.SOURCE_API
                if source_label or str(request.data.get("source") or "").strip().lower() == "api"
                else BSYearOverride.SOURCE_MANUAL
            )
            if source_label and source_label.lower() not in note.lower():
                note = f"{note} · {source_label}".strip(" ·") if note else f"Imported from {source_label}"
            row = BSYearOverride(
                year=year,
                month_lengths=request.data.get("month_lengths"),
                note=note,
                source=source,
                entered_by=request.user,
            )
            existing = BSYearOverride.objects.filter(year=year).first()
            if existing:
                existing.month_lengths = row.month_lengths
                existing.note = row.note
                existing.source = row.source
                existing.clean()
                existing.save()
                saved = existing
                action = AuditLog.Action.UPDATE
            else:
                row.clean()
                row.save()
                saved = row
                action = AuditLog.Action.CREATE
        except (CalendarRangeError, DjangoValidationError, ValidationError, ValueError, TypeError, KeyError) as exc:
            raise _as_validation_error(exc)
        summary_source = "from API" if saved.source == BSYearOverride.SOURCE_API else "manually"
        log_audit_event(
            instance=saved,
            action=action,
            changed_by=request.user,
            source="HR_CALENDAR",
            summary=f"Official BS {saved.year} month lengths entered {summary_source}.",
            new_value={
                "year": saved.year,
                "month_lengths": saved.month_lengths,
                "note": saved.note,
                "source": saved.source,
            },
        )
        return Response(
            {
                "year": saved.year,
                "month_lengths": saved.month_lengths,
                "source": saved.source or BSYearOverride.SOURCE_MANUAL,
                "note": saved.note,
            },
            status=status.HTTP_200_OK if action == AuditLog.Action.UPDATE else status.HTTP_201_CREATED,
        )

    def destroy(self, request, pk=None):
        from hrm.calendar import covered_max_year, load_calendar
        from hrm.models import BSYearOverride

        denied = self._super(request)
        if denied:
            return denied
        row = BSYearOverride.objects.filter(year=pk).first()
        if row is None:
            return Response({"detail": "That BS year has not been entered."}, status=status.HTTP_404_NOT_FOUND)
        if row.year != covered_max_year() or row.year <= load_calendar()["max_year"]:
            return Response(
                {"detail": "Only the latest manual year can be removed, so the calendar does not gain a gap."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        year = row.year
        row.delete()
        log_audit_event(
            action=AuditLog.Action.DELETE,
            changed_by=request.user,
            source="HR_CALENDAR",
            summary=f"Removed manually entered BS {year} month lengths.",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
