import csv
import io

from django.http import HttpResponse
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action

from .models import AttendanceRecord
from .permissions import AttendanceRecordPermission, can_view_all
from .serializers import AttendanceRecordSerializer


class AttendanceRecordViewSet(viewsets.ModelViewSet):
    """Clock-in/out log. Non-managers only ever see their own rows."""

    serializer_class = AttendanceRecordSerializer
    permission_classes = [AttendanceRecordPermission]

    def get_queryset(self):
        qs = AttendanceRecord.objects.select_related("user").all()
        if not can_view_all(self.request.user):
            qs = qs.filter(user=self.request.user)
        params = self.request.query_params
        user = params.get("user")
        if user:
            qs = qs.filter(user_id=user)
        type_filter = params.get("type")
        if type_filter:
            qs = qs.filter(type=type_filter)
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None
        if date_from:
            qs = qs.filter(timestamp__date__gte=date_from)
        if date_to:
            qs = qs.filter(timestamp__date__lte=date_to)
        return qs.order_by("-timestamp", "-id")

    @action(detail=False, methods=["get"])
    def export(self, request):
        """CSV export of the (permission-scoped, filtered) log.

        Mirrors the events bulk-template CSV response pattern.
        """
        rows = self.filter_queryset(self.get_queryset())
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["timestamp", "username", "full_name", "type", "confidence_score", "device", "location"]
        )
        for r in rows:
            writer.writerow(
                [
                    r.timestamp.isoformat(),
                    r.user.username,
                    r.user.get_full_name() or r.user.username,
                    r.type,
                    r.confidence_score if r.confidence_score is not None else "",
                    r.device,
                    r.location,
                ]
            )
        resp = HttpResponse(output.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="attendance-export.csv"'
        return resp
