import csv
import io
import logging
import mimetypes
import os
from datetime import date, timedelta

logger = logging.getLogger(__name__)

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q, OuterRef, Subquery
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, status as http_status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response


def _private_file_response(field_file, inline=True):
    """Serve a private storage file through an authenticated endpoint."""
    if not field_file:
        raise ValidationError("File not found.")
    filename = os.path.basename(field_file.name)
    content_type, _ = mimetypes.guess_type(filename)
    response = FileResponse(
        field_file.open("rb"),
        content_type=content_type or "application/octet-stream",
    )
    disposition = "inline" if inline else "attachment"
    response["Content-Disposition"] = f'{disposition}; filename="{filename}"'
    return response

from accounts.models import (
    user_dealer_id,
    user_has_dealer_role,
    user_has_perm,
    user_is_super_admin,
)
from accounts.permissions import HasRolePermission
from common.views import UserAuditViewSetMixin

from .models import (
    BorderCrossing,
    CheckResult,
    ConditionPhoto,
    ConditionReport,
    ConditionResult,
    DestinationWarehouse,
    ImportBatch,
    ImportJob,
    InspectionIssue,
    InspectionPhoto,
    OverallRating,
    PDIInspection,
    PDIResult,
    PDIChecklistItem,
    PDITemplate,
    Sale,
    ShipmentCost,
    ShipmentCostType,
    StockMovement,
    TransportStatusOption,
    VehicleBodyType,
    VehicleModel,
    VehicleModelSpec,
    VehicleReceiveCheckList,
    VehicleUnit,
    VehicleVariant,
    sync_catalog_vehicles_to_models,
)
from .serializers import (
    BorderCrossingSerializer,
    ConditionPhotoSerializer,
    ConditionReportSerializer,
    ConditionResultSerializer,
    DestinationWarehouseSerializer,
    ImportBatchSerializer,
    ImportJobSerializer,
    InspectionIssueSerializer,
    InspectionPhotoSerializer,
    PDIChecklistItemSerializer,
    PDIInspectionSerializer,
    PDIResultSerializer,
    PDITemplateSerializer,
    SaleSerializer,
    ShipmentCostSerializer,
    ShipmentCostTypeSerializer,
    StockMovementSerializer,
    TransportStatusOptionSerializer,
    UnitCreateSerializer,
    VehicleBodyTypeSerializer,
    VehicleModelSpecSerializer,
    VehicleModelSerializer,
    VehicleReceiveCheckListSerializer,
    VehicleUnitDetailSerializer,
    VehicleUnitListSerializer,
    VehicleVariantSerializer,
)


def _paged_response(viewset, queryset, request):
    """Manual pagination envelope (matches stories/events style)."""
    page = request.query_params.get("page")
    page_size = request.query_params.get("page_size") or request.query_params.get(
        "pageSize"
    )
    if page is None and page_size is None:
        serializer = viewset.get_serializer(queryset, many=True)
        return Response(serializer.data)
    try:
        page = int(page) if page is not None else 1
        page_size = int(page_size) if page_size is not None else 20
    except ValueError:
        page, page_size = 1, 20
    page_size = max(1, min(page_size, 100))
    total = queryset.count()
    start = (page - 1) * page_size
    serializer = viewset.get_serializer(queryset[start : start + page_size], many=True)
    return Response(
        {
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "results": serializer.data,
        }
    )


class VehicleModelViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = VehicleModel.objects.all()
    serializer_class = VehicleModelSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": [
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "vehicles.view_vehicle",
        ],
        "retrieve": [
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "vehicles.view_vehicle",
        ],
        "create": ["inventory.add_vehiclemodel"],
        "update": ["inventory.change_vehiclemodel"],
        "partial_update": ["inventory.change_vehiclemodel"],
        "destroy": ["inventory.delete_vehiclemodel"],
        "default": ["inventory.view_vehiclemodel"],
    }

    def get_queryset(self):
        sync_catalog_vehicles_to_models()
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        if params.get("search"):
            qs = qs.filter(
                Q(brand__icontains=params["search"])
                | Q(model_name__icontains=params["search"])
            )
        return qs

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


class VehicleModelSpecViewSet(viewsets.ModelViewSet):
    """Battery capacities and cargo lengths configured per vehicle model."""
    queryset = VehicleModelSpec.objects.select_related("vehicle_model").all()
    serializer_class = VehicleModelSpecSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": [
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "crm.change_quotation",
        ],
        "retrieve": [
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
        ],
        "create": ["inventory.manage_vehiclevariant"],
        "update": ["inventory.manage_vehiclevariant"],
        "partial_update": ["inventory.manage_vehiclevariant"],
        "destroy": ["inventory.manage_vehiclevariant"],
        "default": ["inventory.view_vehiclevariant"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("vehicle_model"):
            qs = qs.filter(vehicle_model_id=params["vehicle_model"])
        if params.get("kind"):
            qs = qs.filter(kind=params["kind"])
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        return qs

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


class VehicleBodyTypeViewSet(viewsets.ModelViewSet):
    queryset = VehicleBodyType.objects.all().order_by("sort_order", "name")
    serializer_class = VehicleBodyTypeSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": [
            "inventory.view_vehiclebodytype",
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "vehicles.view_vehicle",
        ],
        "retrieve": [
            "inventory.view_vehiclebodytype",
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
            "inventory.view_vehiclemodel",
        ],
        "create": ["inventory.manage_vehiclevariant", "inventory.add_vehiclebodytype"],
        "update": ["inventory.manage_vehiclevariant", "inventory.change_vehiclebodytype"],
        "partial_update": ["inventory.manage_vehiclevariant", "inventory.change_vehiclebodytype"],
        "destroy": ["inventory.manage_vehiclevariant", "inventory.delete_vehiclebodytype"],
        "default": ["inventory.view_vehiclebodytype"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        return qs

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


class VehicleVariantViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = VehicleVariant.objects.select_related(
        "vehicle_model", "body_type", "created_by", "updated_by"
    ).all()
    serializer_class = VehicleVariantSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": [
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "vehicles.view_vehicle",
        ],
        "retrieve": [
            "inventory.view_vehiclevariant",
            "inventory.manage_vehiclevariant",
            "inventory.view_vehiclemodel",
            "crm.view_quotation",
            "crm.add_quotation",
            "vehicles.view_vehicle",
        ],
        "create": ["inventory.manage_vehiclevariant", "inventory.add_vehiclevariant"],
        "update": ["inventory.manage_vehiclevariant", "inventory.change_vehiclevariant"],
        "partial_update": ["inventory.manage_vehiclevariant", "inventory.change_vehiclevariant"],
        "destroy": ["inventory.manage_vehiclevariant", "inventory.delete_vehiclevariant"],
        "default": ["inventory.view_vehiclevariant"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=params["is_active"] == "true")
        if params.get("vehicle_model"):
            qs = qs.filter(vehicle_model_id=params["vehicle_model"])
        if params.get("body_type"):
            qs = qs.filter(body_type_id=params["body_type"])
        if params.get("search"):
            qs = qs.filter(
                Q(name__icontains=params["search"])
                | Q(spec_text__icontains=params["search"])
                | Q(vehicle_model__brand__icontains=params["search"])
                | Q(vehicle_model__model_name__icontains=params["search"])
            )
        return qs

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


UNIT_CSV_COLUMNS = [
    "vin",
    "model_id",
    "model",
    "motor_no",
    "battery_no",
    "color",
    "manufacture_date",
    "odometer_km",
    "purchase_cost",
    "landed_cost",
    "selling_price",
]


def _resolve_model(value, model_id):
    """Resolve a VehicleModel from an id or a brand/model name string."""
    if model_id:
        return VehicleModel.objects.filter(pk=model_id).first()
    if value:
        value = str(value).strip()
        qs = VehicleModel.objects.filter(is_active=True)
        hit = qs.filter(model_name__iexact=value).first()
        if hit:
            return hit
        for model in qs:
            if str(model).lower() == value.lower() or f"{model.brand} {model.model_name}".lower() == value.lower():
                return model
        # Try matching with catalog Vehicle
        from vehicles.models import Vehicle
        v_hit = Vehicle.objects.filter(name__iexact=value).first()
        if v_hit:
            sync_catalog_vehicles_to_models()
            for model in VehicleModel.objects.filter(is_active=True):
                if model.model_name.lower() in v_hit.name.lower() or v_hit.name.lower() in str(model).lower():
                    return model
    return None


def _parse_unit_row(row, index):
    """Validate one bulk/CSV unit row. Returns (cleaned_dict, error)."""
    vin = str(row.get("vin") or row.get("vin_chassis_no") or "").strip()
    if not vin:
        return None, f"Row {index}: VIN/Chassis No. is required."
    model = _resolve_model(row.get("model"), row.get("model_id"))
    if not model:
        return None, f"Row {index}: vehicle model not found."
    cleaned = {
        "vin_chassis_no": vin,
        "vehicle_model": model,
        "motor_no": str(row.get("motor_no") or "").strip(),
        "battery_no": str(row.get("battery_no") or "").strip(),
        "color": str(row.get("color") or "").strip(),
        "manufacture_date": None,
        "odometer_km": 0,
        "purchase_cost": None,
        "landed_cost": None,
        "selling_price": None,
    }
    raw_date = str(row.get("manufacture_date") or "").strip()
    if raw_date:
        parsed = parse_date(raw_date)
        if not parsed:
            return None, f"Row {index}: bad manufacture_date (use YYYY-MM-DD)."
        cleaned["manufacture_date"] = parsed
    for key in ("odometer_km",):
        raw = str(row.get(key) or "").strip()
        if raw:
            try:
                cleaned[key] = max(0, int(float(raw)))
            except ValueError:
                return None, f"Row {index}: bad {key}."
    for key in ("purchase_cost", "landed_cost", "selling_price"):
        raw = str(row.get(key) or "").strip().replace(",", "")
        if raw:
            try:
                cleaned[key] = raw
            except ValueError:
                return None, f"Row {index}: bad {key}."
    variant_val = row.get("variant_id") or row.get("variant")
    if variant_val:
        from inventory.models import VehicleVariant
        v_obj = None
        if str(variant_val).isdigit():
            v_obj = VehicleVariant.objects.filter(id=int(variant_val), vehicle_model=model, is_active=True).first()
        if not v_obj and isinstance(variant_val, str):
            v_obj = VehicleVariant.objects.filter(name__iexact=variant_val.strip(), vehicle_model=model, is_active=True).first()
        if v_obj:
            cleaned["variant"] = v_obj
    return cleaned, None


def _bulk_create_units(batch, rows, user):
    """Create units + IMPORTED movements. Returns (created_vins, errors)."""
    created, errors = [], []
    seen_vins = set()
    seen_battery_nos = set()
    existing = set(
        VehicleUnit.objects.filter(
            vin_chassis_no__in=[str(r.get("vin") or r.get("vin_chassis_no") or "").strip() for r in rows if (r.get("vin") or r.get("vin_chassis_no"))]
        ).values_list("vin_chassis_no", flat=True)
    )
    with transaction.atomic():
        for idx, row in enumerate(rows, start=1):
            cleaned, error = _parse_unit_row(row, idx)
            if error:
                errors.append(error)
                continue
            vin = cleaned["vin_chassis_no"]
            if vin in seen_vins:
                errors.append(f"Row {idx}: duplicate VIN in this upload.")
                continue
            seen_vins.add(vin)
            if vin in existing:
                errors.append(f"Row {idx}: VIN {vin} already exists.")
                continue
            battery_no = cleaned.get("battery_no")
            if battery_no:
                if battery_no.lower() in seen_battery_nos:
                    errors.append(f"Row {idx}: duplicate battery number {battery_no} in this upload.")
                    continue
                conflicting = VehicleUnit.objects.filter(battery_no__iexact=battery_no).first()
                if conflicting:
                    errors.append(f"Row {idx}: Battery number already used on unit VIN-{conflicting.vin_chassis_no}.")
                    continue
                seen_battery_nos.add(battery_no.lower())
            model = cleaned.pop("vehicle_model")
            unit = VehicleUnit.objects.create(
                import_batch=batch,
                vehicle_model=model,
                created_by=user if user and user.is_authenticated else None,
                updated_by=user if user and user.is_authenticated else None,
                **cleaned,
            )
            StockMovement.objects.create(
                vehicle=unit,
                movement_type=StockMovement.MovementType.IMPORTED,
                quantity=1,
                reference_note=f"Imported via batch {batch.batch_no}",
                created_by=user if user and user.is_authenticated else None,
            )
            created.append(vin)
        batch.refresh_unit_count()
    return created, errors


class TransportStatusOptionViewSet(viewsets.ModelViewSet):
    """CRUD for dynamic transport status options for China shipments."""

    serializer_class = TransportStatusOptionSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_transportstatusoption", "inventory.view_importbatch"],
        "retrieve": ["inventory.view_transportstatusoption", "inventory.view_importbatch"],
        "create": ["inventory.add_transportstatusoption", "inventory.change_importbatch"],
        "update": ["inventory.change_transportstatusoption", "inventory.change_importbatch"],
        "partial_update": ["inventory.change_transportstatusoption", "inventory.change_importbatch"],
        "destroy": ["inventory.delete_transportstatusoption", "inventory.delete_importbatch"],
        "default": ["inventory.view_transportstatusoption", "inventory.view_importbatch"],
    }

    def get_queryset(self):
        qs = TransportStatusOption.objects.all()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        batch_count_subq = (
            ImportBatch.objects.filter(transport_status=OuterRef("name"))
            .values("transport_status")
            .annotate(count=Count("id"))
            .values("count")
        )
        return qs.annotate(batch_count=Subquery(batch_count_subq)).order_by("id")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if ImportBatch.objects.filter(transport_status=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f'Cannot delete transport status "{instance.label or instance.name}" '
                        "because it is used by existing shipments. Deactivate it instead."
                    )
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class BorderCrossingViewSet(viewsets.ModelViewSet):
    """CRUD for dynamic border crossings."""

    serializer_class = BorderCrossingSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_bordercrossing", "inventory.view_importbatch"],
        "retrieve": ["inventory.view_bordercrossing", "inventory.view_importbatch"],
        "create": ["inventory.add_bordercrossing", "inventory.change_importbatch"],
        "update": ["inventory.change_bordercrossing", "inventory.change_importbatch"],
        "partial_update": ["inventory.change_bordercrossing", "inventory.change_importbatch"],
        "destroy": ["inventory.delete_bordercrossing", "inventory.delete_importbatch"],
        "default": ["inventory.view_bordercrossing", "inventory.view_importbatch"],
    }

    def get_queryset(self):
        qs = BorderCrossing.objects.all()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        batch_count_subq = (
            ImportBatch.objects.filter(border_crossing=OuterRef("name"))
            .values("border_crossing")
            .annotate(count=Count("id"))
            .values("count")
        )
        return qs.annotate(batch_count=Subquery(batch_count_subq)).order_by("id")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if ImportBatch.objects.filter(border_crossing=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f'Cannot delete border crossing "{instance.name}" '
                        "because it is used by existing shipments. Deactivate it instead."
                    )
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class DestinationWarehouseViewSet(viewsets.ModelViewSet):
    """CRUD for dynamic destination warehouses/stockyards."""

    serializer_class = DestinationWarehouseSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_destinationwarehouse", "inventory.view_importbatch"],
        "retrieve": ["inventory.view_destinationwarehouse", "inventory.view_importbatch"],
        "create": ["inventory.add_destinationwarehouse", "inventory.change_importbatch"],
        "update": ["inventory.change_destinationwarehouse", "inventory.change_importbatch"],
        "partial_update": ["inventory.change_destinationwarehouse", "inventory.change_importbatch"],
        "destroy": ["inventory.delete_destinationwarehouse", "inventory.delete_importbatch"],
        "default": ["inventory.view_destinationwarehouse", "inventory.view_importbatch"],
    }

    def get_queryset(self):
        qs = DestinationWarehouse.objects.all()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        batch_count_subq = (
            ImportBatch.objects.filter(destination_warehouse=OuterRef("name"))
            .values("destination_warehouse")
            .annotate(count=Count("id"))
            .values("count")
        )
        return qs.annotate(batch_count=Subquery(batch_count_subq)).order_by("id")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if ImportBatch.objects.filter(destination_warehouse=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f'Cannot delete destination warehouse "{instance.name}" '
                        "because it is used by existing shipments. Deactivate it instead."
                    )
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


@api_view(["GET"])
def inventory_meta(request):
    """Dynamic choice metadata for China shipments and inventory forms.

    Returns active transport statuses, border crossings, and destination warehouses.
    Requires any inventory view permission or Super Admin.
    """
    if not (
        request.user.is_superuser
        or user_is_super_admin(request.user)
        or any(
            user_has_perm(request.user, label)
            for label in (
                "inventory.view_importbatch",
                "inventory.view_vehicleunit",
                "inventory.view_transportstatusoption",
                "inventory.view_bordercrossing",
                "inventory.view_destinationwarehouse",
            )
        )
    ):
        return Response(
            {"detail": "You do not have permission to perform this action."},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    statuses = list(
        TransportStatusOption.objects.filter(is_active=True)
        .order_by("id")
        .values("name", "label")
    )
    border_crossings = list(
        BorderCrossing.objects.filter(is_active=True)
        .order_by("id")
        .values_list("name", flat=True)
    )
    destination_warehouses = list(
        DestinationWarehouse.objects.filter(is_active=True)
        .order_by("id")
        .values_list("name", flat=True)
    )

    return Response({
        "transport_statuses": statuses,
        "border_crossings": border_crossings,
        "destination_warehouses": destination_warehouses,
    })


class ShipmentCostTypeViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = ShipmentCostType.objects.all()
    serializer_class = ShipmentCostTypeSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_shipmentcosttype"],
        "retrieve": ["inventory.view_shipmentcosttype"],
        "create": ["inventory.add_shipmentcosttype"],
        "update": ["inventory.change_shipmentcosttype"],
        "partial_update": ["inventory.change_shipmentcosttype"],
        "destroy": ["inventory.delete_shipmentcosttype"],
        "default": ["inventory.view_shipmentcosttype"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("is_active"):
            active = self.request.query_params.get("is_active").lower() in ("true", "1")
            qs = qs.filter(is_active=active)
        return qs.order_by("name")


class ShipmentCostViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = ShipmentCost.objects.select_related("cost_type", "shipment").all()
    serializer_class = ShipmentCostSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_shipment_costs"],
        "retrieve": ["inventory.view_shipment_costs"],
        "create": ["inventory.add_shipmentcost"],
        "update": ["inventory.change_shipmentcost"],
        "partial_update": ["inventory.change_shipmentcost"],
        "destroy": ["inventory.delete_shipmentcost"],
        "default": ["inventory.view_shipment_costs"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        shipment_id = self.request.query_params.get("shipment")
        if shipment_id:
            qs = qs.filter(shipment_id=shipment_id)
        return qs.order_by("id")

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)


class ImportBatchViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = ImportBatch.objects.all()
    serializer_class = ImportBatchSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_importbatch"],
        "retrieve": ["inventory.view_importbatch"],
        "create": ["inventory.add_importbatch"],
        "update": ["inventory.change_importbatch"],
        "partial_update": ["inventory.change_importbatch"],
        "destroy": ["inventory.delete_importbatch"],
        "add_units": ["inventory.add_vehicleunit"],
        "import_csv": ["inventory.add_vehicleunit"],
        "csv_template": ["inventory.view_importbatch"],
        "receive_units": ["inventory.change_vehicleunit", "inventory.change_importbatch"],
        "change_status": ["inventory.change_importbatch"],
        "export_csv": ["inventory.view_importbatch"],
        "record_print": ["inventory.view_importbatch"],
        "default": ["inventory.view_importbatch"],
    }

    def get_queryset(self):
        user = self.request.user
        # Dealer scoping: Dealer users do NOT see shipments
        if user and user.is_authenticated:
            if user_has_dealer_role(user) or getattr(user, "is_dealer_user", False):
                return ImportBatch.objects.none()
            if hasattr(user, "profile") and user.profile.dealer:
                return ImportBatch.objects.none()

        qs = super().get_queryset().prefetch_related("units", "costs__cost_type")
        params = self.request.query_params

        # Soft delete: exclude deleted by default
        if not params.get("include_deleted"):
            qs = qs.filter(is_deleted=False)

        if params.get("status"):
            st = params["status"]
            qs = qs.filter(Q(status=st) | Q(transport_status=st))
        elif params.get("transport_status"):
            st = params["transport_status"]
            qs = qs.filter(Q(status=st) | Q(transport_status=st))

        if params.get("supplier"):
            sup = params["supplier"]
            qs = qs.filter(Q(supplier_exporter__icontains=sup) | Q(origin__icontains=sup))

        if params.get("model"):
            m = params["model"]
            if m.isdigit():
                qs = qs.filter(units__vehicle_model_id=int(m))
            else:
                qs = qs.filter(units__vehicle_model__model_name__icontains=m)

        if params.get("start_date"):
            qs = qs.filter(
                Q(actual_arrival_date__gte=params["start_date"])
                | Q(eta__gte=params["start_date"])
                | Q(created_at__date__gte=params["start_date"])
            )
        if params.get("end_date"):
            qs = qs.filter(
                Q(actual_arrival_date__lte=params["end_date"])
                | Q(eta__lte=params["end_date"])
                | Q(created_at__date__lte=params["end_date"])
            )

        if params.get("border_crossing"):
            qs = qs.filter(border_crossing__icontains=params["border_crossing"])

        if params.get("search"):
            s = params["search"]
            qs = qs.filter(
                Q(shipment_no__icontains=s)
                | Q(batch_no__icontains=s)
                | Q(supplier_exporter__icontains=s)
                | Q(container_bl_no__icontains=s)
                | Q(carrier_name__icontains=s)
                | Q(invoice_no__icontains=s)
                | Q(origin__icontains=s)
                | Q(customs_declaration_no__icontains=s)
                | Q(container_or_truck_no__icontains=s)
                | Q(lc_number__icontains=s)
            )
        return qs.distinct().order_by("-created_at", "-id")

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(updated_by=user)

    def destroy(self, request, *args, **kwargs):
        batch = self.get_object()
        reason = (
            request.data.get("reason")
            or request.query_params.get("reason")
            or ""
        ).strip()
        if not reason:
            raise ValidationError(
                {"reason": "A deletion reason is required to delete a shipment."}
            )
        batch.is_deleted = True
        batch.deleted_at = timezone.now()
        batch.deleted_by = request.user if request.user.is_authenticated else None
        batch.deletion_reason = reason
        batch.save(
            update_fields=[
                "is_deleted",
                "deleted_at",
                "deleted_by",
                "deletion_reason",
                "updated_at",
            ]
        )
        from common.models import AuditLog, log_audit_event

        log_audit_event(
            instance=batch,
            action=AuditLog.Action.DELETE,
            changed_by=request.user,
            summary=f"Soft deleted shipment #{batch.shipment_no or batch.batch_no}. Reason: {reason}",
        )
        return Response({"detail": "Shipment soft deleted successfully."})

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        """Update shipment status with audit logging, required document checks, and optional stock receipt."""
        batch = self.get_object()
        new_status = request.data.get("status")
        if not new_status or new_status not in ImportBatch.ShipmentStatus.values:
            raise ValidationError(
                {
                    "status": f"Invalid status. Choices are {ImportBatch.ShipmentStatus.values}"
                }
            )

        old_status = batch.status
        notes = request.data.get("notes", "").strip()

        # Transition status
        batch.status = new_status
        today = timezone.localdate()
        update_fields = ["status", "updated_at"]

        # Sync milestone dates and transport_status
        if new_status == ImportBatch.ShipmentStatus.RECEIVED:
            if not batch.warehouse_received_date:
                batch.warehouse_received_date = today
                update_fields.append("warehouse_received_date")
            if not batch.actual_arrival_date:
                batch.actual_arrival_date = today
                update_fields.append("actual_arrival_date")
            batch.transport_status = ImportBatch.TransportStatus.ARRIVED
            update_fields.append("transport_status")
            if request.data.get("receive_units"):
                batch.receive_all_units(
                    by=request.user, note=notes or f"Shipment marked RECEIVED: {notes}"
                )
        elif new_status == ImportBatch.ShipmentStatus.CUSTOMS_CLEARANCE:
            if not batch.customs_clearance_date:
                batch.customs_clearance_date = today
                update_fields.append("customs_clearance_date")
            batch.transport_status = ImportBatch.TransportStatus.BORDER_CUSTOMS
            update_fields.append("transport_status")
        elif new_status == ImportBatch.ShipmentStatus.AT_PORT:
            if not batch.actual_arrival_date:
                batch.actual_arrival_date = today
                update_fields.append("actual_arrival_date")
            batch.transport_status = ImportBatch.TransportStatus.BORDER_CUSTOMS
            update_fields.append("transport_status")
        elif new_status == ImportBatch.ShipmentStatus.IN_TRANSIT:
            batch.transport_status = ImportBatch.TransportStatus.IN_TRANSIT
            update_fields.append("transport_status")
        elif new_status == ImportBatch.ShipmentStatus.ORDERED:
            batch.transport_status = ImportBatch.TransportStatus.ORDERED
            update_fields.append("transport_status")

        if notes and notes != batch.notes:
            batch.notes = (
                f"{batch.notes}\n[{timezone.now().strftime('%Y-%m-%d %H:%M')}] {notes}".strip()
            )
            update_fields.append("notes")

        batch.save(update_fields=update_fields)

        from common.models import AuditLog, log_audit_event

        user_name = (
            request.user.get_full_name() or request.user.username
            if request.user.is_authenticated
            else "System"
        )
        log_audit_event(
            instance=batch,
            field_name="status",
            old_value=old_status,
            new_value=new_status,
            changed_by=request.user,
            action=AuditLog.Action.UPDATE,
            summary=f"{user_name} changed shipment #{batch.shipment_no or batch.batch_no} status from {old_status} to {new_status}",
        )
        return Response(self.get_serializer(batch).data)

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        """Export shipments list to CSV with export audit log recording who exported it."""
        qs = self.filter_queryset(self.get_queryset())
        user = request.user
        can_see_costs = (
            user.is_authenticated
            and (user.is_superuser or user.has_perm("inventory.view_shipment_costs"))
        )

        from common.models import AuditLog, log_audit_event

        user_name = (
            user.get_full_name() or user.username
            if user.is_authenticated
            else "Anonymous"
        )
        log_audit_event(
            instance=None,
            action=AuditLog.Action.EXPORT,
            changed_by=user,
            summary=f"Exported shipments CSV ({qs.count()} rows) by {user_name}",
        )

        buffer = io.StringIO()
        fieldnames = [
            "Shipment No",
            "Batch No",
            "Supplier / Exporter",
            "Status",
            "BL / Container",
            "Transport Mode",
            "Port of Loading",
            "Port of Arrival",
            "ETD",
            "ETA",
            "Actual Arrival Date",
            "Customs Clearance Date",
            "Received Date",
            "Units Count",
            "Created At",
        ]
        if can_see_costs:
            fieldnames.extend(["Total Landed Cost (NPR)", "Avg Cost Per Unit (NPR)"])

        writer = csv.DictWriter(buffer, fieldnames=fieldnames)
        writer.writeheader()
        for b in qs:
            row = {
                "Shipment No": b.shipment_no or b.batch_no,
                "Batch No": b.batch_no,
                "Supplier / Exporter": b.supplier_exporter or b.origin,
                "Status": b.get_status_display() or b.status,
                "BL / Container": b.container_bl_no or b.container_or_truck_no,
                "Transport Mode": b.vessel_transport_mode,
                "Port of Loading": b.port_of_loading,
                "Port of Arrival": b.port_of_arrival,
                "ETD": str(b.etd or ""),
                "ETA": str(b.eta or b.eta_date or ""),
                "Actual Arrival Date": str(
                    b.actual_arrival_date or b.arrived_date or ""
                ),
                "Customs Clearance Date": str(b.customs_clearance_date or ""),
                "Received Date": str(b.warehouse_received_date or ""),
                "Units Count": b.units.count(),
                "Created At": b.created_at.strftime("%Y-%m-%d %H:%M"),
            }
            if can_see_costs:
                row["Total Landed Cost (NPR)"] = str(b.total_landed_cost_npr)
                row["Avg Cost Per Unit (NPR)"] = str(b.average_cost_per_unit_npr)
            writer.writerow(row)

        today_str = timezone.localdate().strftime("%Y%m%d")
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="shipments-export-{today_str}.csv"'
        )
        return response

    @action(detail=True, methods=["post"], url_path="record-print")
    def record_print(self, request, pk=None):
        """Record print event for shipment summary in audit ledger."""
        batch = self.get_object()
        from common.models import record_print_event

        user = request.user if request.user.is_authenticated else None
        title = f"Shipment #{batch.shipment_no or batch.batch_no} Summary"
        ip = request.META.get("REMOTE_ADDR")
        log = record_print_event(
            user=user,
            document_type="SHIPMENT_SUMMARY",
            object_id=str(batch.id),
            title=title,
            ip_address=ip,
        )
        return Response({"detail": "Shipment print event recorded.", "log_id": log.id})

    @action(detail=True, methods=["post"])
    def add_units(self, request, pk=None):
        """Add vehicle rows or attach existing units to this batch/shipment."""
        batch = self.get_object()
        unit_ids = request.data.get("unit_ids")
        if unit_ids and isinstance(unit_ids, list):
            units_updated = VehicleUnit.objects.filter(id__in=unit_ids).update(
                import_batch=batch
            )
            batch.refresh_unit_count()
            return Response(
                {
                    "detail": f"{units_updated} existing vehicle units attached to shipment.",
                    "count": units_updated,
                }
            )

        rows = request.data.get("units")
        if not isinstance(rows, list) or not rows:
            raise ValidationError(
                {"units": "Provide a non-empty list of unit rows or unit_ids."}
            )
        if len(rows) > 500:
            raise ValidationError({"units": "Max 500 rows per request."})
        created, errors = _bulk_create_units(batch, rows, request.user)
        status_code = (
            http_status.HTTP_201_CREATED
            if created
            else http_status.HTTP_400_BAD_REQUEST
        )
        return Response(
            {"created": created, "created_count": len(created), "errors": errors},
            status=status_code,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="import-csv",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_csv(self, request, pk=None):
        """Bulk-add vehicle rows from an uploaded CSV file."""
        batch = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "No file provided."})
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ValidationError({"file": "File must be UTF-8 encoded CSV."})
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)[:2000]
        if not rows:
            raise ValidationError({"file": "CSV has no data rows."})
        created, errors = _bulk_create_units(batch, rows, request.user)
        status_code = (
            http_status.HTTP_201_CREATED
            if created
            else http_status.HTTP_400_BAD_REQUEST
        )
        return Response(
            {"created": created, "created_count": len(created), "errors": errors},
            status=status_code,
        )

    @action(detail=False, methods=["get"], url_path="csv-template")
    def csv_template(self, request):
        sample = [
            {
                "vin": "VT20260001",
                "model_id": "",
                "model": "Brand ModelName (or leave blank if model_id given)",
                "motor_no": "MTR-0001",
                "battery_no": "BAT-0001",
                "color": "White",
                "manufacture_date": "2026-01-15",
                "odometer_km": "12",
                "purchase_cost": "4500000",
                "landed_cost": "5200000",
                "selling_price": "5950000",
            }
        ]
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=UNIT_CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(sample)
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="import-batch-units-template.csv"'
        )
        return response

    @action(detail=True, methods=["post"], url_path="receive-units")
    def receive_units(self, request, pk=None):
        """Transition all in-transit units of this batch into warehouse upon arrival."""
        batch = self.get_object()
        note = request.data.get("note", "")
        moved_count = batch.receive_all_units(by=request.user, note=note)
        serializer = self.get_serializer(batch)
        return Response(
            {
                "moved_count": moved_count,
                "detail": f"{moved_count} vehicle units received into warehouse.",
                "batch": serializer.data,
            }
        )


class VehicleUnitViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = VehicleUnit.objects.all()
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": [
            "inventory.view_vehicleunit",
            "crm.view_quotation",
            "crm.add_quotation",
        ],
        "retrieve": [
            "inventory.view_vehicleunit",
            "crm.view_quotation",
            "crm.add_quotation",
        ],
        "create": ["inventory.add_vehicleunit"],
        "update": ["inventory.change_vehicleunit"],
        "partial_update": ["inventory.change_vehicleunit"],
        "destroy": ["inventory.delete_vehicleunit"],
        "start_pdi": ["inventory.add_pdiinspection"],
        "start_vei": ["inventory.add_pdiinspection"],
        "arrive": ["inventory.change_vehicleunit"],
        "move_to_ready": ["inventory.change_vehicleunit"],
        "reserve": ["inventory.change_vehicleunit"],
        "release": ["inventory.change_vehicleunit"],
        "mark_sold": ["inventory.change_vehicleunit"],
        "mark_returned": ["inventory.change_vehicleunit"],
        "restock": ["inventory.change_vehicleunit"],
        "scrap": ["inventory.change_vehicleunit"],
        "summary": ["inventory.view_vehicleunit"],
        "export": ["inventory.view_vehicleunit"],
        "default": ["inventory.view_vehicleunit"],
    }

    def get_queryset(self):
        qs = (
            VehicleUnit.objects.select_related(
                "vehicle_model", "variant", "variant__body_type", "import_batch", "customer"
            )
            .prefetch_related("pdi_inspections")
            .all()
        )
        params = self.request.query_params
        if not params.get("include_deleted"):
            qs = qs.filter(is_deleted=False)
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(vin_chassis_no__icontains=search)
                | Q(motor_no__icontains=search)
                | Q(battery_no__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(vehicle_model__brand__icontains=search)
                | Q(vehicle_model__model_name__icontains=search)
                | Q(variant__name__icontains=search)
            )
        if params.get("model"):
            qs = qs.filter(vehicle_model_id=params["model"])
        if params.get("variant"):
            qs = qs.filter(variant_id=params["variant"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("status__in"):
            statuses = [s.strip() for s in params["status__in"].split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)
        if params.get("status_exclude"):
            excludes = [s.strip() for s in params["status_exclude"].split(",") if s.strip()]
            qs = qs.exclude(status__in=excludes)
        if params.get("batch"):
            qs = qs.filter(import_batch_id=params["batch"])
        if params.get("color"):
            qs = qs.filter(color__iexact=params["color"])
        if params.get("lead"):
            qs = qs.filter(lead_id=params["lead"])
        if params.get("customer"):
            qs = qs.filter(customer_id=params["customer"])
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        return qs.order_by("-created_at", "-id")

    def get_serializer_class(self):
        if self.action == "list":
            return VehicleUnitListSerializer
        if self.action == "create":
            return UnitCreateSerializer
        return VehicleUnitDetailSerializer

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        extra = {}
        if user:
            extra["created_by"] = user
            extra["updated_by"] = user
        if not (self.request.user.is_superuser or user_is_super_admin(self.request.user)):
            home_dealer = user_dealer_id(self.request.user)
            if user_has_dealer_role(self.request.user) and not home_dealer:
                raise PermissionDenied("Dealer users without an assigned home dealership cannot create vehicle units.")
            if home_dealer:
                # Always pin home dealer — ignore client-supplied dealer id
                extra["dealer_id"] = home_dealer
        unit = serializer.save(**extra)
        StockMovement.objects.create(
            vehicle=unit,
            movement_type=StockMovement.MovementType.IMPORTED,
            quantity=1,
            reference_note=f"Imported via batch {unit.import_batch.batch_no}",
            created_by=user,
        )
        unit.import_batch.refresh_unit_count()

    def perform_update(self, serializer):
        if "status" in serializer.validated_data:
            raise ValidationError(
                {"status": "Status changes must go through the transition actions."}
            )
        for field in ("sold_price", "sold_date", "customer", "customer_name"):
            if field in serializer.validated_data:
                raise ValidationError(
                    {field: "Sale fields can only be set via the mark-sold action."}
                )
        user = self.request.user if self.request.user.is_authenticated else None
        extra = {}
        if user:
            extra["updated_by"] = user
        serializer.save(**extra)

    def perform_destroy(self, instance):
        batch = instance.import_batch
        instance.delete()
        if batch:
            batch.refresh_unit_count()

    # -- transitions -----------------------------------------------------
    def _transition(self, request, target, note="", extra=None):
        unit = self.get_object()
        user = request.user if request.user.is_authenticated else None
        try:
            with transaction.atomic():
                if extra:
                    for key, value in extra.items():
                        setattr(unit, key, value)
                    unit.save(update_fields=list(extra.keys()) + ["updated_at"])
                unit.transition_to(target, by=user, note=note or "")
        except DjangoValidationError as exc:
            raise ValidationError(
                exc.message_dict if hasattr(exc, "message_dict") else str(exc)
            )
        return Response(self.get_serializer(unit).data)

    @action(detail=True, methods=["post"])
    def arrive(self, request, pk=None):
        return self._transition(request, VehicleUnit.Status.IN_WAREHOUSE, "Marked arrived")

    @action(detail=True, methods=["post"])
    def move_to_ready(self, request, pk=None):
        return self._transition(
            request, VehicleUnit.Status.READY_FOR_SALE, "Moved to ready for sale"
        )

    @action(detail=True, methods=["post"])
    def reserve(self, request, pk=None):
        from django.conf import settings
        from django.utils import timezone as tz
        import datetime

        quotation_id = request.data.get("quotation") or request.data.get("quotation_id")

        # If a quotation_id is supplied, delegate entirely to the pipeline service
        # which enforces the one-active-reservation-per-unit constraint and sets expiry.
        if quotation_id:
            from crm.services.pipeline import reserve_unit_for_quotation
            from crm.models import Quotation
            try:
                quotation = Quotation.objects.get(pk=quotation_id)
            except Quotation.DoesNotExist:
                raise ValidationError({"quotation": "Quotation not found."})
            try:
                unit = self.get_object()
            except Exception:
                raise ValidationError({"unit": "Vehicle unit not found."})
            days = int(request.data.get("expires_in_days") or
                       getattr(settings, "RESERVATION_DEFAULT_DAYS", 7))
            reserve_unit_for_quotation(quotation, unit, user=request.user, days=days)
            return Response(self.get_serializer(unit).data)

        # Direct (non-quotation) reservation: mark unit RESERVED and record expiry.
        days = int(request.data.get("expires_in_days") or
                   getattr(settings, "RESERVATION_DEFAULT_DAYS", 7))
        expires_at = tz.now() + datetime.timedelta(days=days)

        with transaction.atomic():
            # Scope via get_object first, then lock the row
            scoped = self.get_object()
            try:
                unit = (
                    self.get_queryset()
                    .select_for_update()
                    .get(pk=scoped.pk)
                )
            except VehicleUnit.DoesNotExist:
                raise ValidationError({"unit": "Vehicle unit not found."})

            extra = {}
            if request.data.get("customer") is not None:
                extra["customer_id"] = request.data.get("customer") or None
                extra["current_customer_id"] = request.data.get("customer") or None
            if request.data.get("customer_name") is not None:
                extra["customer_name"] = str(request.data.get("customer_name") or "")
            lead_id = request.data.get("lead") or request.data.get("lead_id")
            if lead_id is not None:
                extra["lead_id"] = lead_id or None
            extra["reservation_expires_at"] = expires_at
            note = str(request.data.get("note") or "Reserved")
            user = request.user if request.user.is_authenticated else None
            for key, value in extra.items():
                setattr(unit, key, value)
            unit.save(update_fields=list(extra.keys()) + ["updated_at"])
            unit.transition_to(VehicleUnit.Status.RESERVED, by=user, note=note or "")

            try:
                from crm.services.pipeline import log_unit_reserved_activity

                log_unit_reserved_activity(
                    unit=unit,
                    user=user,
                    note=note or "",
                    lead=getattr(unit, "lead", None),
                    customer=unit.current_customer,
                )
            except Exception as exc:
                logger.exception("Failed to log CRM activity for unit reserve: %s", exc)

            return Response(self.get_serializer(unit).data)

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        note = str(request.data.get("note") or "Reservation released")
        unit_before = self.get_object()
        cust = unit_before.current_customer
        lead_obj = getattr(unit_before, "lead", None)
        resp = self._transition(request, VehicleUnit.Status.READY_FOR_SALE, note)
        try:
            from crm.services.pipeline import log_unit_released_activity

            log_unit_released_activity(
                unit=unit_before,
                user=request.user if request.user.is_authenticated else None,
                note=note,
                lead=lead_obj,
                customer=cust,
            )
        except Exception as exc:
            logger.exception("Failed to log CRM activity for unit release: %s", exc)
        return resp

    @action(detail=True, methods=["post"])
    def mark_sold(self, request, pk=None):
        from common.phone import normalize_nepal_phone
        from crm.models import Customer, Lead
        from inventory.services.sales import record_sale

        sold_price = request.data.get("sold_price")
        if sold_price in (None, ""):
            raise ValidationError({"sold_price": "Sold price is required."})

        customer_id = request.data.get("customer") or None
        customer_name = str(request.data.get("customer_name") or "")
        lead_id = request.data.get("lead") or None
        quotation_id = request.data.get("quotation") or None
        cust_phone = request.data.get("phone") or request.data.get("customer_phone")

        if not customer_id and not customer_name and not lead_id:
            raise ValidationError(
                {"customer": "Provide a customer, lead, or customer name."}
            )

        if not customer_id and lead_id:
            lead_obj = Lead.objects.filter(pk=lead_id).first()
            if lead_obj and lead_obj.customer_id:
                customer_id = lead_obj.customer_id
            elif lead_obj and not cust_phone:
                cust_phone = lead_obj.phone
                if not customer_name:
                    customer_name = lead_obj.resolved_name

        if not customer_id and cust_phone:
            norm_phone = normalize_nepal_phone(cust_phone)
            if norm_phone:
                cust_match = Customer.objects.filter(phone_normalized=norm_phone).first()
                if cust_match:
                    customer_id = cust_match.id

        if not customer_id and customer_name:
            cust_obj = Customer.objects.create(
                name=customer_name.strip(),
                phone=cust_phone or "",
            )
            customer_id = cust_obj.id

        if not customer_id:
            raise ValidationError(
                {"customer": "A valid customer is required to record a sale."}
            )

        sold_date = request.data.get("sold_date") or date.today().isoformat()
        parsed = parse_date(str(sold_date))
        if not parsed:
            raise ValidationError({"sold_date": "Bad date (use YYYY-MM-DD)."})

        payment_mode = request.data.get("payment_mode") or "CASH"
        finance_bank_name = request.data.get("finance_bank_name") or ""
        down_payment = request.data.get("down_payment") or None
        loan_amount = request.data.get("loan_amount") or None
        loan_tenure_months = request.data.get("loan_tenure_months") or None
        interest_rate = request.data.get("interest_rate") or None
        monthly_emi = request.data.get("monthly_emi") or None
        finance_status = request.data.get("finance_status") or None
        tax_invoice_no = str(request.data.get("tax_invoice_no") or "")
        receipt_voucher_no = str(request.data.get("receipt_voucher_no") or "")
        salesperson_name = str(request.data.get("salesperson_name") or "")
        delivery_notes = str(request.data.get("delivery_notes") or "")
        discount_val = request.data.get("discount") or 0

        # Enforce dealer/queryset scoping before recording the sale
        unit = self.get_object()
        record_sale(
            unit_id=unit.pk,
            customer_id=customer_id,
            sold_price=sold_price,
            sold_date=parsed,
            discount=discount_val,
            payment_mode=payment_mode,
            bank=finance_bank_name,
            down_payment=down_payment,
            loan_amount=loan_amount,
            tenure=loan_tenure_months,
            interest=interest_rate,
            emi=monthly_emi,
            finance_status=finance_status,
            tax_invoice_no=tax_invoice_no,
            receipt_no=receipt_voucher_no,
            salesperson=request.user if request.user.is_authenticated else None,
            salesperson_name=salesperson_name,
            notes=delivery_notes,
            lead_id=lead_id,
            quotation_id=quotation_id,
            user=request.user if request.user.is_authenticated else None,
        )

        unit.refresh_from_db()
        return Response(self.get_serializer(unit).data)

    @action(detail=True, methods=["post"])
    def mark_returned(self, request, pk=None):
        note = str(request.data.get("note") or "Returned by customer")
        return self._transition(request, VehicleUnit.Status.RETURNED, note)

    @action(detail=True, methods=["post"])
    def restock(self, request, pk=None):
        note = str(request.data.get("note") or "Restocked to warehouse")
        unit = self.get_object()
        user = request.user if request.user.is_authenticated else None
        try:
            with transaction.atomic():
                # Clear the unit's sold fields.
                unit.sold_price = None
                unit.sold_date = None
                unit.customer = None
                unit.customer_name = ""
                unit.current_customer = None
                unit.save(
                    update_fields=[
                        "sold_price",
                        "sold_date",
                        "customer",
                        "customer_name",
                        "current_customer",
                        "updated_at",
                    ]
                )
                # Mark all current Sales as not-current so the unit can be resold.
                from inventory.models import Sale
                Sale.objects.filter(unit=unit, is_current=True).update(is_current=False)
                unit.transition_to(
                    VehicleUnit.Status.IN_WAREHOUSE, by=user, note=note
                )
        except DjangoValidationError as exc:
            raise ValidationError(str(exc))
        return Response(self.get_serializer(unit).data)

    @action(detail=True, methods=["post"])
    def scrap(self, request, pk=None):
        note = str(request.data.get("note") or "Scrapped")
        return self._transition(request, VehicleUnit.Status.SCRAPPED, note)

    @action(detail=True, methods=["post"])
    def start_pdi(self, request, pk=None):
        """Create a DRAFT PDI inspection (snapshots + blank results)."""
        unit = self.get_object()
        inspection = create_pdi_for_unit(
            unit,
            request.user if request.user.is_authenticated else None,
            inspection_type="PDI",
        )
        data = PDIInspectionSerializer(
            inspection, context=self.get_serializer_context()
        ).data
        return Response(data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def start_vei(self, request, pk=None):
        """Create a DRAFT VEI (Vehicle Entry Inspection) (snapshots + blank results)."""
        unit = self.get_object()
        inspection = create_pdi_for_unit(
            unit,
            request.user if request.user.is_authenticated else None,
            inspection_type="VEI",
        )
        data = PDIInspectionSerializer(
            inspection, context=self.get_serializer_context()
        ).data
        return Response(data, status=http_status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Top summary cards for the vehicle list / stock overview."""
        qs = self.filter_queryset(self.get_queryset())
        S = VehicleUnit.Status
        counts = {row["status"]: row["n"] for row in qs.values("status").annotate(n=Count("id"))}
        today = date.today()
        month_start = today.replace(day=1)
        sold_month = qs.filter(status=S.SOLD, sold_date__gte=month_start).count()
        return Response(
            {
                "total": qs.count(),
                "in_transit": counts.get(S.IN_TRANSIT, 0),
                "in_warehouse": counts.get(S.IN_WAREHOUSE, 0),
                "pdi_pending": counts.get(S.PDI_PENDING, 0),
                "pdi_failed": counts.get(S.PDI_FAILED, 0),
                "ready_for_sale": counts.get(S.READY_FOR_SALE, 0),
                "reserved": counts.get(S.RESERVED, 0),
                "sold": counts.get(S.SOLD, 0),
                "sold_this_month": sold_month,
                "returned": counts.get(S.RETURNED, 0),
                "scrapped": counts.get(S.SCRAPPED, 0),
            }
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        """CSV export of the (filtered) unit list."""
        qs = self.filter_queryset(self.get_queryset())
        header = [
            "VIN/Chassis No",
            "Brand",
            "Model",
            "Color",
            "Batch",
            "Status",
            "Manufacture Date",
            "Odometer (KM)",
            "PDI No",
            "PDI Status",
            "Selling Price (NPR)",
            "Sold Price (NPR)",
            "Sold Date",
        ]
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)
        for unit in qs.iterator(chunk_size=500):
            latest = (
                unit.pdi_inspections.order_by("-inspection_date", "-id").first()
            )
            writer.writerow(
                [
                    unit.vin_chassis_no,
                    unit.vehicle_model.brand,
                    unit.vehicle_model.model_name,
                    unit.color,
                    unit.import_batch.batch_no if unit.import_batch_id else "",
                    unit.get_status_display(),
                    unit.manufacture_date.isoformat() if unit.manufacture_date else "",
                    unit.odometer_km,
                    latest.pdi_no if latest else "",
                    latest.get_status_display() if latest else "",
                    unit.selling_price or "",
                    unit.sold_price or "",
                    unit.sold_date.isoformat() if unit.sold_date else "",
                ]
            )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            'attachment; filename="vehicle-units.csv"'
        )
        return response


def create_pdi_for_unit(unit, user, inspection_type="PDI"):
    """Shared helper: open a DRAFT inspection for a unit (guards + snapshots)."""
    insp_type = (inspection_type or "PDI").upper()
    if unit.pdi_inspections.filter(
        inspection_type=insp_type,
        status__in=[
            PDIInspection.InspectionStatus.DRAFT,
            PDIInspection.InspectionStatus.SUBMITTED,
        ],
    ).exists():
        raise ValidationError(
            f"This vehicle already has an open {insp_type} inspection."
        )
    if insp_type == PDIInspection.InspectionType.PDI:
        if unit.status not in (
            VehicleUnit.Status.IN_WAREHOUSE,
            VehicleUnit.Status.PDI_FAILED,
        ):
            raise ValidationError(
                f"Cannot start PDI from status {unit.get_status_display()}."
            )
    elif insp_type == PDIInspection.InspectionType.VEI:
        if unit.status in (VehicleUnit.Status.SOLD, VehicleUnit.Status.SCRAPPED):
            raise ValidationError(
                f"Cannot start VEI for vehicle in status {unit.get_status_display()}."
            )

    # VEI and PDI are separate documents but share the same checklist form.
    template = PDITemplate.get_template_for_vehicle("PDI", vehicle_unit=unit)
    if not template:
        raise ValidationError("No active PDI checklist template exists.")
    model = unit.vehicle_model
    with transaction.atomic():
        inspection = PDIInspection.objects.create(
            inspection_type=insp_type,
            vehicle=unit,
            template=template,
            import_batch=unit.import_batch,
            vin_chassis_no=unit.vin_chassis_no,
            model_snapshot=str(model),
            battery_power_snapshot=str(unit.effective_battery_kw or ""),
            motor_power_snapshot=str(unit.effective_motor_kw or ""),
            motor_no_snapshot=unit.motor_no,
            manufacture_date_snapshot=unit.manufacture_date,
            color_snapshot=unit.color,
            odometer_km_snapshot=unit.odometer_km,
            checked_by=(
                (user.get_full_name() or user.username) if user else ""
            ),
            checked_by_user=user,
            created_by=user if user and user.is_authenticated else None,
            updated_by=user if user and user.is_authenticated else None,
        )
        PDIResult.objects.bulk_create(
            [
                PDIResult(
                    inspection=inspection,
                    item=item,
                    label_snapshot=item.label,
                    section_snapshot=item.section,
                    sub_section_snapshot=item.sub_section or "",
                )
                for item in template.items.all()
            ]
        )
        if insp_type == PDIInspection.InspectionType.PDI:
            unit.transition_to(
                VehicleUnit.Status.PDI_PENDING,
                by=user,
                note=f"PDI {inspection.pdi_no} started",
            )
        else:
            from common.models import log_audit_event
            log_audit_event(
                instance=inspection,
                field_name="status",
                old_value=None,
                new_value="DRAFT",
                changed_by=user,
                source="INVENTORY",
                summary=f"Vehicle Entry Inspection (VEI) started: {inspection.pdi_no}",
            )
    return inspection


class PDIInspectionViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = PDIInspection.objects.all()
    serializer_class = PDIInspectionSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_pdiinspection"],
        "retrieve": ["inventory.view_pdiinspection"],
        "create": ["inventory.add_pdiinspection"],
        "update": ["inventory.change_pdiinspection"],
        "partial_update": ["inventory.change_pdiinspection"],
        "destroy": ["inventory.delete_pdiinspection"],
        "submit": ["inventory.change_pdiinspection"],
        "complete": ["inventory.complete_pdiinspection"],
        "lock": ["inventory.change_pdiinspection"],
        "reopen": ["inventory.reopen_pdiinspection"],
        "approve": ["inventory.change_pdiinspection"],
        "reject": ["inventory.change_pdiinspection"],
        "record_print": ["inventory.print_pdiinspection"],
        "result_photo": ["inventory.view_pdiinspection", "inventory.change_pdiinspection"],
        "upload_photo": ["inventory.change_pdiinspection"],
        "view_photo": ["inventory.view_pdiinspection"],
        "signature": ["inventory.view_pdiinspection"],
        "resolve_issue": ["inventory.resolve_inspectionissue", "inventory.change_pdiinspection"],
        "default": ["inventory.view_pdiinspection"],
    }

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("vehicle", "template", "import_batch")
            .prefetch_related("results__item", "issues", "general_photos")
        )
        params = self.request.query_params
        if params.get("vehicle"):
            qs = qs.filter(vehicle_id=params["vehicle"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("inspection_type"):
            qs = qs.filter(inspection_type=params["inspection_type"].upper())
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None
        if date_from:
            qs = qs.filter(inspection_date__gte=date_from)
        if date_to:
            qs = qs.filter(inspection_date__lte=date_to)

        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(vehicle__dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = params.get("dealer")
                if dealer:
                    qs = qs.filter(vehicle__dealer_id=dealer)
        else:
            dealer = params.get("dealer")
            if dealer:
                qs = qs.filter(vehicle__dealer_id=dealer)

        return qs.order_by("-inspection_date", "-id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def create(self, request, *args, **kwargs):
        """Direct create = start PDI or VEI for a vehicle ({vehicle: id, inspection_type: 'PDI'|'VEI'})."""
        vehicle_id = request.data.get("vehicle")
        insp_type = (request.data.get("inspection_type") or "PDI").upper()
        if insp_type not in (PDIInspection.InspectionType.PDI, PDIInspection.InspectionType.VEI):
            raise ValidationError({"inspection_type": f"Invalid inspection type '{insp_type}'."})
        if not vehicle_id:
            raise ValidationError({"vehicle": "Vehicle id is required."})
        unit = get_object_or_404(VehicleUnit, pk=vehicle_id)

        user = request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None and unit.dealer_id != home_dealer:
                raise PermissionDenied("You do not have permission to inspect vehicles belonging to another dealership.")
            elif user_has_dealer_role(user) and not home_dealer:
                raise PermissionDenied("Dealer users without an assigned home dealership cannot create inspections.")

        try:
            inspection = create_pdi_for_unit(
                unit,
                request.user if request.user.is_authenticated else None,
                inspection_type=insp_type,
            )
        except DjangoValidationError as exc:
            raise ValidationError(str(exc))
        data = self.get_serializer(inspection).data
        return Response(data, status=http_status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.is_locked:
            raise ValidationError("Submitted inspections cannot be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a draft/submitted inspection: verifies items, sets rating, marks COMPLETED."""
        inspection = self.get_object()
        if inspection.status not in (
            PDIInspection.InspectionStatus.DRAFT,
            PDIInspection.InspectionStatus.SUBMITTED,
        ):
            raise ValidationError("Only draft or submitted inspections can be completed.")
        rating = request.data.get("overall_rating") or inspection.overall_rating
        checked_by = request.data.get("checked_by") or inspection.checked_by
        if not rating:
            raise ValidationError({"overall_rating": "Overall rating is required."})
        if rating not in dict(OverallRating.choices):
            raise ValidationError({"overall_rating": "Invalid rating."})
        if not checked_by:
            raise ValidationError({"checked_by": "Check staff is required."})
        results_data = request.data.get("results")
        user = request.user if request.user.is_authenticated else None
        try:
            with transaction.atomic():
                inspection.overall_rating = rating
                inspection.checked_by = checked_by
                inspection.save(update_fields=["overall_rating", "checked_by", "updated_at"])
                if results_data is not None:
                    serializer = self.get_serializer(
                        inspection,
                        data={"results_write": results_data},
                        partial=True,
                    )
                    serializer.is_valid(raise_exception=True)
                    serializer.save()
                if not inspection.results.exclude(result=CheckResult.NA).exists():
                    raise ValidationError(
                        "Checklist items must be inspected before completing the inspection."
                    )
                expected = inspection.template.items.count()
                answered = inspection.results.exclude(result="").count()
                if answered < expected:
                    raise ValidationError(
                        f"All {expected} checklist items must be answered ({answered} done)."
                    )
                if inspection.inspection_type == PDIInspection.InspectionType.PDI:
                    target = inspection.compute_vehicle_target()
                    unit = inspection.vehicle
                    if unit.status == VehicleUnit.Status.PDI_PENDING:
                        unit.transition_to(
                            target,
                            by=user,
                            note=f"PDI {inspection.pdi_no} completed ({inspection.get_overall_rating_display()})",
                        )
                inspection.status = PDIInspection.InspectionStatus.COMPLETED
                if not inspection.submitted_at:
                    inspection.submitted_at = timezone.now()
                inspection.save(update_fields=["status", "submitted_at", "updated_at"])
        except DjangoValidationError as exc:
            raise ValidationError(str(exc))
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        """Lock an inspection to freeze state."""
        inspection = self.get_object()
        if inspection.status not in (
            PDIInspection.InspectionStatus.COMPLETED,
            PDIInspection.InspectionStatus.APPROVED,
            PDIInspection.InspectionStatus.SUBMITTED,
        ):
            raise ValidationError("Only completed, approved, or submitted inspections can be locked.")
        inspection.status = PDIInspection.InspectionStatus.LOCKED
        inspection.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Reopen a completed or locked inspection back to DRAFT. Requires inventory.reopen_pdiinspection."""
        inspection = self.get_object()
        if inspection.status == PDIInspection.InspectionStatus.DRAFT:
            raise ValidationError("Inspection is already in draft status.")
        user = request.user if request.user.is_authenticated else None
        note = str(request.data.get("note") or f"Inspection {inspection.pdi_no} reopened")
        with transaction.atomic():
            inspection.status = PDIInspection.InspectionStatus.DRAFT
            inspection.save(update_fields=["status", "updated_at"])
            if inspection.inspection_type == PDIInspection.InspectionType.PDI:
                unit = inspection.vehicle
                if unit.status in (
                    VehicleUnit.Status.PDI_PASSED,
                    VehicleUnit.Status.PDI_FAILED,
                ):
                    unit.transition_to(
                        VehicleUnit.Status.PDI_PENDING,
                        by=user,
                        note=f"PDI {inspection.pdi_no} reopened: {note}",
                    )
            from common.models import log_audit_event
            log_audit_event(
                instance=inspection,
                field_name="status",
                old_value="LOCKED/COMPLETED",
                new_value="DRAFT",
                changed_by=user,
                source="INVENTORY",
                summary=f"Reopened inspection {inspection.pdi_no}: {note}",
            )
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=["post"], url_path="record-print")
    def record_print(self, request, pk=None):
        """Record print event in audit ledger."""
        inspection = self.get_object()
        from common.models import record_print_event
        user = request.user if request.user.is_authenticated else None
        doc_type = f"{inspection.inspection_type}_REPORT"
        title = f"{inspection.get_inspection_type_display()} #{inspection.pdi_no}"
        ip = request.META.get("REMOTE_ADDR")
        log = record_print_event(
            user=user,
            document_type=doc_type,
            object_id=str(inspection.id),
            title=title,
            ip_address=ip,
        )
        return Response({"detail": "Print event recorded.", "log_id": log.id})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Lock a draft PDI, move the vehicle to PASSED/FAILED, ledger it."""
        inspection = self.get_object()
        if inspection.status != PDIInspection.InspectionStatus.DRAFT:
            raise ValidationError("Only draft inspections can be submitted.")
        rating = request.data.get("overall_rating") or inspection.overall_rating
        checked_by = request.data.get("checked_by") or inspection.checked_by
        if not rating:
            raise ValidationError({"overall_rating": "Overall rating is required."})
        if rating not in dict(OverallRating.choices):
            raise ValidationError({"overall_rating": "Invalid rating."})
        if not checked_by:
            raise ValidationError({"checked_by": "Check staff is required."})
        results_data = request.data.get("results")
        user = request.user if request.user.is_authenticated else None
        try:
            with transaction.atomic():
                inspection.overall_rating = rating
                inspection.checked_by = checked_by
                inspection.save(update_fields=["overall_rating", "checked_by", "updated_at"])
                if results_data is not None:
                    serializer = self.get_serializer(
                        inspection,
                        data={"results_write": results_data},
                        partial=True,
                    )
                    serializer.is_valid(raise_exception=True)
                    serializer.save()
                # Every template item must be answered (OK / Not OK / N/A all count).
                expected = inspection.template.items.count()
                answered = inspection.results.exclude(result="").count()
                if answered < expected:
                    raise ValidationError(
                        f"All {expected} checklist items must be answered "
                        f"({answered} done)."
                    )
                target = inspection.compute_vehicle_target()
                unit = inspection.vehicle
                if unit.status != VehicleUnit.Status.PDI_PENDING:
                    raise ValidationError(
                        f"Vehicle is {unit.get_status_display()}; "
                        "re-inspection must start from a pending/failed unit."
                    )
                unit.transition_to(
                    target, by=user, note=f"PDI {inspection.pdi_no} submitted ({inspection.get_overall_rating_display()})"
                )
                inspection.status = PDIInspection.InspectionStatus.SUBMITTED
                inspection.submitted_at = timezone.now()
                inspection.save(update_fields=["status", "submitted_at", "updated_at"])
        except DjangoValidationError as exc:
            raise ValidationError(str(exc))
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        inspection = self.get_object()
        if inspection.status != PDIInspection.InspectionStatus.SUBMITTED:
            raise ValidationError("Only submitted inspections can be approved.")
        user = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            inspection.status = PDIInspection.InspectionStatus.APPROVED
            inspection.save(update_fields=["status", "updated_at"])
            unit = inspection.vehicle
            if unit.status in (VehicleUnit.Status.PDI_PASSED, VehicleUnit.Status.IN_WAREHOUSE):
                unit.transition_to(
                    VehicleUnit.Status.READY_FOR_SALE,
                    by=user,
                    note=f"PDI {inspection.pdi_no} approved. Automatically moved to Ready for Sale.",
                )
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        inspection = self.get_object()
        if inspection.status != PDIInspection.InspectionStatus.SUBMITTED:
            raise ValidationError("Only submitted inspections can be rejected.")
        note = str(request.data.get("note") or f"PDI {inspection.pdi_no} rejected")
        user = request.user if request.user.is_authenticated else None
        try:
            with transaction.atomic():
                inspection.status = PDIInspection.InspectionStatus.REJECTED
                inspection.save(update_fields=["status", "updated_at"])
                unit = inspection.vehicle
                if unit.status in (
                    VehicleUnit.Status.PDI_PASSED,
                    VehicleUnit.Status.PDI_FAILED,
                ):
                    unit.transition_to(
                        VehicleUnit.Status.PDI_PENDING, by=user, note=note
                    )
        except DjangoValidationError as exc:
            raise ValidationError(str(exc))
        return Response(self.get_serializer(inspection).data)

    @action(
        detail=True,
        methods=["get", "post", "delete"],
        url_path=r"results/(?P<item_id>[^/.]+)/photo",
        parser_classes=[MultiPartParser, FormParser],
    )
    def result_photo(self, request, pk=None, item_id=None):
        """View (GET), attach (POST), or clear (DELETE) defect-evidence photo for one row."""
        inspection = self.get_object()
        result = get_object_or_404(PDIResult, inspection=inspection, item_id=item_id)
        if request.method == "GET":
            return _private_file_response(result.photo)
        if not (
            request.user.is_superuser
            or user_is_super_admin(request.user)
            or user_has_perm(request.user, "inventory.change_pdiinspection")
        ):
            raise PermissionDenied("You do not have permission to modify inspection photos.")
        if inspection.is_locked:
            raise ValidationError("Submitted inspections are locked.")
        if request.method == "DELETE":
            if result.photo:
                result.photo.delete(save=False)
                result.photo = None
                result.save(update_fields=["photo"])
            return Response({"detail": "Photo removed."})
        image = request.FILES.get("photo") or request.FILES.get("image")
        if not image:
            raise ValidationError({"photo": "No image file provided."})
        result.photo = image
        try:
            result.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))
        result.save()
        return Response(PDIResultSerializer(result, context={"request": request}).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="photos",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_photo(self, request, pk=None):
        """Upload a general photo for this inspection (JPEG, PNG, WebP <= 5MB)."""
        inspection = self.get_object()
        image = request.FILES.get("photo") or request.FILES.get("image")
        if not image:
            raise ValidationError({"photo": "Photo file is required."})
        caption = request.data.get("caption", "")
        photo_obj = InspectionPhoto(
            inspection=inspection,
            photo=image,
            caption=caption,
            uploaded_by=request.user if request.user.is_authenticated else None,
        )
        try:
            photo_obj.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else str(exc))
        photo_obj.save()
        return Response(
            InspectionPhotoSerializer(photo_obj, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"photos/(?P<photo_id>[^/.]+)/view",
    )
    def view_photo(self, request, pk=None, photo_id=None):
        """Serve a general inspection photo from private storage."""
        inspection = self.get_object()
        photo_obj = get_object_or_404(InspectionPhoto, inspection=inspection, pk=photo_id)
        return _private_file_response(photo_obj.photo)

    @action(detail=True, methods=["get"], url_path="signature")
    def signature(self, request, pk=None):
        """Serve the technician signature image from private storage."""
        inspection = self.get_object()
        return _private_file_response(inspection.signature)

    @action(detail=True, methods=["post"], url_path="resolve-issue")
    def resolve_issue(self, request, pk=None):
        """Mark an inspection issue as resolved."""
        inspection = self.get_object()
        issue_id = request.data.get("issue_id")
        notes = request.data.get("notes", "")
        if not issue_id:
            raise ValidationError({"issue_id": "Issue ID is required."})
        issue = get_object_or_404(inspection.issues, pk=issue_id)
        issue.resolve(
            user=request.user if request.user.is_authenticated else None,
            notes=notes,
        )
        return Response(InspectionIssueSerializer(issue).data)


class ConditionReportViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = ConditionReport.objects.all()
    serializer_class = ConditionReportSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_conditionreport"],
        "retrieve": ["inventory.view_conditionreport"],
        "create": ["inventory.add_conditionreport"],
        "update": ["inventory.change_conditionreport"],
        "partial_update": ["inventory.change_conditionreport"],
        "destroy": ["inventory.delete_conditionreport"],
        "photos": ["inventory.change_conditionreport"],
        "delete_photo": ["inventory.change_conditionreport"],
        "view_photo": ["inventory.view_conditionreport"],
        "result_photo": ["inventory.view_conditionreport", "inventory.change_conditionreport"],
        "default": ["inventory.view_conditionreport"],
    }

    def get_queryset(self):
        qs = (
            super()
            .get_queryset()
            .select_related("vehicle", "template")
            .prefetch_related("results__item", "photos")
        )
        params = self.request.query_params
        if params.get("vehicle"):
            qs = qs.filter(vehicle_id=params["vehicle"])
        if params.get("report_type"):
            qs = qs.filter(report_type=params["report_type"])
        return qs.order_by("-report_date", "-id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    @action(
        detail=True,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def photos(self, request, pk=None):
        """Upload one or more gallery photos (captions as JSON list or dict)."""
        report = self.get_object()
        files = request.FILES.getlist("photos") or ([request.FILES["photo"]] if "photo" in request.FILES else [])
        if not files:
            raise ValidationError({"photos": "No image files provided."})
        import json as _json

        captions = []
        raw_captions = request.data.get("captions")
        if raw_captions:
            try:
                captions = _json.loads(raw_captions)
                if isinstance(captions, dict):
                    captions = [captions.get(f"photo_{i}", "") for i in range(len(files))]
            except ValueError:
                captions = []
        created = []
        for idx, image in enumerate(files[:20]):
            caption = ""
            if idx < len(captions) and isinstance(captions[idx], str):
                caption = captions[idx][:120]
            photo = ConditionPhoto.objects.create(
                report=report, image=image, caption=caption
            )
            created.append(photo)
        data = ConditionPhotoSerializer(
            created, many=True, context={"request": request}
        ).data
        return Response(data, status=http_status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"photos/(?P<photo_id>[^/.]+)",
    )
    def delete_photo(self, request, pk=None, photo_id=None):
        report = self.get_object()
        photo = get_object_or_404(ConditionPhoto, report=report, pk=photo_id)
        photo.image.delete(save=False)
        photo.delete()
        return Response({"detail": "Photo deleted."})

    @action(
        detail=True,
        methods=["get"],
        url_path=r"photos/(?P<photo_id>[^/.]+)/view",
    )
    def view_photo(self, request, pk=None, photo_id=None):
        """Serve a condition gallery photo from private storage."""
        report = self.get_object()
        photo = get_object_or_404(ConditionPhoto, report=report, pk=photo_id)
        return _private_file_response(photo.image)

    @action(
        detail=True,
        methods=["get", "post", "delete"],
        url_path=r"results/(?P<item_id>[^/.]+)/photo",
        parser_classes=[MultiPartParser, FormParser],
    )
    def result_photo(self, request, pk=None, item_id=None):
        report = self.get_object()
        result = get_object_or_404(
            ConditionResult, report=report, item_id=item_id
        )
        if request.method == "GET":
            return _private_file_response(result.photo)
        if not (
            request.user.is_superuser
            or user_is_super_admin(request.user)
            or user_has_perm(request.user, "inventory.change_conditionreport")
        ):
            raise PermissionDenied("You do not have permission to modify condition report photos.")
        if request.method == "DELETE":
            if result.photo:
                result.photo.delete(save=False)
                result.photo = None
                result.save(update_fields=["photo"])
            return Response({"detail": "Photo removed."})
        image = request.FILES.get("photo") or request.FILES.get("image")
        if not image:
            raise ValidationError({"photo": "No image file provided."})
        result.photo.save(image.name, image, save=True)
        return Response(
            ConditionResultSerializer(result, context={"request": request}).data
        )


class PDITemplateViewSet(viewsets.ModelViewSet):
    queryset = PDITemplate.objects.select_related("vehicle_model", "variant").prefetch_related("items").all()
    serializer_class = PDITemplateSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_pditemplate"],
        "retrieve": ["inventory.view_pditemplate"],
        "create": ["inventory.manage_pditemplate"],
        "update": ["inventory.manage_pditemplate"],
        "partial_update": ["inventory.manage_pditemplate"],
        "destroy": ["inventory.manage_pditemplate"],
        "active": ["inventory.view_pditemplate"],
        "new_version": ["inventory.manage_pditemplate"],
        "add_item": ["inventory.manage_pditemplate"],
        "update_item": ["inventory.manage_pditemplate"],
        "delete_item": ["inventory.manage_pditemplate"],
        "default": ["inventory.view_pditemplate"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        insp_type = self.request.query_params.get("inspection_type")
        if insp_type:
            qs = qs.filter(inspection_type=insp_type.upper())
        if self.request.query_params.get("vehicle_model"):
            qs = qs.filter(vehicle_model_id=self.request.query_params["vehicle_model"])
        if self.request.query_params.get("variant"):
            qs = qs.filter(variant_id=self.request.query_params["variant"])
        return qs

    @action(detail=False, methods=["get"])
    def active(self, request):
        """Active checklist template with items (supports fallback hierarchy: variant -> model -> global default)."""
        insp_type = (request.query_params.get("inspection_type") or "PDI").upper()
        unit_id = request.query_params.get("unit_id") or request.query_params.get("vehicle")
        unit = None
        if unit_id:
            unit = VehicleUnit.objects.filter(pk=unit_id).first()
        m_id = request.query_params.get("vehicle_model")
        v_id = request.query_params.get("variant")
        template = PDITemplate.get_template_for_vehicle(
            inspection_type=insp_type,
            vehicle_unit=unit,
            vehicle_model_id=m_id,
            variant_id=v_id,
        )
        if not template:
            return Response(
                {"detail": f"No active {insp_type} checklist template."}, status=404
            )
        return Response(self.get_serializer(template).data)

    @action(detail=False, methods=["post"])
    def new_version(self, request):
        """Clone the active template into a new version (old ones stay intact)."""
        insp_type = (
            request.data.get("inspection_type")
            or request.query_params.get("inspection_type")
            or "PDI"
        ).upper()
        current = (
            PDITemplate.objects.filter(is_active=True, inspection_type=insp_type)
            .order_by("-version_no")
            .first()
        )
        with transaction.atomic():
            latest = (
                PDITemplate.objects.filter(inspection_type=insp_type)
                .order_by("-version_no")
                .first()
            )
            next_version = (latest.version_no + 1) if latest else 1
            template = PDITemplate.objects.create(
                version_no=next_version,
                inspection_type=insp_type,
                is_active=True,
            )
            if current:
                PDIChecklistItem.objects.bulk_create(
                    [
                        PDIChecklistItem(
                            template=template,
                            section=item.section,
                            sub_section=item.sub_section,
                            label=item.label,
                            sort_order=item.sort_order,
                        )
                        for item in current.items.all()
                    ]
                )
                current.is_active = False
                current.save(update_fields=["is_active"])
        return Response(
            self.get_serializer(template).data, status=http_status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        template = self.get_object()
        serializer = PDIChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(template=template)
        return Response(serializer.data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["put", "patch"], url_path=r"items/(?P<item_id>[^/.]+)")
    def update_item(self, request, pk=None, item_id=None):
        template = self.get_object()
        item = get_object_or_404(template.items, pk=item_id)
        serializer = PDIChecklistItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>[^/.]+)/delete")
    def delete_item(self, request, pk=None, item_id=None):
        template = self.get_object()
        item = get_object_or_404(template.items, pk=item_id)
        item.delete()
        return Response({"detail": "Checklist item deleted."})


class StockViewSet(viewsets.ViewSet):
    """Stock management dashboard aggregates (auditable: movements + status)."""

    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_vehicleunit"],
        "batches": ["inventory.view_importbatch"],
        "aging": ["inventory.view_vehicleunit"],
        "default": ["inventory.view_vehicleunit"],
    }

    def _base_qs(self, request):
        qs = VehicleUnit.objects.select_related("vehicle_model", "import_batch").filter(
            is_deleted=False
        )
        user = request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
        return qs

    def list(self, request):
        """Full dashboard payload: KPIs, breakdowns, trend, alerts."""
        qs = self._base_qs(request)
        S = VehicleUnit.Status
        params = request.query_params
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None

        imported_qs = qs
        sold_qs = qs.filter(status=S.SOLD)
        if date_from:
            imported_qs = imported_qs.filter(created_at__date__gte=date_from)
            sold_qs = sold_qs.filter(sold_date__gte=date_from)
        if date_to:
            imported_qs = imported_qs.filter(created_at__date__lte=date_to)
            sold_qs = sold_qs.filter(sold_date__lte=date_to)

        remaining = qs.exclude(status__in=[S.SOLD, S.SCRAPPED])
        counts = {
            row["status"]: row["n"] for row in qs.values("status").annotate(n=Count("id"))
        }
        today = date.today()
        month_start = today.replace(day=1)
        sold_month = qs.filter(status=S.SOLD, sold_date__gte=month_start).count()

        # Breakdown by model.
        by_model = []
        for model in VehicleModel.objects.filter(is_active=True).order_by("brand", "model_name"):
            units = qs.filter(vehicle_model=model)
            imported = units.count()
            sold = units.filter(status=S.SOLD).count()
            left = units.exclude(status__in=[S.SOLD, S.SCRAPPED]).count()
            reserved = units.filter(status=S.RESERVED).count()
            by_model.append(
                {
                    "id": model.id,
                    "brand": model.brand,
                    "model_name": model.model_name,
                    "imported": imported,
                    "sold": sold,
                    "remaining": left,
                    "reserved": reserved,
                    "threshold": model.low_stock_threshold,
                    "low_stock": left <= model.low_stock_threshold,
                }
            )

        # Breakdown by color (current remaining stock).
        by_color = [
            {"color": row["color"] or "Unspecified", "count": row["n"]}
            for row in remaining.exclude(color="").values("color").annotate(n=Count("id")).order_by("-n")
        ]

        # Monthly trend (last 12 months, imported vs sold).
        trend = []
        cursor = month_start
        for _ in range(12):
            year, month = cursor.year, cursor.month
            if month == 12:
                next_month = date(year + 1, 1, 1)
            else:
                next_month = date(year, month + 1, 1)
            trend.append(
                {
                    "month": cursor.strftime("%Y-%m"),
                    "imported": qs.filter(
                        created_at__date__gte=cursor, created_at__date__lt=next_month
                    ).count(),
                    "sold": qs.filter(
                        status=S.SOLD, sold_date__gte=cursor, sold_date__lt=next_month
                    ).count(),
                }
            )
            cursor = (cursor - timedelta(days=1)).replace(day=1)
        trend.reverse()

        alerts = [m for m in by_model if m["low_stock"] and m["imported"] > 0]

        return Response(
            {
                "kpis": {
                    "total_imported": imported_qs.count(),
                    "total_sold": sold_qs.count(),
                    "remaining": remaining.count(),
                    "in_transit": counts.get(S.IN_TRANSIT, 0),
                    "in_warehouse": counts.get(S.IN_WAREHOUSE, 0),
                    "pdi_pending": counts.get(S.PDI_PENDING, 0),
                    "pdi_failed": counts.get(S.PDI_FAILED, 0),
                    "ready_for_sale": counts.get(S.READY_FOR_SALE, 0),
                    "reserved": counts.get(S.RESERVED, 0),
                    "sold": counts.get(S.SOLD, 0),
                    "sold_this_month": sold_month,
                    "returned": counts.get(S.RETURNED, 0),
                    "scrapped": counts.get(S.SCRAPPED, 0),
                },
                "by_model": by_model,
                "by_color": by_color,
                "trend": trend,
                "low_stock_alerts": alerts,
            }
        )

    @action(detail=False, methods=["get"])
    def batches(self, request):
        """Per-batch table: imported / sold / remaining / % sold."""
        rows = []
        for batch in (
            ImportBatch.objects.filter(is_deleted=False)
            .prefetch_related("units")
            .order_by("-created_at", "-id")
        ):
            units = batch.units.filter(is_deleted=False)
            imported = units.count()
            sold = units.filter(status=VehicleUnit.Status.SOLD).count()
            remaining = units.exclude(
                status__in=[VehicleUnit.Status.SOLD, VehicleUnit.Status.SCRAPPED]
            ).count()
            rows.append(
                {
                    "id": batch.id,
                    "batch_no": batch.batch_no,
                    "origin": batch.origin,
                    "arrived_date": batch.arrived_date,
                    "imported": imported,
                    "sold": sold,
                    "remaining": remaining,
                    "pct_sold": round(sold / imported * 100, 1) if imported else 0,
                }
            )
        return Response(rows)

    @action(detail=False, methods=["get"])
    def aging(self, request):
        """Oldest units sitting in warehouse / waiting on PDI."""
        S = VehicleUnit.Status
        today = date.today()

        def serialize(units):
            out = []
            for unit in units:
                days = (today - unit.created_at.date()).days
                out.append(
                    {
                        "id": unit.id,
                        "vin_chassis_no": unit.vin_chassis_no,
                        "model": str(unit.vehicle_model),
                        "status": unit.status,
                        "created_at": unit.created_at,
                        "days_in_stock": days,
                    }
                )
            return out

        warehouse = (
            self._base_qs(request)
            .filter(status__in=[S.IN_TRANSIT, S.IN_WAREHOUSE, S.PDI_FAILED, S.RETURNED])
            .order_by("created_at", "id")[:20]
        )
        pdi_pending = (
            self._base_qs(request).filter(status=S.PDI_PENDING).order_by("created_at", "id")[:20]
        )
        return Response(
            {
                "warehouse": serialize(warehouse),
                "pdi_pending": serialize(pdi_pending),
            }
        )


class VehicleReceiveCheckListViewSet(viewsets.ModelViewSet):
    """Vehicle receive checklist — service intake (VRO) or legacy inventory receive."""

    serializer_class = VehicleReceiveCheckListSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_vehicleunit", "servicing.view_servicerecord"],
        "retrieve": ["inventory.view_vehicleunit", "servicing.view_servicerecord"],
        "create": ["inventory.change_vehicleunit", "servicing.add_servicerecord"],
        "update": ["inventory.change_vehicleunit", "servicing.change_servicerecord"],
        "partial_update": ["inventory.change_vehicleunit", "servicing.change_servicerecord"],
        "destroy": ["inventory.delete_vehicleunit", "servicing.delete_servicerecord"],
        "default": ["inventory.view_vehicleunit", "servicing.view_servicerecord"],
    }

    def get_queryset(self):
        qs = VehicleReceiveCheckList.objects.select_related(
            "vehicle",
            "vehicle__vehicle_model",
            "import_batch",
            "service_record",
            "created_by",
        ).all()
        params = self.request.query_params
        vehicle_id = params.get("vehicle")
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        service_record_id = params.get("service_record")
        if service_record_id:
            qs = qs.filter(service_record_id=service_record_id)
        batch_id = params.get("batch")
        if batch_id:
            qs = qs.filter(import_batch_id=batch_id)
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(receive_no__icontains=search)
                | Q(vehicle__vin_chassis_no__icontains=search)
                | Q(driver_name__icontains=search)
                | Q(driver_contact__icontains=search)
                | Q(any_other_information__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)


class SaleViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Viewset for vehicle sale records: listing, retrieval, field edits, and cancellation."""

    serializer_class = SaleSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_sale", "inventory.view_vehicleunit", "crm.view_quotation"],
        "retrieve": ["inventory.view_sale", "inventory.view_vehicleunit", "crm.view_quotation"],
        "update": ["inventory.change_sale"],
        "partial_update": ["inventory.change_sale"],
        "cancel": ["inventory.cancel_sale"],
        "default": ["inventory.view_sale", "inventory.view_vehicleunit", "crm.view_quotation"],
    }

    def get_queryset(self):
        qs = Sale.objects.select_related(
            "unit",
            "unit__vehicle_model",
            "variant",
            "variant__body_type",
            "customer",
            "lead",
            "quotation",
            "salesperson",
            "cancelled_by",
        ).all()
        params = self.request.query_params
        if not params.get("include_deleted"):
            qs = qs.filter(is_deleted=False)
        unit_id = params.get("unit")
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        variant_id = params.get("variant")
        if variant_id:
            qs = qs.filter(variant_id=variant_id)
        customer_id = params.get("customer")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        lead_id = params.get("lead")
        if lead_id:
            qs = qs.filter(lead_id=lead_id)
        quotation_id = params.get("quotation")
        if quotation_id:
            qs = qs.filter(quotation_id=quotation_id)
        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(unit__vin_chassis_no__icontains=search)
                | Q(customer__name__icontains=search)
                | Q(tax_invoice_no__icontains=search)
                | Q(receipt_no__icontains=search)
            )

        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        return qs.order_by("-sale_date", "-id")

    def update(self, request, *args, **kwargs):
        from inventory.services.sales import update_sale_fields

        instance = self.get_object()
        user = request.user if request.user.is_authenticated else None
        try:
            updated_sale = update_sale_fields(
                sale_id=instance.id,
                data=request.data,
                user=user,
            )
        except ValidationError as e:
            return Response(e.detail, status=http_status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(updated_sale)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        from inventory.services.sales import cancel_sale

        sale = self.get_object()
        user = request.user
        if not (user.is_superuser or user_has_perm(user, "inventory.cancel_sale")):
            return Response(
                {"detail": "Permission denied: inventory.cancel_sale required to cancel a sale."},
                status=http_status.HTTP_403_FORBIDDEN,
            )
        reason = request.data.get("cancellation_reason") or request.data.get("reason")
        if not reason or not str(reason).strip():
            return Response(
                {"cancellation_reason": ["A cancellation reason is required."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        try:
            cancelled_sale = cancel_sale(
                sale_id=sale.id,
                cancellation_reason=str(reason).strip(),
                user=user,
            )
        except ValidationError as e:
            return Response(e.detail, status=http_status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(cancelled_sale)
        return Response(serializer.data)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """Ledger of stock-affecting events.
    Dealer users only see movements for units assigned to their home dealer.
    Head office / super admin see all, with an optional dealer filter.
    """

    queryset = StockMovement.objects.select_related("vehicle", "vehicle__dealer", "created_by").all()
    serializer_class = StockMovementSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.view_stockmovement", "inventory.view_vehicleunit"],
        "retrieve": ["inventory.view_stockmovement", "inventory.view_vehicleunit"],
        "default": ["inventory.view_stockmovement", "inventory.view_vehicleunit"],
    }

    def get_queryset(self):
        qs = StockMovement.objects.select_related("vehicle", "vehicle__dealer", "created_by").all()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(vehicle__dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(vehicle__dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(vehicle__dealer_id=dealer)

        movement_type = self.request.query_params.get("movement_type")
        if movement_type:
            qs = qs.filter(movement_type=movement_type)
        vehicle_id = self.request.query_params.get("vehicle") or self.request.query_params.get("unit")
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)

        return qs.order_by("-created_at", "-id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


def _import_file_too_large(size: int) -> str:
    from .services.historical_import import MAX_IMPORT_FILE_BYTES

    return (
        f"The file is {size / (1024 * 1024):.1f} MB, which exceeds the "
        f"{MAX_IMPORT_FILE_BYTES // (1024 * 1024)} MB upload limit. Please split the file."
    )


class ImportJobViewSet(viewsets.ReadOnlyModelViewSet):
    """Management endpoints for historical bulk imports (Customers, Shipments, Units, Sales, Servicing)."""

    queryset = ImportJob.objects.select_related("uploaded_by", "rolled_back_by").all().order_by("-id")
    serializer_class = ImportJobSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["inventory.run_historical_import"],
        "retrieve": ["inventory.run_historical_import"],
        "dry_run": ["inventory.run_historical_import"],
        "commit": ["inventory.run_historical_import"],
        "template": ["inventory.run_historical_import"],
        "download_errors": ["inventory.run_historical_import"],
        "rollback": ["inventory.run_historical_import"],
        "default": ["inventory.run_historical_import"],
    }

    def perform_content_negotiation(self, request, force=False):
        if self.action in ("template", "download_errors"):
            from rest_framework.renderers import BaseRenderer

            class PassthroughRenderer(BaseRenderer):
                media_type = "*/*"
                format = "all"

                def render(self, data, accepted_media_type=None, renderer_context=None):
                    return data

            return (PassthroughRenderer(), "*/*")
        return super().perform_content_negotiation(request, force)

    def _check_central_access(self, request):
        user = request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            # Dealer users are strictly blocked
            if user_has_dealer_role(user) or user_dealer_id(user) is not None:
                raise PermissionDenied("Dealership accounts cannot perform central historical imports.")
            if not user.has_perm("inventory.run_historical_import"):
                raise PermissionDenied("You do not have permission to run historical imports.")

    def get_queryset(self):
        self._check_central_access(self.request)
        qs = super().get_queryset()
        import_type = self.request.query_params.get("import_type")
        if import_type:
            qs = qs.filter(import_type=import_type)
        status_val = self.request.query_params.get("status")
        if status_val:
            qs = qs.filter(status=status_val)
        return qs

    def list(self, request, *args, **kwargs):
        self._check_central_access(request)
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def retrieve(self, request, *args, **kwargs):
        self._check_central_access(request)
        return super().retrieve(request, *args, **kwargs)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser], url_path="dry-run")
    def dry_run(self, request):
        from .services import historical_import
        self._check_central_access(request)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "File is required."}, status=http_status.HTTP_400_BAD_REQUEST)
        import_type = request.data.get("import_type")
        if not import_type:
            return Response({"detail": "import_type is required."}, status=http_status.HTTP_400_BAD_REQUEST)
        update_existing = str(request.data.get("update_existing", "")).lower() in ("true", "1", "yes")
        calendar = str(request.data.get("calendar") or "ad").lower()
        if file_obj.size > historical_import.MAX_IMPORT_FILE_BYTES:
            return Response({"detail": _import_file_too_large(file_obj.size)}, status=http_status.HTTP_400_BAD_REQUEST)

        try:
            file_bytes = file_obj.read()
            result = historical_import.execute_dry_run(
                import_type=import_type,
                file_bytes=file_bytes,
                filename=file_obj.name,
                options={"update_existing": update_existing, "calendar": calendar},
            )
            return Response(result)
        except (DjangoValidationError, ValidationError, ValueError) as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=http_status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser, FormParser], url_path="commit")
    def commit(self, request):
        from .services import historical_import
        self._check_central_access(request)
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "File is required."}, status=http_status.HTTP_400_BAD_REQUEST)
        import_type = request.data.get("import_type")
        if not import_type:
            return Response({"detail": "import_type is required."}, status=http_status.HTTP_400_BAD_REQUEST)
        update_existing = str(request.data.get("update_existing", "")).lower() in ("true", "1", "yes")
        skip_invalid = str(request.data.get("skip_invalid", "")).lower() in ("true", "1", "yes")
        calendar = str(request.data.get("calendar") or "ad").lower()
        if file_obj.size > historical_import.MAX_IMPORT_FILE_BYTES:
            return Response({"detail": _import_file_too_large(file_obj.size)}, status=http_status.HTTP_400_BAD_REQUEST)

        try:
            file_bytes = file_obj.read()
            job = historical_import.execute_commit(
                import_type=import_type,
                file_bytes=file_bytes,
                filename=file_obj.name,
                user=request.user,
                options={"update_existing": update_existing, "skip_invalid": skip_invalid, "calendar": calendar},
                skip_invalid=skip_invalid,
            )
            serializer = self.get_serializer(job)
            return Response(serializer.data, status=http_status.HTTP_201_CREATED)
        except (DjangoValidationError, ValidationError, ValueError) as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=http_status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="rollback")
    def rollback(self, request, pk=None):
        from .services import historical_import
        if not (request.user.is_superuser or user_is_super_admin(request.user)):
            raise PermissionDenied("Only Super Admin can roll back historical import jobs.")
        try:
            job = historical_import.execute_rollback(job_id=int(pk), user=request.user)
            serializer = self.get_serializer(job)
            return Response(serializer.data)
        except (DjangoValidationError, ValidationError, ValueError) as e:
            msg = e.message if hasattr(e, "message") else str(e)
            return Response({"detail": msg}, status=http_status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], url_path="template")
    def template(self, request):
        from .services import historical_import
        self._check_central_access(request)
        import_type = request.query_params.get("import_type")
        fmt = (request.query_params.get("format") or "csv").lower()
        if not import_type:
            return Response({"detail": "import_type parameter is required."}, status=http_status.HTTP_400_BAD_REQUEST)

        try:
            if fmt == "xlsx":
                data = historical_import.generate_template_xlsx(import_type)
                response = HttpResponse(
                    data,
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                response["Content-Disposition"] = f'attachment; filename="template_{import_type}.xlsx"'
                return response
            else:
                data = historical_import.generate_template_csv(import_type)
                response = HttpResponse(data, content_type="text/csv; charset=utf-8-sig")
                response["Content-Disposition"] = f'attachment; filename="template_{import_type}.csv"'
                return response
        except ValueError as e:
            return Response({"detail": str(e)}, status=http_status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], url_path="download-errors")
    def download_errors(self, request):
        from .services import historical_import
        self._check_central_access(request)
        errors = request.data.get("errors") or []
        csv_bytes = historical_import.generate_error_csv(errors)
        response = HttpResponse(csv_bytes, content_type="text/csv; charset=utf-8-sig")
        response["Content-Disposition"] = 'attachment; filename="import_validation_errors.csv"'
        return response

