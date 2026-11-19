import csv
import io
from datetime import datetime, time as dtime

from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from accounts.permissions import HasRolePermission
from .models import Event, EventVisitor, InterestLevel
from .serializers import EventSerializer, EventVisitorSerializer, InterestLevelSerializer


class InterestLevelViewSet(viewsets.ModelViewSet):
    queryset = InterestLevel.objects.all()
    serializer_class = InterestLevelSerializer
    perm_map = {
        "list": ["events.view_interestlevel"],
        "retrieve": ["events.view_interestlevel"],
        "create": ["events.add_interestlevel"],
        "update": ["events.change_interestlevel"],
        "partial_update": ["events.change_interestlevel"],
        "destroy": ["events.delete_interestlevel"],
        "default": ["events.view_interestlevel"],
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            # Public read for the visitor-form dropdown; writes need RBAC.
            return [AllowAny()]
        return [HasRolePermission()]

    def get_queryset(self):
        qs = InterestLevel.objects.all()
        # Support filtering by is_active
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.visitors.exists():
            return Response(
                {"detail": "Cannot delete interest level that is already in use by visitors."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    perm_map = {
        "list": ["events.view_event"],
        "retrieve": ["events.view_event"],
        "stats": ["events.view_event"],
        "create": ["events.add_event"],
        "update": ["events.change_event"],
        "partial_update": ["events.change_event"],
        "destroy": ["events.delete_event"],
        "default": ["events.view_event"],
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasRolePermission()]

    def get_queryset(self):
        qs = Event.objects.all().annotate(visitors_count_annotated=Count("visitors")).order_by("-start_date", "-id")
        # Possible filters? Search?
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)
        return qs

    def destroy(self, request, *args, **kwargs):
        # Cascading delete: event.visitors will be deleted via CASCADE
        # If project prefers prevent deletion when has visitors, we would block. But spec says Preferred: Delete event and its visitors if cascading is appropriate.
        # We will allow deletion (cascade). To be safe, we cascade.
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def stats(self, request, *args, **kwargs):
        event = self.get_object()
        visitors = event.visitors.all()

        level_counts = {
            row["interest_level_id"]: row["count"]
            for row in visitors.values("interest_level_id").annotate(count=Count("id"))
        }
        by_level = [
            {"id": level.id, "name": level.name, "count": level_counts.get(level.id, 0)}
            for level in InterestLevel.objects.order_by("id")
        ]
        unspecified_level = visitors.filter(interest_level__isnull=True).count()
        if unspecified_level:
            by_level.append({"id": None, "name": "Unspecified", "count": unspecified_level})

        by_vehicle = [
            {"id": row["vehicle_id"], "name": row["vehicle__name"], "count": row["count"]}
            for row in (
                visitors.filter(vehicle__isnull=False)
                .values("vehicle_id", "vehicle__name")
                .annotate(count=Count("id"))
                .order_by("-count", "vehicle__name")
            )
        ]
        unspecified_vehicle = visitors.filter(vehicle__isnull=True).count()
        if unspecified_vehicle:
            by_vehicle.append({"id": None, "name": "Unspecified", "count": unspecified_vehicle})

        return Response(
            {
                "total_visitors": visitors.count(),
                "by_interest_level": by_level,
                "by_vehicle": by_vehicle,
            }
        )


class EventVisitorPaginationMixin:
    """Manual pagination helper"""
    def paginate_queryset_custom(self, queryset):
        page = self.request.query_params.get("page")
        page_size = self.request.query_params.get("page_size") or self.request.query_params.get("pageSize")
        # If pagination params not provided, return None (no pagination)
        if page is None and page_size is None:
            # Check if frontend expects paginated? We'll support both; if no pagination params, return full list
            # But to avoid huge payload, we still support limit
            # If project uses pagination globally None, we keep None
            return None
        try:
            page = int(page) if page is not None else 1
            page_size = int(page_size) if page_size is not None else 20
        except ValueError:
            page = 1
            page_size = 20
        page_size = max(1, min(page_size, 100))
        total = queryset.count()
        start = (page - 1) * page_size
        end = start + page_size
        results = queryset[start:end]
        return {
            "results": results,
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
        }


class EventVisitorViewSet(viewsets.ModelViewSet, EventVisitorPaginationMixin):
    serializer_class = EventVisitorSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["events.view_eventvisitor"],
        "retrieve": ["events.view_eventvisitor"],
        "create": ["events.add_eventvisitor"],
        "update": ["events.change_eventvisitor"],
        "partial_update": ["events.change_eventvisitor"],
        "destroy": ["events.delete_eventvisitor"],
        "bulk_import": ["events.add_eventvisitor"],
        "bulk_template": ["events.view_eventvisitor"],
        "default": ["events.view_eventvisitor"],
    }

    def get_permissions(self):
        # Visitor data is sensitive: every action (including list) needs RBAC.
        return [HasRolePermission()]

    def get_queryset(self):
        event_pk = self.kwargs.get("event_pk")
        qs = EventVisitor.objects.all().select_related("interest_level", "vehicle", "event")
        if event_pk is not None:
            qs = qs.filter(event_id=event_pk)
        # Filtering
        params = self.request.query_params

        # Date filter: ?date=2026-09-10 or ?date_from & date_to
        date_str = params.get("date")
        date_from = params.get("date_from")
        date_to = params.get("date_to")

        # visited_at filtering: treat visited_at as datetime, filter by date part
        if date_str:
            d = parse_date(date_str)
            if d:
                qs = qs.filter(visited_at__date=d)
        else:
            d_from = parse_date(date_from) if date_from else None
            d_to = parse_date(date_to) if date_to else None
            if d_from and d_to:
                qs = qs.filter(visited_at__date__gte=d_from, visited_at__date__lte=d_to)
            elif d_from:
                qs = qs.filter(visited_at__date__gte=d_from)
            elif d_to:
                qs = qs.filter(visited_at__date__lte=d_to)

        # Interest level filter: ?interest_level=1 or ?interest_level=hot (name) or ?interest_level_id=
        interest = params.get("interest_level") or params.get("interest_level_id")
        if interest:
            # Try id first
            if str(interest).isdigit():
                qs = qs.filter(interest_level_id=int(interest))
            else:
                qs = qs.filter(interest_level__name__iexact=interest)

        # vehicle filter: ?vehicle=1
        vehicle = params.get("vehicle") or params.get("vehicle_id")
        if vehicle and str(vehicle).isdigit():
            qs = qs.filter(vehicle_id=int(vehicle))
        elif vehicle:
            # try name
            qs = qs.filter(vehicle__name__iexact=vehicle)

        # Search: ?search=ram  (name, phone, email, company, remarks, notes)
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(phone__icontains=search) |
                Q(email__icontains=search) |
                Q(company__icontains=search) |
                Q(remarks__icontains=search) |
                Q(notes__icontains=search)
            )

        # Ordering
        qs = qs.order_by("-visited_at", "-id")
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        return ctx

    def perform_create(self, serializer):
        event_pk = self.kwargs.get("event_pk")
        event = Event.objects.get(pk=event_pk)
        serializer.save(event=event)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        # Handle pagination if page params exist
        paginated = self.paginate_queryset_custom(queryset)
        if paginated is not None:
            serializer = self.get_serializer(paginated["results"], many=True)
            return Response({
                "count": paginated["count"],
                "next": None,  # simple
                "previous": None,
                "results": serializer.data,
                "page": paginated["page"],
                "page_size": paginated["page_size"],
                "total_pages": paginated["total_pages"],
            })
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="bulk-import",
            parser_classes=[MultiPartParser, FormParser],
            permission_classes=[HasRolePermission])
    def bulk_import(self, request, event_pk=None):
        """Bulk import visitors for an event from a CSV (.csv) or Excel (.xlsx/.xls) file.

        Expected columns (case-insensitive): name*, phone, email, company, address,
        notes, interest_level (id or name), vehicle (id or name),
        visited_at (optional).
        Phone may contain "/" to store two numbers, e.g. "9800000000/9800000001".
        Returns {total, created, failed, errors}.
        """
        try:
            event = Event.objects.get(pk=event_pk)
        except Event.DoesNotExist:
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "No file provided. Upload a CSV file in the 'file' field."},
                            status=status.HTTP_400_BAD_REQUEST)

        filename = (upload.name or "").lower()
        try:
            if filename.endswith(".csv"):
                rows = _parse_csv_file(upload)
            elif filename.endswith((".xlsx", ".xls")):
                rows = _parse_excel_file(upload)
            else:
                return Response(
                    {"detail": "Unsupported file type. Please upload a .csv file (or .xlsx)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if not rows:
            return Response({"detail": "The file contains no data rows."},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > 2000:
            return Response({"detail": "Too many rows (max 2000 per import)."},
                            status=status.HTTP_400_BAD_REQUEST)

        from vehicles.models import Vehicle

        created = 0
        errors: list[dict] = []
        for idx, raw in enumerate(rows, start=2):  # row 1 = header
            # skip fully empty rows
            if not any(str(v or "").strip() for v in raw.values()):
                continue
            data: dict = {}
            data["name"] = str(raw.get("name", "") or "").strip()
            data["phone"] = _normalize_phone(str(raw.get("phone", "") or ""))
            data["email"] = str(raw.get("email", "") or "").strip()
            data["company"] = str(raw.get("company", "") or "").strip()
            data["address"] = str(raw.get("address", "") or "").strip()
            data["notes"] = str(raw.get("notes", "") or "").strip()

            # interest_level: id or name; empty -> serializer defaults to Hot
            interest_raw = str(raw.get("interest_level", "") or "").strip()
            if interest_raw:
                level = None
                if interest_raw.isdigit():
                    level = InterestLevel.objects.filter(pk=int(interest_raw)).first()
                else:
                    level = InterestLevel.objects.filter(name__iexact=interest_raw).first()
                if level is None:
                    errors.append({"row": idx, "name": data["name"],
                                   "errors": {"interest_level": f"Unknown interest level '{interest_raw}'."}})
                    continue
                data["interest_level"] = level.pk
            # vehicle: id or name; empty -> None
            vehicle_raw = str(raw.get("vehicle", "") or "").strip()
            if vehicle_raw:
                vehicle = None
                if vehicle_raw.isdigit():
                    vehicle = Vehicle.objects.filter(pk=int(vehicle_raw)).first()
                else:
                    vehicle = Vehicle.objects.filter(name__iexact=vehicle_raw).first()
                if vehicle is None:
                    errors.append({"row": idx, "name": data["name"],
                                   "errors": {"vehicle": f"Unknown vehicle '{vehicle_raw}'."}})
                    continue
                data["vehicle"] = vehicle.pk

            # visited_at: optional — empty -> now; else parse flexibly
            visited_raw = str(raw.get("visited_at", "") or "").strip()
            if visited_raw:
                parsed = _parse_visited_at(visited_raw)
                if parsed is None:
                    errors.append({"row": idx, "name": data["name"],
                                   "errors": {"visited_at": f"Unrecognised date/time '{visited_raw}'. Use YYYY-MM-DD HH:MM."}})
                    continue
                data["visited_at"] = parsed.isoformat()
            else:
                data["visited_at"] = timezone.now().isoformat()

            serializer = EventVisitorSerializer(data=data, context={"request": request})
            if not serializer.is_valid():
                flat = {k: (v[0] if isinstance(v, list) and v else str(v))
                        for k, v in serializer.errors.items()}
                errors.append({"row": idx, "name": data.get("name", ""), "errors": flat})
                continue
            serializer.save(event=event)
            created += 1

        total = created + len(errors)
        return Response({"total": total, "created": created,
                         "failed": len(errors), "errors": errors},
                        status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="bulk-template",
            permission_classes=[HasRolePermission])
    def bulk_template(self, request, event_pk=None):
        """Download a CSV template for bulk visitor import."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["name", "phone", "email", "company", "address", "notes", "interest_level", "vehicle", "visited_at"])
        writer.writerow(["Ram Sharma", "9801234567/9812345678", "ram@example.com", "ABC Motors", "Kathmandu, Nepal", "", "Hot", "", "2026-09-10 10:00"])
        writer.writerow(["Sita Rai", "9812345678", "sita@example.com", "", "Pokhara", "Called back", "Warm", "", "2026-09-11 14:30"])
        resp = HttpResponse(output.getvalue(), content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="visitor-import-template.csv"'
        return resp


# ---- bulk-import helpers ----

# header aliases -> canonical field
_HEADER_ALIASES = {
    "name": "name",
    "fullname": "name",
    "full_name": "name",
    "visitor": "name",
    "visitorname": "name",
    "phone": "phone",
    "phone_number": "phone",
    "phonenumber": "phone",
    "mobile": "phone",
    "contact": "phone",
    "email": "email",
    "emailaddress": "email",
    "company": "company",
    "organisation": "company",
    "organization": "company",
    "address": "address",
    "location": "address",
    "notes": "notes",
    "note": "notes",
    "interest_level": "interest_level",
    "interestlevel": "interest_level",
    "interest": "interest_level",
    "interestname": "interest_level",
    "vehicle": "vehicle",
    "vehicle_model": "vehicle",
    "vehiclemodel": "vehicle",
    "interested_vehicle": "vehicle",
    "interestedvehicle": "vehicle",
    "visited_at": "visited_at",
    "visitedat": "visited_at",
    "visited": "visited_at",
    "arrival": "visited_at",
    "arrival_datetime": "visited_at",
    "date": "visited_at",
    "datetime": "visited_at",
}


def _normalize_header(h: str) -> str:
    key = (h or "").strip().lower().replace(" ", "").replace("-", "_")
    return _HEADER_ALIASES.get(key, key)


def _normalize_phone(value) -> str:
    """Normalize phone field: allow multiple numbers separated by "/".

    e.g. "9800000000/9800000001" -> "9800000000/9800000001".
    Also normalizes commas to "/" and strips whitespace around each part.
    """
    if value is None:
        return ""
    raw = str(value).strip()
    if not raw:
        return ""
    raw = raw.replace(",", "/")
    parts = [p.strip() for p in raw.split("/") if p.strip()]
    return "/".join(parts)


def _parse_csv_file(upload) -> list[dict]:
    try:
        raw = upload.read()
    except Exception:
        raise ValueError("Could not read uploaded file.")
    if not raw:
        raise ValueError("Uploaded file is empty.")
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError("Could not decode file. Please upload a UTF-8 CSV.")
    # strip NULs that break csv parsing
    text = text.replace("\x00", "")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise ValueError("CSV has no header row. Expected: name, phone, email, company, address, notes, interest_level, vehicle, visited_at.")
    normalized = [_normalize_header(h) for h in reader.fieldnames]
    if "name" not in normalized:
        raise ValueError("CSV must include a 'name' column.")
    rows: list[dict] = []
    for record in reader:
        row: dict = {}
        for orig, norm in zip(reader.fieldnames, normalized):
            if norm in ("name", "phone", "email", "company", "address", "notes", "interest_level", "vehicle", "visited_at"):
                row[norm] = (record.get(orig) or "").strip() if isinstance(record.get(orig), str) else record.get(orig)
        for canonical in ("name", "phone", "email", "company", "address", "notes", "interest_level", "vehicle", "visited_at"):
            row.setdefault(canonical, "")
        rows.append(row)
    return rows


def _parse_excel_file(upload) -> list[dict]:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        raise ValueError("Excel files are not supported on this server yet. Please upload a .csv file.")
    try:
        wb = openpyxl.load_workbook(upload, read_only=True, data_only=True)
        ws = wb.active
        header = None
        rows: list[dict] = []
        for i, values in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                if not values or not any(str(v or "").strip() for v in values):
                    raise ValueError("Excel sheet has no header row.")
                header = [_normalize_header(str(v or "")) for v in values]
                if "name" not in header:
                    raise ValueError("Sheet must include a 'name' column.")
                continue
            assert header is not None
            row: dict = {}
            for h, v in zip(header, values or []):
                if h in ("name", "phone", "email", "company", "address", "notes", "interest_level", "vehicle", "visited_at"):
                    row[h] = "" if v is None else str(v).strip()
            for canonical in ("name", "phone", "email", "company", "address", "notes", "interest_level", "vehicle", "visited_at"):
                row.setdefault(canonical, "")
            rows.append(row)
        return rows
    except ValueError:
        raise
    except Exception:
        raise ValueError("Could not parse Excel file. Make sure the first sheet has a header row.")


def _parse_visited_at(value: str):
    value = (value or "").strip()
    if not value:
        return None
    # Django parsers first (ISO)
    dt = parse_datetime(value)
    if dt is not None:
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    d = parse_date(value)
    if d is not None:
        return timezone.make_aware(datetime.combine(d, dtime.min), timezone.get_current_timezone())
    # common human formats
    fmts = (
        "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M", "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d",
        "%d %b %Y", "%d %b %Y %H:%M", "%d %B %Y", "%m/%d/%Y",
    )
    for fmt in fmts:
        try:
            parsed = datetime.strptime(value, fmt)
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            return parsed
        except ValueError:
            continue
    # last resort: fromisoformat (handles 'T' separator variants)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed
    except ValueError:
        return None
