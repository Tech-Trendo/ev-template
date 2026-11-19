from __future__ import annotations

import base64
import uuid

from django.core.files.base import ContentFile
from rest_framework import serializers

from common.signed_urls import private_media_url

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
)


def _absolutize(request, src):
    if src and request is not None and not src.startswith("http"):
        return request.build_absolute_uri(src)
    return src


def decode_signature(data: str) -> ContentFile:
    """Decode a ``data:image/...;base64,`` signature payload into a file."""
    if "," in data:
        _header, data = data.split(",", 1)
    try:
        raw = base64.b64decode(data)
    except (ValueError, TypeError):
        raise serializers.ValidationError("Invalid signature image data.")
    if len(raw) > 2 * 1024 * 1024:
        raise serializers.ValidationError("Signature image is too large (max 2MB).")
    return ContentFile(raw, name=f"signature-{uuid.uuid4().hex}.png")


class VehicleModelSpecSerializer(serializers.ModelSerializer):
    vehicle_model_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VehicleModelSpec
        fields = [
            "id",
            "vehicle_model",
            "vehicle_model_name",
            "kind",
            "label",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "vehicle_model_name", "created_at", "updated_at"]

    def get_vehicle_model_name(self, obj):
        brand = obj.vehicle_model.brand or ""
        name = obj.vehicle_model.model_name or ""
        return f"{brand} {name}".strip()


class VehicleBodyTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleBodyType
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class VehicleVariantSerializer(serializers.ModelSerializer):
    body_type_name = serializers.CharField(source="body_type.name", read_only=True)
    vehicle_model_name = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = VehicleVariant
        fields = [
            "id",
            "vehicle_model",
            "vehicle_model_name",
            "name",
            "product_code",
            "body_type",
            "body_type_name",
            "spec_text",
            "price_override",
            "is_active",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "body_type_name",
            "vehicle_model_name",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_vehicle_model_name(self, obj) -> str:
        if obj.vehicle_model:
            return f"{obj.vehicle_model.brand} {obj.vehicle_model.model_name}".strip()
        return ""


class VehicleModelSerializer(serializers.ModelSerializer):
    units_in_stock = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    variants = serializers.SerializerMethodField(read_only=True)
    has_active_variants = serializers.BooleanField(read_only=True)
    range_km = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VehicleModel
        fields = [
            "id",
            "brand",
            "model_name",
            "battery_power_kw",
            "motor_power_kw",
            "seating_capacity",
            "charger_type",
            "default_color_options",
            "low_stock_threshold",
            "vehicle_warranty_months",
            "vehicle_warranty_km",
            "battery_warranty_months",
            "battery_warranty_km",
            "motor_warranty_months",
            "service_interval_months",
            "service_interval_km",
            "is_active",
            "has_active_variants",
            "range_km",
            "variants",
            "units_in_stock",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "has_active_variants",
            "variants",
            "units_in_stock",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_units_in_stock(self, obj) -> int:
        return obj.units.exclude(
            status__in=[VehicleUnit.Status.SOLD, VehicleUnit.Status.SCRAPPED]
        ).count()

    def get_variants(self, obj):
        variants = obj.variants.filter(is_active=True).order_by("name")
        return VehicleVariantSerializer(variants, many=True).data

    def get_range_km(self, obj) -> str:
        from crm.models import catalog_range_for_model

        return catalog_range_for_model(obj)


class TransportStatusOptionSerializer(serializers.ModelSerializer):
    batch_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = TransportStatusOption
        fields = [
            "id",
            "name",
            "label",
            "description",
            "is_active",
            "batch_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "batch_count", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("System code / name cannot be empty.")
        qs = TransportStatusOption.objects.filter(name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Transport status code '{name}' already exists.")
        return name

    def validate_label(self, value):
        label = value.strip()
        if not label:
            raise serializers.ValidationError("Display label cannot be empty.")
        return label


class BorderCrossingSerializer(serializers.ModelSerializer):
    batch_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = BorderCrossing
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "batch_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "batch_count", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Border crossing name cannot be empty.")
        qs = BorderCrossing.objects.filter(name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Border crossing '{name}' already exists.")
        return name


class DestinationWarehouseSerializer(serializers.ModelSerializer):
    batch_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = DestinationWarehouse
        fields = [
            "id",
            "name",
            "location",
            "contact_person",
            "phone",
            "is_active",
            "batch_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "batch_count", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Warehouse name cannot be empty.")
        qs = DestinationWarehouse.objects.filter(name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Destination warehouse '{name}' already exists.")
        return name


class ShipmentCostTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentCostType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "is_active",
            "created_at",
        ]


class ShipmentCostSerializer(serializers.ModelSerializer):
    cost_type_name = serializers.CharField(source="cost_type.name", read_only=True)
    cost_type_code = serializers.CharField(source="cost_type.code", read_only=True)

    class Meta:
        model = ShipmentCost
        fields = [
            "id",
            "shipment",
            "cost_type",
            "cost_type_name",
            "cost_type_code",
            "description",
            "amount",
            "currency",
            "exchange_rate",
            "amount_npr",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "amount_npr", "created_at", "updated_at"]


class ImportBatchSerializer(serializers.ModelSerializer):
    units_count = serializers.SerializerMethodField(read_only=True)
    sold_count = serializers.SerializerMethodField(read_only=True)
    remaining_count = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    transport_status = serializers.CharField(max_length=50, default="IN_TRANSIT")
    transport_status_display = serializers.CharField(
        source="get_transport_status_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    progress_summary = serializers.SerializerMethodField(read_only=True)
    costs = serializers.SerializerMethodField(read_only=True)
    total_landed_cost_npr = serializers.SerializerMethodField(read_only=True)
    average_cost_per_unit_npr = serializers.SerializerMethodField(read_only=True)
    required_documents_checklist = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id",
            "shipment_no",
            "batch_no",
            "supplier_exporter",
            "container_bl_no",
            "vessel_transport_mode",
            "port_of_loading",
            "port_of_arrival",
            "etd",
            "eta",
            "actual_arrival_date",
            "customs_clearance_date",
            "warehouse_received_date",
            "status",
            "status_display",
            "origin",
            "transport_status",
            "transport_status_display",
            "border_crossing",
            "customs_declaration_no",
            "container_or_truck_no",
            "carrier_name",
            "destination_warehouse",
            "lc_number",
            "shipped_date",
            "eta_date",
            "arrived_date",
            "invoice_no",
            "total_units",
            "units_count",
            "sold_count",
            "remaining_count",
            "progress_summary",
            "costs",
            "total_landed_cost_npr",
            "average_cost_per_unit_npr",
            "required_documents_checklist",
            "notes",
            "source",
            "import_job",
            "is_deleted",
            "deletion_reason",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "shipment_no",
            "status",
            "is_deleted",
            "deletion_reason",
            "transport_status_display",
            "status_display",
            "source",
            "import_job",
            "units_count",
            "sold_count",
            "remaining_count",
            "progress_summary",
            "costs",
            "total_landed_cost_npr",
            "average_cost_per_unit_npr",
            "required_documents_checklist",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def _can_view_costs(self) -> bool:
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.has_perm("inventory.view_shipment_costs")
        )

    def get_costs(self, obj):
        if not self._can_view_costs():
            return None
        return ShipmentCostSerializer(
            obj.costs.select_related("cost_type").all(),
            many=True,
            context=self.context,
        ).data

    def get_total_landed_cost_npr(self, obj):
        if not self._can_view_costs():
            return None
        return obj.total_landed_cost_npr

    def get_average_cost_per_unit_npr(self, obj):
        if not self._can_view_costs():
            return None
        return obj.average_cost_per_unit_npr

    def get_progress_summary(self, obj):
        return obj.get_progress_summary()

    def get_required_documents_checklist(self, obj):
        from crm.models import DocumentTypeMaster, DocumentAttachment

        req_types = DocumentTypeMaster.objects.filter(
            is_required_for_shipment=True, is_active=True
        )
        attached_docs = DocumentAttachment.objects.filter(
            shipment=obj, document__is_deleted=False
        ).select_related("document", "document__document_type_master")

        attached_codes = set()
        attached_map = {}
        for att in attached_docs:
            code = (
                att.document.document_type_master.code
                if att.document.document_type_master
                else att.document.category
            )
            if code:
                code_upper = code.upper()
                attached_codes.add(code_upper)
                attached_map[code_upper] = {
                    "id": att.document.id,
                    "title": att.document.title,
                }

        request = self.context.get("request")
        checklist = []
        missing_count = 0
        for rt in req_types:
            is_att = rt.code.upper() in attached_codes
            if not is_att:
                missing_count += 1
            attached = attached_map.get(rt.code.upper())
            checklist.append(
                {
                    "code": rt.code,
                    "name": rt.name,
                    "category": getattr(rt, "category", "") or "",
                    "is_required": True,
                    "is_attached": is_att,
                    "attached_document": attached,
                    "document_id": attached["id"] if attached else None,
                    "document_title": attached["title"] if attached else None,
                    "document_file_url": (
                        private_media_url(request, f"/api/crm/documents/{attached['id']}/preview/")
                        if attached
                        else None
                    ),
                }
            )

        return {
            "checklist": checklist,
            "missing_required_count": missing_count,
            "can_close": missing_count == 0,
            # Shape consumed by the shipment detail page.
            "items": checklist,
            "all_attached": missing_count == 0,
            "total_required": len(checklist),
            "attached_count": len(checklist) - missing_count,
        }

    def get_units_count(self, obj) -> int:
        return obj.units.count()

    def get_sold_count(self, obj) -> int:
        return obj.units.filter(status=VehicleUnit.Status.SOLD).count()

    def get_remaining_count(self, obj) -> int:
        return obj.units.exclude(
            status__in=[VehicleUnit.Status.SOLD, VehicleUnit.Status.SCRAPPED]
        ).count()

    def get_created_by_name(self, obj) -> str:
        user = obj.created_by
        if not user:
            return ""
        return user.get_full_name() or user.username


class VehicleUnitListSerializer(serializers.ModelSerializer):
    model_detail = serializers.SerializerMethodField(read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)
    variant_detail = serializers.SerializerMethodField(read_only=True)
    batch_no = serializers.SerializerMethodField(read_only=True)
    shipment_no = serializers.SerializerMethodField(read_only=True)
    shipment_arrival_date = serializers.SerializerMethodField(read_only=True)
    pdi_status = serializers.SerializerMethodField(read_only=True)
    pdi_no = serializers.SerializerMethodField(read_only=True)
    open_pdi_id = serializers.SerializerMethodField(read_only=True)
    pdi_badge = serializers.SerializerMethodField(read_only=True)
    vei_status = serializers.SerializerMethodField(read_only=True)
    vei_no = serializers.SerializerMethodField(read_only=True)
    vei_badge = serializers.SerializerMethodField(read_only=True)
    open_inspection_issues_count = serializers.SerializerMethodField(read_only=True)
    open_inspection_issues = serializers.SerializerMethodField(read_only=True)
    has_pdi_for_sale = serializers.SerializerMethodField(read_only=True)
    pdi_sale_warning = serializers.SerializerMethodField(read_only=True)
    warranty_status = serializers.CharField(read_only=True)
    warranty_end = serializers.DateField(read_only=True)
    vehicle_warranty_status = serializers.CharField(read_only=True)
    vehicle_warranty_end = serializers.DateField(read_only=True)
    battery_warranty_status = serializers.CharField(read_only=True)
    battery_warranty_end = serializers.DateField(read_only=True)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    next_service_due = serializers.ReadOnlyField()
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = VehicleUnit
        fields = [
            "id",
            "vin_chassis_no",
            "dealer",
            "dealer_name",
            "vehicle_model",
            "model_detail",
            "variant",
            "variant_name",
            "variant_detail",
            "import_batch",
            "batch_no",
            "shipment_no",
            "shipment_arrival_date",
            "battery_no",
            "color",
            "status",
            "manufacture_date",
            "odometer_km",
            "pdi_status",
            "pdi_no",
            "open_pdi_id",
            "pdi_badge",
            "vei_status",
            "vei_no",
            "vei_badge",
            "open_inspection_issues_count",
            "open_inspection_issues",
            "has_pdi_for_sale",
            "pdi_sale_warning",
            "selling_price",
            "sold_date",
            "sold_price",
            "customer",
            "customer_name",
            "lead",
            "payment_mode",
            "finance_bank_name",
            "tax_invoice_no",
            "warranty_end_date",
            "warranty_end",
            "warranty_status",
            "vehicle_warranty_status",
            "vehicle_warranty_end",
            "battery_warranty_status",
            "battery_warranty_end",
            "next_service_due",
            "source",
            "import_job",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "model_detail",
            "variant_name",
            "variant_detail",
            "source",
            "import_job",
            "batch_no",
            "shipment_no",
            "shipment_arrival_date",
            "pdi_status",
            "pdi_no",
            "open_pdi_id",
            "pdi_badge",
            "vei_status",
            "vei_no",
            "vei_badge",
            "open_inspection_issues_count",
            "open_inspection_issues",
            "has_pdi_for_sale",
            "pdi_sale_warning",
            "warranty_status",
            "warranty_end",
            "vehicle_warranty_status",
            "vehicle_warranty_end",
            "battery_warranty_status",
            "battery_warranty_end",
            "next_service_due",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def validate_battery_no(self, value):
        if not value:
            return ""
        val = value.strip()
        qs = VehicleUnit.objects.filter(battery_no__iexact=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        conflicting = qs.first()
        if conflicting:
            raise serializers.ValidationError(
                f"Battery number already used on unit VIN-{conflicting.vin_chassis_no}"
            )
        return val

    def validate(self, attrs):
        attrs = super().validate(attrs)
        vm = attrs.get("vehicle_model") or (self.instance.vehicle_model if self.instance else None)
        variant = attrs.get("variant") if "variant" in attrs else (self.instance.variant if self.instance else None)
        if vm:
            if variant:
                if variant.vehicle_model_id != vm.id:
                    raise serializers.ValidationError(
                        {"variant": "Selected variant does not belong to the chosen vehicle model."}
                    )
            elif self.instance is None and getattr(vm, "has_active_variants", False):
                raise serializers.ValidationError(
                    {"variant": "This vehicle model has variants. Please select a variant."}
                )
        return attrs

    def get_model_detail(self, obj) -> dict:
        m = obj.vehicle_model
        return {"id": m.id, "brand": m.brand, "model_name": m.model_name}

    def get_variant_detail(self, obj) -> dict | None:
        if obj.variant:
            return {
                "id": obj.variant.id,
                "name": obj.variant.name,
                "body_type_name": obj.variant.body_type.name if obj.variant.body_type else "",
                "spec_text": obj.variant.spec_text,
                "price_override": str(obj.variant.price_override) if obj.variant.price_override is not None else None,
            }
        return None

    def get_batch_no(self, obj) -> str:
        return obj.import_batch.batch_no if obj.import_batch_id else ""

    def get_shipment_no(self, obj) -> str:
        if obj.import_batch:
            return obj.import_batch.shipment_no or obj.import_batch.batch_no or ""
        return ""

    def get_shipment_arrival_date(self, obj):
        if obj.import_batch:
            return obj.import_batch.actual_arrival_date or obj.import_batch.arrived_date
        return None

    def _latest_pdi(self, obj):
        latest = getattr(obj, "_latest_pdi", None)
        if latest is None:
            latest = (
                obj.pdi_inspections.filter(
                    inspection_type=PDIInspection.InspectionType.PDI
                ).order_by("-inspection_date", "-id").first()
            )
            obj._latest_pdi = latest
        return latest

    def _latest_vei(self, obj):
        latest = getattr(obj, "_latest_vei", None)
        if latest is None:
            latest = (
                obj.pdi_inspections.filter(
                    inspection_type=PDIInspection.InspectionType.VEI
                ).order_by("-inspection_date", "-id").first()
            )
            obj._latest_vei = latest
        return latest

    def get_pdi_status(self, obj):
        latest = self._latest_pdi(obj)
        if latest:
            return latest.status
        if getattr(obj, "source", "") == "historical import":
            return "LEGACY"
        return None

    def get_pdi_no(self, obj):
        latest = self._latest_pdi(obj)
        return latest.pdi_no if latest else ""

    def get_open_pdi_id(self, obj):
        latest = self._latest_pdi(obj)
        if latest and latest.status in (
            PDIInspection.InspectionStatus.DRAFT,
            PDIInspection.InspectionStatus.SUBMITTED,
        ):
            return latest.id
        return None

    def get_vei_status(self, obj):
        latest = self._latest_vei(obj)
        return latest.status if latest else None

    def get_vei_no(self, obj):
        latest = self._latest_vei(obj)
        return latest.pdi_no if latest else ""

    def _compute_badge(self, inspection) -> str:
        if not inspection:
            return "NOT_DONE"
        if inspection.status in [
            PDIInspection.InspectionStatus.DRAFT,
            PDIInspection.InspectionStatus.SUBMITTED,
        ]:
            return "PENDING"
        if (
            inspection.status == PDIInspection.InspectionStatus.REJECTED
            or getattr(inspection, "overall_rating", None) == "POOR"
        ):
            return "FAILED"
        if inspection.issues.filter(resolved=False).exists():
            return "ISSUES"
        return "PASSED"

    def get_vei_badge(self, obj) -> str:
        latest = self._latest_vei(obj)
        return self._compute_badge(latest)

    def get_pdi_badge(self, obj) -> str:
        latest = self._latest_pdi(obj)
        if not latest and getattr(obj, "source", "") == "historical import":
            return "LEGACY"
        return self._compute_badge(latest)

    def get_open_inspection_issues_count(self, obj) -> int:
        return obj.open_inspection_issues_count

    def get_open_inspection_issues(self, obj) -> list:
        return [
            {
                "id": issue.id,
                "inspection_id": issue.inspection_id,
                "inspection_no": issue.inspection.pdi_no,
                "inspection_type": issue.inspection.inspection_type,
                "description": issue.description,
                "created_at": issue.created_at.isoformat() if issue.created_at else None,
            }
            for issue in obj.open_inspection_issues[:10]
        ]

    def get_has_pdi_for_sale(self, obj) -> bool:
        if getattr(obj, "source", "") == "historical import":
            return True
        return obj.pdi_inspections.filter(
            inspection_type=PDIInspection.InspectionType.PDI,
            status__in=[
                PDIInspection.InspectionStatus.SUBMITTED,
                PDIInspection.InspectionStatus.APPROVED,
                PDIInspection.InspectionStatus.COMPLETED,
                PDIInspection.InspectionStatus.LOCKED,
            ],
        ).exists()

    def get_pdi_sale_warning(self, obj) -> str:
        if getattr(obj, "source", "") == "historical import":
            return ""
        if self.get_has_pdi_for_sale(obj):
            return ""
        return "Warning: Pre-Delivery Inspection (PDI) is required before this vehicle can be sold."


class StockMovementSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_type",
            "quantity",
            "reference_note",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj) -> str:
        user = obj.created_by
        if not user:
            return ""
        return user.get_full_name() or user.username


class PDIHistorySerializer(serializers.ModelSerializer):
    not_ok_count = serializers.SerializerMethodField(read_only=True)
    inspection_type_display = serializers.CharField(
        source="get_inspection_type_display", read_only=True
    )
    is_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = PDIInspection
        fields = [
            "id",
            "inspection_type",
            "inspection_type_display",
            "pdi_no",
            "inspection_date",
            "overall_rating",
            "checked_by",
            "status",
            "is_locked",
            "not_ok_count",
            "submitted_at",
        ]
        read_only_fields = fields

    def get_not_ok_count(self, obj) -> int:
        return obj.not_ok_count


class ConditionHistorySerializer(serializers.ModelSerializer):
    photo_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ConditionReport
        fields = [
            "id",
            "report_type",
            "report_date",
            "odometer_km",
            "overall_rating",
            "inspected_by",
            "photo_count",
        ]
        read_only_fields = fields

    def get_photo_count(self, obj) -> int:
        return obj.photos.count()


class VehicleReceiveCheckListSerializer(serializers.ModelSerializer):
    vehicle_vin = serializers.CharField(source="vehicle.vin_chassis_no", read_only=True)
    vehicle_model_name = serializers.SerializerMethodField(read_only=True)
    batch_no = serializers.CharField(source="import_batch.batch_no", read_only=True)
    vro_no = serializers.CharField(source="service_record.vro_no", read_only=True)
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VehicleReceiveCheckList
        fields = [
            "id",
            "receive_no",
            "vehicle",
            "service_record",
            "vro_no",
            "vehicle_vin",
            "vehicle_model_name",
            "import_batch",
            "batch_no",
            "receive_date",
            "driver_name",
            "driver_contact",
            "driver_signature",
            "rep_signature",
            "ev_company",
            "vehicle_run_km",
            "ev_seater",
            "battery_power_kw",
            "ev_charge_percent",
            "vehicle_color",
            "vehicle_parked_yard",
            "any_other_information",
            "legend_notes",
            "entity_conditions",
            "toolkit_items",
            "overall_status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "receive_no", "created_at", "updated_at"]

    def get_vehicle_model_name(self, obj) -> str:
        if obj.vehicle and obj.vehicle.vehicle_model:
            m = obj.vehicle.vehicle_model
            return str(m)
        return ""

    def get_created_by_name(self, obj) -> str:
        u = obj.created_by
        return u.get_full_name() or u.username if u else ""


class VehicleUnitDetailSerializer(VehicleUnitListSerializer):
    model_detail = serializers.SerializerMethodField(read_only=True)
    batch_detail = serializers.SerializerMethodField(read_only=True)
    effective_battery_kw = serializers.SerializerMethodField(read_only=True)
    effective_motor_kw = serializers.SerializerMethodField(read_only=True)
    movements = StockMovementSerializer(many=True, read_only=True)
    pdi_history = serializers.SerializerMethodField(read_only=True)
    condition_history = serializers.SerializerMethodField(read_only=True)
    lead_detail = serializers.SerializerMethodField(read_only=True)
    customer_detail = serializers.SerializerMethodField(read_only=True)
    quotation_detail = serializers.SerializerMethodField(read_only=True)
    service_records = serializers.SerializerMethodField(read_only=True)
    sale_id = serializers.SerializerMethodField(read_only=True)

    class Meta(VehicleUnitListSerializer.Meta):
        fields = VehicleUnitListSerializer.Meta.fields + [
            "motor_no",
            "battery_power_kw",
            "motor_power_kw",
            "effective_battery_kw",
            "effective_motor_kw",
            "purchase_cost",
            "landed_cost",
            "sold_price",
            "customer",
            "customer_name",
            "customer_detail",
            "lead",
            "lead_detail",
            "quotation",
            "quotation_detail",
            "payment_mode",
            "finance_bank_name",
            "down_payment",
            "loan_amount",
            "loan_tenure_months",
            "interest_rate",
            "monthly_emi",
            "finance_status",
            "tax_invoice_no",
            "receipt_voucher_no",
            "salesperson_name",
            "delivery_notes",
            "batch_detail",
            "movements",
            "pdi_history",
            "condition_history",
            "service_records",
            "sale_id",
            "updated_at",
        ]

    def get_sale_id(self, obj) -> int | None:
        s = obj.latest_sale
        return s.id if s else None

    def get_batch_detail(self, obj) -> dict:
        b = obj.import_batch
        if not b:
            return {}
        return {"id": b.id, "batch_no": b.batch_no, "origin": b.origin}

    def get_effective_battery_kw(self, obj):
        value = obj.effective_battery_kw
        return str(value) if value is not None else None

    def get_effective_motor_kw(self, obj):
        value = obj.effective_motor_kw
        return str(value) if value is not None else None

    def get_pdi_history(self, obj):
        qs = obj.pdi_inspections.order_by("-inspection_date", "-id")
        return PDIHistorySerializer(qs, many=True).data

    def get_condition_history(self, obj):
        qs = obj.condition_reports.order_by("-report_date", "-id")
        return ConditionHistorySerializer(qs, many=True).data

    def get_lead_detail(self, obj) -> dict:
        if not obj.lead:
            return {}
        l = obj.lead
        return {
            "id": l.id,
            "name": l.resolved_name if hasattr(l, "resolved_name") else str(l),
            "company": l.company or "",
            "phone": l.phone or "",
        }

    def get_customer_detail(self, obj) -> dict:
        if not obj.customer:
            return {}
        c = obj.customer
        return {
            "id": c.id,
            "name": c.name,
            "company": c.company or "",
            "phone": c.phone or "",
        }

    def get_quotation_detail(self, obj) -> dict:
        if not obj.quotation:
            return {}
        q = obj.quotation
        return {
            "id": q.id,
            "display_id": q.display_id,
            "total": q.total,
        }

    def get_service_records(self, obj) -> list:
        from servicing.serializers import ServiceRecordSerializer
        from servicing.models import ServiceRecord
        records = ServiceRecord.objects.filter(chassis_number__iexact=obj.vin_chassis_no)
        return ServiceRecordSerializer(records.order_by("-date_received", "-id"), many=True).data

class UnitCreateSerializer(serializers.ModelSerializer):
    """Creation serializer — status transitions happen via actions, not edits."""

    variant_name = serializers.CharField(source="variant.name", read_only=True)
    variant_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VehicleUnit
        fields = [
            "vin_chassis_no",
            "import_batch",
            "vehicle_model",
            "variant",
            "variant_name",
            "variant_detail",
            "dealer",
            "motor_no",
            "battery_no",
            "battery_power_kw",
            "motor_power_kw",
            "color",
            "manufacture_date",
            "odometer_km",
            "status",
            "purchase_cost",
            "landed_cost",
            "selling_price",
        ]
        read_only_fields = ["variant_name", "variant_detail"]

    def get_variant_detail(self, obj):
        if obj.variant:
            return {
                "id": obj.variant.id,
                "name": obj.variant.name,
                "body_type_name": obj.variant.body_type.name if obj.variant.body_type else "",
                "spec_text": obj.variant.spec_text,
                "price_override": str(obj.variant.price_override) if obj.variant.price_override is not None else None,
            }
        return None

    def validate_battery_no(self, value):
        if not value:
            return ""
        val = value.strip()
        qs = VehicleUnit.objects.filter(battery_no__iexact=val)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        conflicting = qs.first()
        if conflicting:
            raise serializers.ValidationError(
                f"Battery number already used on unit VIN-{conflicting.vin_chassis_no}"
            )
        return val

    def validate_status(self, value):
        if value not in (
            VehicleUnit.Status.IN_TRANSIT,
            VehicleUnit.Status.IN_WAREHOUSE,
        ):
            raise serializers.ValidationError(
                "New units must start as In Transit or In Warehouse."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        vm = attrs.get("vehicle_model")
        variant = attrs.get("variant")
        if vm:
            if variant:
                if variant.vehicle_model_id != vm.id:
                    raise serializers.ValidationError(
                        {"variant": "Selected variant does not belong to the chosen vehicle model."}
                    )
            elif getattr(vm, "has_active_variants", False):
                raise serializers.ValidationError(
                    {"variant": "This vehicle model has variants. Please select a variant."}
                )
        return attrs


class PDIResultSerializer(serializers.ModelSerializer):
    photo_display = serializers.SerializerMethodField(read_only=True)
    label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PDIResult
        fields = [
            "id",
            "item",
            "label",
            "label_snapshot",
            "section_snapshot",
            "sub_section_snapshot",
            "result",
            "remark",
            "photo",
            "photo_display",
        ]
        read_only_fields = ["id", "label", "photo_display", "photo"]

    def get_label(self, obj) -> str:
        return obj.label_snapshot or (obj.item.label if obj.item_id else "")

    def get_photo_display(self, obj):
        return private_media_url(self.context.get("request"), obj.photo_src)


class PDIResultWriteSerializer(serializers.Serializer):
    item = serializers.IntegerField()
    result = serializers.ChoiceField(choices=CheckResult.choices)
    remark = serializers.CharField(required=False, allow_blank=True, default="")


class InspectionPhotoSerializer(serializers.ModelSerializer):
    photo_display = serializers.SerializerMethodField(read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)

    class Meta:
        model = InspectionPhoto
        fields = [
            "id",
            "inspection",
            "photo",
            "photo_display",
            "caption",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "photo_display", "uploaded_by_name", "created_at"]

    def get_photo_display(self, obj):
        return private_media_url(self.context.get("request"), obj.photo_url)


class InspectionIssueSerializer(serializers.ModelSerializer):
    item_label = serializers.SerializerMethodField(read_only=True)
    resolved_by_name = serializers.CharField(source="resolved_by.get_full_name", read_only=True)

    class Meta:
        model = InspectionIssue
        fields = [
            "id",
            "inspection",
            "item",
            "item_label",
            "result",
            "description",
            "resolved",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "resolution_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "item_label",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]

    def get_item_label(self, obj) -> str:
        if obj.item:
            return obj.item.label
        if obj.result:
            return obj.result.label_snapshot
        return ""


class PDIInspectionSerializer(serializers.ModelSerializer):
    results = PDIResultSerializer(many=True, read_only=True)
    results_write = PDIResultWriteSerializer(
        many=True, required=False, write_only=True
    )
    issues = InspectionIssueSerializer(many=True, read_only=True)
    general_photos = InspectionPhotoSerializer(many=True, read_only=True)
    open_issues_count = serializers.IntegerField(read_only=True)
    signature_data = serializers.CharField(
        required=False, allow_blank=True, write_only=True
    )
    signature_display = serializers.SerializerMethodField(read_only=True)
    vehicle_vin = serializers.SerializerMethodField(read_only=True)
    variant_name = serializers.SerializerMethodField(read_only=True)
    not_ok_count = serializers.SerializerMethodField(read_only=True)
    template_version = serializers.SerializerMethodField(read_only=True)
    import_batch_detail = serializers.SerializerMethodField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    inspection_type_display = serializers.CharField(
        source="get_inspection_type_display", read_only=True
    )
    is_locked = serializers.BooleanField(read_only=True)
    can_reopen = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PDIInspection
        fields = [
            "id",
            "inspection_type",
            "inspection_type_display",
            "is_locked",
            "can_reopen",
            "pdi_no",
            "vehicle",
            "vehicle_vin",
            "variant_name",
            "template",
            "template_version",
            "import_batch",
            "import_batch_detail",
            "inspection_date",
            "ev_company_name",
            "vin_chassis_no",
            "model_snapshot",
            "battery_power_snapshot",
            "motor_power_snapshot",
            "motor_no_snapshot",
            "manufacture_date_snapshot",
            "color_snapshot",
            "odometer_km_snapshot",
            "overall_rating",
            "checked_by",
            "status",
            "signature",
            "signature_display",
            "signature_data",
            "submitted_at",
            "not_ok_count",
            "open_issues_count",
            "issues",
            "general_photos",
            "results",
            "results_write",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "inspection_type_display",
            "is_locked",
            "can_reopen",
            "pdi_no",
            "vehicle_vin",
            "template_version",
            "import_batch_detail",
            "status",
            "signature",
            "signature_display",
            "submitted_at",
            "not_ok_count",
            "open_issues_count",
            "issues",
            "general_photos",
            "results",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_can_reopen(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return False
        from accounts.permissions import user_has_perm
        return user_has_perm(request.user, "inventory.reopen_pdiinspection")

    def get_vehicle_vin(self, obj) -> str:
        return obj.vehicle.vin_chassis_no if obj.vehicle_id else ""

    def get_variant_name(self, obj) -> str:
        if obj.vehicle and getattr(obj.vehicle, "variant", None):
            return obj.vehicle.variant.name
        return ""

    def get_template_version(self, obj) -> int | None:
        return obj.template.version_no if obj.template_id else None

    def get_import_batch_detail(self, obj):
        if obj.import_batch:
            return {
                "id": obj.import_batch.id,
                "batch_no": obj.import_batch.batch_no,
                "shipment_name": getattr(obj.import_batch, "shipment_name", ""),
                "transport_status": getattr(obj.import_batch, "transport_status", ""),
            }
        return None

    def get_signature_display(self, obj):
        src = getattr(obj, "signature_url", "")
        return private_media_url(self.context.get("request"), src)

    def get_not_ok_count(self, obj) -> int:
        return obj.not_ok_count

    def validate(self, attrs):
        signature_data = attrs.pop("signature_data", "")
        if signature_data:
            attrs["signature"] = decode_signature(signature_data)
        return attrs

    def _apply_results(self, instance, results_data):
        template_item_ids = set(
            instance.template.items.values_list("id", flat=True)
        )
        for row in results_data or []:
            item_id = row["item"]
            if item_id not in template_item_ids:
                raise serializers.ValidationError(
                    f"Checklist item {item_id} is not part of this inspection's template."
                )
            PDIResult.objects.update_or_create(
                inspection=instance,
                item_id=item_id,
                defaults={
                    "result": row["result"],
                    "remark": row.get("remark", ""),
                },
            )
        instance.sync_issues_from_results()

    def _snapshot_labels(self, instance):
        for res in instance.results.select_related("item").all():
            changed = False
            if not res.label_snapshot and res.item_id:
                res.label_snapshot = res.item.label
                res.section_snapshot = res.item.section
                res.sub_section_snapshot = res.item.sub_section or ""
                changed = True
            if changed:
                res.save(
                    update_fields=[
                        "label_snapshot",
                        "section_snapshot",
                        "sub_section_snapshot",
                    ]
                )

    def create(self, validated_data):
        results_data = validated_data.pop("results_write", [])
        inspection = super().create(validated_data)
        self._apply_results(inspection, results_data)
        self._snapshot_labels(inspection)
        return inspection

    def update(self, instance, validated_data):
        if instance.is_locked:
            raise serializers.ValidationError(
                "Submitted inspections are locked. Start a re-inspection instead."
            )
        results_data = validated_data.pop("results_write", None)
        inspection = super().update(instance, validated_data)
        if results_data is not None:
            self._apply_results(inspection, results_data)
            self._snapshot_labels(inspection)
        return inspection


class ConditionResultSerializer(serializers.ModelSerializer):
    photo_display = serializers.SerializerMethodField(read_only=True)
    label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ConditionResult
        fields = [
            "id",
            "item",
            "label",
            "label_snapshot",
            "section_snapshot",
            "sub_section_snapshot",
            "result",
            "remark",
            "photo",
            "photo_display",
        ]
        read_only_fields = ["id", "label", "photo_display", "photo"]

    def get_label(self, obj) -> str:
        return obj.label_snapshot or (obj.item.label if obj.item_id else "")

    def get_photo_display(self, obj):
        return private_media_url(self.context.get("request"), obj.photo_src)


class ConditionPhotoSerializer(serializers.ModelSerializer):
    image_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ConditionPhoto
        fields = ["id", "image", "image_display", "caption", "sort_order"]
        read_only_fields = ["id", "image_display"]

    def get_image_display(self, obj):
        return private_media_url(self.context.get("request"), obj.image_src)


class ConditionReportSerializer(serializers.ModelSerializer):
    results = ConditionResultSerializer(many=True, read_only=True)
    results_write = PDIResultWriteSerializer(
        many=True, required=False, write_only=True
    )
    photos = ConditionPhotoSerializer(many=True, read_only=True)
    vehicle_vin = serializers.SerializerMethodField(read_only=True)
    template_version = serializers.SerializerMethodField(read_only=True)
    template = serializers.PrimaryKeyRelatedField(
        queryset=PDITemplate.objects.all(), required=False, allow_null=True
    )
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = ConditionReport
        fields = [
            "id",
            "vehicle",
            "vehicle_vin",
            "template",
            "template_version",
            "report_type",
            "report_date",
            "odometer_km",
            "overall_rating",
            "inspected_by",
            "notes",
            "results",
            "results_write",
            "photos",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vehicle_vin",
            "template_version",
            "results",
            "photos",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_vehicle_vin(self, obj) -> str:
        return obj.vehicle.vin_chassis_no if obj.vehicle_id else ""

    def get_template_version(self, obj) -> int | None:
        return obj.template.version_no if obj.template_id else None

    def _apply_results(self, instance, results_data):
        template_item_ids = set(
            instance.template.items.values_list("id", flat=True)
        )
        for row in results_data or []:
            item_id = row["item"]
            if item_id not in template_item_ids:
                raise serializers.ValidationError(
                    f"Checklist item {item_id} is not part of this report's template."
                )
            result, _ = ConditionResult.objects.update_or_create(
                report=instance,
                item_id=item_id,
                defaults={
                    "result": row["result"],
                    "remark": row.get("remark", ""),
                },
            )
            if not result.label_snapshot and result.item_id:
                result.label_snapshot = result.item.label
                result.section_snapshot = result.item.section
                result.sub_section_snapshot = result.item.sub_section or ""
                result.save(
                    update_fields=[
                        "label_snapshot",
                        "section_snapshot",
                        "sub_section_snapshot",
                    ]
                )

    def create(self, validated_data):
        results_data = validated_data.pop("results_write", [])
        if not validated_data.get("template"):
            active = PDITemplate.objects.filter(is_active=True).order_by(
                "-version_no"
            ).first()
            if not active:
                raise serializers.ValidationError(
                    "No active PDI checklist template exists."
                )
            validated_data["template"] = active
        report = super().create(validated_data)
        self._apply_results(report, results_data)
        return report

    def update(self, instance, validated_data):
        results_data = validated_data.pop("results_write", None)
        report = super().update(instance, validated_data)
        if results_data is not None:
            self._apply_results(report, results_data)
        return report


class PDIChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PDIChecklistItem
        fields = [
            "id",
            "template",
            "section",
            "sub_section",
            "label",
            "sort_order",
        ]
        read_only_fields = ["id", "template"]


class PDITemplateSerializer(serializers.ModelSerializer):
    items = PDIChecklistItemSerializer(many=True, read_only=True)
    section_labels = serializers.SerializerMethodField(read_only=True)
    inspection_type_display = serializers.CharField(
        source="get_inspection_type_display", read_only=True
    )
    vehicle_model_name = serializers.CharField(source="vehicle_model.name", read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)

    class Meta:
        model = PDITemplate
        fields = [
            "id",
            "name",
            "inspection_type",
            "inspection_type_display",
            "vehicle_model",
            "vehicle_model_name",
            "variant",
            "variant_name",
            "version_no",
            "is_active",
            "items",
            "section_labels",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "inspection_type_display",
            "vehicle_model_name",
            "variant_name",
            "section_labels",
            "created_at",
        ]

    def get_section_labels(self, obj) -> dict:
        return dict(PDIChecklistItem.SECTION_CHOICES)


class SaleSerializer(serializers.ModelSerializer):
    unit_vin = serializers.CharField(source="unit.vin_chassis_no", read_only=True)
    unit_model_name = serializers.SerializerMethodField(read_only=True)
    variant_name = serializers.CharField(source="variant.name", read_only=True)
    variant_detail = serializers.SerializerMethodField(read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    lead_name = serializers.SerializerMethodField(read_only=True)
    quotation_display_id = serializers.SerializerMethodField(read_only=True)
    salesperson_name = serializers.SerializerMethodField(read_only=True)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    cancelled_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "unit",
            "unit_vin",
            "unit_model_name",
            "variant",
            "variant_name",
            "variant_detail",
            "customer",
            "customer_name",
            "customer_phone",
            "lead",
            "lead_name",
            "quotation",
            "quotation_display_id",
            "sale_date",
            "selling_price",
            "discount",
            "payment_mode",
            "bank",
            "down_payment",
            "loan_amount",
            "tenure",
            "interest",
            "emi",
            "finance_status",
            "tax_invoice_no",
            "receipt_no",
            "dealer",
            "dealer_name",
            "salesperson",
            "salesperson_name",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "warranty_end_date",
            "notes",
            "source",
            "import_job",
            "is_current",
            "status",
            "cancelled_by",
            "cancelled_by_name",
            "cancelled_at",
            "cancellation_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "variant_name",
            "variant_detail",
            "source",
            "import_job",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
            "status",
            "cancelled_by",
            "cancelled_at",
            "cancellation_reason",
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        unit = attrs.get("unit") or (self.instance.unit if self.instance else None)
        variant = attrs.get("variant") if "variant" in attrs else (self.instance.variant if self.instance else None)
        if unit and variant and unit.vehicle_model_id:
            if variant.vehicle_model_id != unit.vehicle_model_id:
                raise serializers.ValidationError(
                    {"variant": "Selected variant does not belong to the vehicle unit's model."}
                )
        return attrs

    def get_variant_detail(self, obj):
        if obj.variant:
            return {
                "id": obj.variant.id,
                "name": obj.variant.name,
                "body_type_name": obj.variant.body_type.name if obj.variant.body_type else "",
                "spec_text": obj.variant.spec_text,
                "price_override": str(obj.variant.price_override) if obj.variant.price_override is not None else None,
            }
        return None

    def get_unit_model_name(self, obj) -> str:
        if obj.unit and obj.unit.vehicle_model:
            return str(obj.unit.vehicle_model)
        return ""

    def get_lead_name(self, obj) -> str:
        if obj.lead:
            return obj.lead.name
        return ""

    def get_quotation_display_id(self, obj) -> str:
        if obj.quotation:
            return obj.quotation.display_id
        return ""

    def get_salesperson_name(self, obj) -> str:
        if obj.salesperson:
            return obj.salesperson.get_full_name() or obj.salesperson.username
        return getattr(obj, "salesperson_name", "") or ""

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ""

    def get_cancelled_by_name(self, obj) -> str:
        if obj.cancelled_by:
            return obj.cancelled_by.get_full_name() or obj.cancelled_by.username
        return ""


class ImportJobSerializer(serializers.ModelSerializer):
    import_type_display = serializers.CharField(source="get_import_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    rolled_back_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ImportJob
        fields = [
            "id",
            "import_type",
            "import_type_display",
            "original_filename",
            "file_sha256",
            "uploaded_by",
            "uploaded_by_name",
            "status",
            "status_display",
            "rows_read",
            "rows_created",
            "rows_skipped",
            "rows_error",
            "options_used",
            "error_summary",
            "started_at",
            "finished_at",
            "rollback_blocked_reason",
            "rolled_back_at",
            "rolled_back_by",
            "rolled_back_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "import_type",
            "import_type_display",
            "original_filename",
            "file_sha256",
            "uploaded_by",
            "uploaded_by_name",
            "status",
            "status_display",
            "rows_read",
            "rows_created",
            "rows_skipped",
            "rows_error",
            "options_used",
            "error_summary",
            "started_at",
            "finished_at",
            "rollback_blocked_reason",
            "rolled_back_at",
            "rolled_back_by",
            "rolled_back_by_name",
            "created_at",
            "updated_at",
        ]

    def get_uploaded_by_name(self, obj) -> str:
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return "System"

    def get_rolled_back_by_name(self, obj) -> str:
        if obj.rolled_back_by:
            return obj.rolled_back_by.get_full_name() or obj.rolled_back_by.username
        return ""
