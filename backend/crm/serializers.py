import datetime
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers

from common.signed_urls import private_media_url
from events.models import InterestLevel
from inventory.models import VehicleModel, VehicleUnit, VehicleVariant

from .models import (
    Activity,
    ActivityType,
    Bank,
    BankBranch,
    CompanyBranding,
    Customer,
    Document,
    DocumentAttachment,
    DocumentTypeMaster,
    DocumentVersion,
    Lead,
    LeadSource,
    Opportunity,
    Quotation,
    TestDrive,
)


class LeadSourceSerializer(serializers.ModelSerializer):
    # Extra read-only field: number of leads currently tagged with this source
    # (annotated on the queryset by the viewset). Falls back to 0 when missing.
    lead_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = LeadSource
        fields = ["id", "name", "is_active", "lead_count", "created_at", "updated_at"]
        read_only_fields = ["id", "lead_count", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        return name

    def validate(self, attrs):
        name = attrs.get("name")
        if name:
            qs = LeadSource.objects.filter(name__iexact=name.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"name": "Lead source with this name already exists."})
        return attrs

class BankSerializer(serializers.ModelSerializer):
    branch_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Bank
        fields = ["id", "name", "code", "category", "is_active", "branch_count", "created_at", "updated_at"]
        read_only_fields = ["id", "branch_count", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        return name

    def validate_code(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", ""))
        code = attrs.get("code", getattr(self.instance, "code", ""))
        if name:
            qs = Bank.objects.filter(name__iexact=str(name).strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"name": "A bank with this name already exists."})
        if code:
            qs = Bank.objects.filter(code__iexact=str(code).strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"code": "A bank with this code already exists."})
        return attrs


class BankBranchSerializer(serializers.ModelSerializer):
    bank_name = serializers.CharField(source="bank.name", read_only=True)

    class Meta:
        model = BankBranch
        fields = [
            "id", "bank", "bank_name", "name", "code", "address", "district",
            "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "bank_name", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        return name

    def validate_code(self, value):
        return (value or "").strip()

    def validate(self, attrs):
        bank = attrs.get("bank", getattr(self.instance, "bank", None))
        code = attrs.get("code", getattr(self.instance, "code", ""))
        if bank and code:
            qs = BankBranch.objects.filter(bank=bank, code__iexact=str(code).strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"code": "This branch code is already used for the bank."})
        return attrs


class LeadSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    interest_level = serializers.PrimaryKeyRelatedField(
        queryset=InterestLevel.objects.all(), required=False, allow_null=True,
    )
    interest_level_detail = serializers.SerializerMethodField(read_only=True)
    vehicle_model = serializers.PrimaryKeyRelatedField(
        queryset=VehicleModel.objects.all(), required=False, allow_null=True
    )
    vehicle_model_detail = serializers.SerializerMethodField(read_only=True)
    variant = serializers.PrimaryKeyRelatedField(
        queryset=VehicleVariant.objects.all(), required=False, allow_null=True
    )
    variant_detail = serializers.SerializerMethodField(read_only=True)

    pipeline_stage = serializers.SerializerMethodField(read_only=True)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id", "name", "company", "phone",
            "email", "address", "vehicle", "vehicle_model", "vehicle_model_detail",
            "variant", "variant_detail", "interest_level",
            "interest_level_detail", "source",
            "budget", "notes", "status", "pipeline_stage", "created_at", "updated_at",
            "last_activity", "created_by", "created_by_name", "updated_by", "updated_by_name", "dealer", "dealer_name",
        ]
        read_only_fields = [
            "vehicle_model_detail", "variant_detail",
            "pipeline_stage", "created_at", "updated_at", "last_activity",
            "created_by", "created_by_name", "updated_by", "updated_by_name",
        ]

    def get_pipeline_stage(self, obj) -> str:
        from crm.services.pipeline import compute_lead_pipeline_stage
        return compute_lead_pipeline_stage(obj)

    def get_interest_level_detail(self, obj):
        lvl = getattr(obj, "interest_level", None)
        if lvl is None:
            return None
        return {"id": lvl.id, "name": lvl.name}

    def get_vehicle_model_detail(self, obj):
        if obj.vehicle_model:
            from .models import catalog_range_for_model

            return {
                "id": obj.vehicle_model.id,
                "brand": obj.vehicle_model.brand,
                "model_name": obj.vehicle_model.model_name,
                "range_km": catalog_range_for_model(obj.vehicle_model),
            }
        return None

    def get_variant_detail(self, obj):
        if obj.variant:
            return {
                "id": obj.variant.id,
                "name": obj.variant.name,
                "product_code": obj.variant.product_code or "",
                "body_type_name": obj.variant.body_type.name if obj.variant.body_type else "",
                "spec_text": obj.variant.spec_text,
                "price_override": str(obj.variant.price_override) if obj.variant.price_override is not None else None,
            }
        return None

    def validate(self, attrs):
        # New single "name" field is primary; fall back to first+last for legacy clients.
        name = (attrs.get("name") or "").strip() if isinstance(attrs.get("name"), str) else attrs.get("name")
        first = (attrs.get("first_name") or "").strip() if isinstance(attrs.get("first_name"), str) else ""
        last = (attrs.get("last_name") or "").strip() if isinstance(attrs.get("last_name"), str) else ""
        instance_name = (getattr(self.instance, "name", "") or "").strip() if self.instance else ""
        if not name and not instance_name:
            combined = f"{first} {last}".strip()
            if combined:
                attrs["name"] = combined
            elif self.instance is None:
                raise serializers.ValidationError({"name": "Name is required."})
        # Keep legacy first/last in sync when only name is supplied.
        if attrs.get("name") and not first and not last:
            parts = str(attrs["name"]).strip().split()
            if len(parts) == 1:
                attrs["first_name"] = parts[0]
                attrs["last_name"] = ""
            else:
                attrs["first_name"] = parts[0]
                attrs["last_name"] = " ".join(parts[1:])
        if not attrs.get("phone") and self.instance is None:
            raise serializers.ValidationError({"phone": "Phone is required."})
        vm = attrs.get("vehicle_model") or (self.instance.vehicle_model if self.instance else None)
        variant = attrs.get("variant") if "variant" in attrs else (self.instance.variant if self.instance else None)
        if vm and variant:
            if variant.vehicle_model_id != vm.id:
                raise serializers.ValidationError({"variant": "Selected variant does not belong to the chosen vehicle model."})
        if vm and not attrs.get("vehicle"):
            model_text = f"{vm.brand} {vm.model_name}".strip()
            if variant:
                model_text = f"{model_text} - {variant.name}".strip()
            attrs["vehicle"] = model_text
        return attrs


class CustomerSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    display_id = serializers.CharField(read_only=True)
    lead = serializers.PrimaryKeyRelatedField(read_only=True)
    vehicles = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, default=list
    )
    total_purchases = serializers.DecimalField(
        max_digits=14, decimal_places=2, coerce_to_string=False, required=False, default=Decimal("0.00")
    )
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "display_id", "lead", "name", "company", "type", "phone",
            "phone_normalized", "pan_vat_number", "contact_person", "email",
            "location", "address", "district", "province", "vehicles", "notes", "total_purchases", "status",
            "source", "import_job",
            "dealer", "dealer_name", "created_by", "created_by_name", "updated_by", "updated_by_name",
            "last_activity", "created_at", "updated_at",
        ]
        read_only_fields = ["phone_normalized", "source", "import_job", "last_activity", "created_at", "updated_at", "created_by", "created_by_name", "updated_by", "updated_by_name"]


class OpportunitySerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    display_id = serializers.CharField(read_only=True)
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), allow_null=True, required=False
    )
    customer_name = serializers.CharField(required=False, allow_blank=True)
    value = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    close_date = serializers.DateField(allow_null=True, required=False)
    assigned_to_name = serializers.SerializerMethodField()
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = Opportunity
        fields = [
            "id", "display_id", "title", "customer", "customer_name", "company",
            "vehicle", "stage", "value", "probability", "close_date",
            "assigned_to", "assigned_to_name", "dealer", "dealer_name",
            "created_by", "created_by_name", "updated_by", "updated_by_name", "last_activity", "created_at", "updated_at",
        ]
        read_only_fields = ["last_activity", "created_at", "updated_at", "created_by", "created_by_name", "updated_by", "updated_by_name"]

    def get_assigned_to_name(self, obj):
        res = obj.resolved_assigned_to
        return res if res and res not in ["—", "N/A"] else ""


class TestDriveSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    display_id = serializers.CharField(read_only=True)
    lead = serializers.PrimaryKeyRelatedField(
        queryset=Lead.objects.all(), allow_null=True, required=False
    )
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), allow_null=True, required=False
    )
    unit = serializers.PrimaryKeyRelatedField(
        queryset=VehicleUnit.objects.all(), allow_null=True, required=False
    )
    unit_vin = serializers.CharField(
        source="unit.vin_chassis_no", read_only=True, allow_null=True, default=None
    )
    customer_name = serializers.CharField(required=False, allow_blank=True)
    time = serializers.TimeField(allow_null=True, required=False)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = TestDrive
        fields = [
            "id", "display_id", "lead", "customer", "customer_name", "unit", "unit_vin", "vehicle", "date",
            "time", "salesperson", "location", "status", "notes",
            "dealer", "dealer_name", "created_by", "created_by_name", "updated_by", "updated_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "created_by", "created_by_name", "updated_by", "updated_by_name"]

    def validate(self, attrs):
        lead = attrs.get("lead") or (self.instance.lead if self.instance else None)
        customer = attrs.get("customer") or (self.instance.customer if self.instance else None)
        if not lead and not customer:
            raise serializers.ValidationError("A test drive must be linked to either a lead or a customer.")

        # Transition validation if status is changing on existing record
        if self.instance and "status" in attrs and attrs["status"] != self.instance.status:
            from crm.services.pipeline import validate_test_drive_transition
            try:
                validate_test_drive_transition(self.instance.status, attrs["status"])
            except ValidationError as e:
                raise serializers.ValidationError({"status": str(e.detail[0] if isinstance(e.detail, list) else e.detail)})

        # Double-booking overlap validation
        unit = attrs.get("unit") or (self.instance.unit if self.instance else None)
        date = attrs.get("date") or (self.instance.date if self.instance else None)
        time = attrs.get("time") if "time" in attrs else (self.instance.time if self.instance else None)
        if unit and date and time:
            from crm.services.pipeline import check_test_drive_conflict
            conflict = check_test_drive_conflict(
                unit=unit,
                date=date,
                time=time,
                exclude_id=self.instance.pk if self.instance else None,
            )
            if conflict:
                raise serializers.ValidationError(
                    {"unit": f"Vehicle unit {unit.vin_chassis_no} is already booked for an overlapping test drive at {conflict.time}."}
                )

        return attrs


class QuotationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    display_id = serializers.CharField(read_only=True)
    lead = serializers.PrimaryKeyRelatedField(
        queryset=Lead.objects.all(), allow_null=True, required=False
    )
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), allow_null=True, required=False
    )
    customer_name = serializers.CharField(required=False, allow_blank=True)
    vehicle_model = serializers.PrimaryKeyRelatedField(
        queryset=VehicleModel.objects.all(), required=True
    )
    vehicle_model_detail = serializers.SerializerMethodField(read_only=True)
    variant = serializers.PrimaryKeyRelatedField(
        queryset=VehicleVariant.objects.all(), allow_null=True, required=False
    )
    variant_detail = serializers.SerializerMethodField(read_only=True)
    unit = serializers.PrimaryKeyRelatedField(
        queryset=VehicleUnit.objects.all(), allow_null=True, required=False
    )
    unit_detail = serializers.SerializerMethodField(read_only=True)
    reserved_unit = serializers.PrimaryKeyRelatedField(
        queryset=VehicleUnit.objects.all(), allow_null=True, required=False
    )
    vehicle_price = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False, required=False, default=0)
    accessories = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False, required=False, default=0)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False, required=False, default=0)
    vat_rate = serializers.DecimalField(max_digits=5, decimal_places=2, coerce_to_string=False, required=False, default=0)
    other_charges = serializers.DecimalField(max_digits=12, decimal_places=2, coerce_to_string=False, required=False, default=0)
    valid_until = serializers.DateField(allow_null=True, required=False)
    sale_id = serializers.SerializerMethodField(read_only=True)
    sale_unit_id = serializers.SerializerMethodField(read_only=True)
    sale_unit_vin = serializers.SerializerMethodField(read_only=True)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    amount_in_words = serializers.CharField(read_only=True)
    salesperson_name = serializers.SerializerMethodField()

    class Meta:
        model = Quotation
        # DRF 3.18.3 turns this partial unique index into a unique-together
        # validator and then requires reserved_unit on every create.
        # The database constraint still blocks two active reservations.
        validators = []
        fields = [
            "id", "uuid", "display_id", "lead", "customer", "customer_name", "company",
            "pan_number", "customer_phone", "customer_address",
            "vehicle_model", "vehicle_model_detail", "variant", "variant_detail",
            "unit", "unit_detail", "reserved_unit",
            "vehicle", "vehicle_description", "battery_capacity", "vehicle_length",
            "bank_name", "bank_address",
            "transmission", "range_km", "version", "charger_info",
            "quantity",
            "payment_terms", "delivery_terms", "warranty_terms", "insurance_terms", "registration_terms",
            "salesperson", "salesperson_name", "salesperson_email", "salesperson_phone",
            "vehicle_price", "accessories",
            "discount", "vat_rate", "other_charges", "valid_until", "reference_no", "notes", "extra_specs",
            "amount_in_words",
            "dealer", "dealer_name", "created_by", "created_by_name", "updated_by", "updated_by_name",
            "status", "created_at", "updated_at", "converted_to_order",
            "parent", "root", "revision_number", "is_latest",
            "sale_id", "sale_unit_id", "sale_unit_vin",
        ]
        read_only_fields = [
            "uuid", "variant_detail", "created_at", "updated_at", "converted_to_order",
            "parent", "root", "revision_number", "is_latest",
            "sale_id", "sale_unit_id", "sale_unit_vin",
            "created_by", "created_by_name", "updated_by", "updated_by_name",
            "amount_in_words",
        ]

    def get_salesperson_name(self, obj):
        return obj.resolved_salesperson_name

    def to_representation(self, instance):
        # Heal legacy refs (e.g. QT-10T-20F16486CH-11) to the modern form used in the UI.
        try:
            from .quotation_reference import ensure_modern_quotation_reference

            ensure_modern_quotation_reference(instance)
        except Exception:
            pass
        ret = super().to_representation(instance)
        if not ret.get("salesperson_email"):
            ret["salesperson_email"] = instance.resolved_salesperson_email
        if not ret.get("salesperson_phone"):
            ret["salesperson_phone"] = instance.resolved_salesperson_phone
        return ret

    def _assign_reference_no(self, attrs):
        from .quotation_reference import (
            build_quotation_reference,
            quotation_reference_stem,
            reference_matches_stem,
        )

        instance = self.instance
        vm = attrs.get("vehicle_model") or (instance.vehicle_model if instance else None)
        variant = attrs.get("variant") if "variant" in attrs else (instance.variant if instance else None)
        battery = attrs.get("battery_capacity") if "battery_capacity" in attrs else (
            instance.battery_capacity if instance else ""
        )
        length = attrs.get("vehicle_length") if "vehicle_length" in attrs else (
            instance.vehicle_length if instance else ""
        )
        if not (vm and variant and battery and length):
            return attrs

        stem = quotation_reference_stem(
            vehicle_model=vm,
            variant=variant,
            battery_capacity=battery or "",
            vehicle_length=length or "",
        )
        current = attrs.get("reference_no")
        if current is None and instance is not None:
            current = instance.reference_no or ""
        current = (current or "").strip()
        # Keep only modern QT-{tonnage}-{product}-{battery}-{cargo}-{seq} numbers.
        if not reference_matches_stem(current, stem):
            attrs["reference_no"] = build_quotation_reference(
                vehicle_model=vm,
                variant=variant,
                battery_capacity=battery or "",
                vehicle_length=length or "",
                exclude_id=instance.pk if instance else None,
            )
        else:
            attrs["reference_no"] = current
        return attrs

    def create(self, validated_data):
        validated_data = self._assign_reference_no(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data = self._assign_reference_no(validated_data)
        return super().update(instance, validated_data)

    def validate(self, attrs):
        lead = attrs.get("lead") or (self.instance.lead if self.instance else None)
        customer = attrs.get("customer") or (self.instance.customer if self.instance else None)
        if not lead and not customer:
            raise serializers.ValidationError("A quotation must be linked to either a lead or a customer.")
        vm = attrs.get("vehicle_model") or (self.instance.vehicle_model if self.instance else None)
        if not vm and self.instance is None:
            raise serializers.ValidationError({"vehicle_model": "Vehicle model is required."})
        variant = attrs.get("variant") if "variant" in attrs else (self.instance.variant if self.instance else None)
        if vm:
            if variant:
                if variant.vehicle_model_id != vm.id:
                    raise serializers.ValidationError({"variant": "Selected variant does not belong to the chosen vehicle model."})
            elif getattr(vm, "has_active_variants", False):
                raise serializers.ValidationError({"variant": "This vehicle model has variants. Please select a variant."})

        # Use variant price override as default when present and vehicle_price is not provided or 0
        if variant and variant.price_override is not None:
            if "vehicle_price" not in attrs or attrs.get("vehicle_price") in (None, 0, Decimal("0"), "0"):
                attrs["vehicle_price"] = variant.price_override

        return attrs

    def get_vehicle_model_detail(self, obj):
        if obj.vehicle_model:
            from .models import catalog_range_for_model

            return {
                "id": obj.vehicle_model.id,
                "brand": obj.vehicle_model.brand,
                "model_name": obj.vehicle_model.model_name,
                "range_km": catalog_range_for_model(obj.vehicle_model),
            }
        return None

    def get_variant_detail(self, obj):
        if obj.variant:
            return {
                "id": obj.variant.id,
                "name": obj.variant.name,
                "product_code": obj.variant.product_code or "",
                "body_type_name": obj.variant.body_type.name if obj.variant.body_type else "",
                "spec_text": obj.variant.spec_text,
                "price_override": str(obj.variant.price_override) if obj.variant.price_override is not None else None,
            }
        return None

    def get_unit_detail(self, obj):
        if obj.unit:
            return {
                "id": obj.unit.id,
                "vin_chassis_no": obj.unit.vin_chassis_no,
                "status": obj.unit.status,
            }
        return None

    def _get_sale(self, obj):
        if not hasattr(obj, "_cached_sale"):
            obj._cached_sale = obj.sales.filter(is_current=True).first() or obj.sales.first()
        return obj._cached_sale

    def get_sale_id(self, obj):
        s = self._get_sale(obj)
        return s.id if s else None

    def get_sale_unit_id(self, obj):
        s = self._get_sale(obj)
        return s.unit_id if s else None

    def get_sale_unit_vin(self, obj):
        s = self._get_sale(obj)
        return s.unit.vin_chassis_no if s and s.unit else None


class ActivityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityType
        fields = ["id", "name", "label", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        return name

    def validate(self, attrs):
        name = attrs.get("name")
        if name:
            qs = ActivityType.objects.filter(name__iexact=name.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"name": "Activity type with this name already exists."})
        return attrs


class ActivitySerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    lead = serializers.PrimaryKeyRelatedField(
        queryset=Lead.objects.all(), allow_null=True, required=False
    )
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), allow_null=True, required=False
    )
    # Read: resolved display name (FK user preferred, falls back to user_name).
    user = serializers.SerializerMethodField()
    # Write: display name string from the frontend.
    user_name = serializers.CharField(required=False, allow_blank=True, write_only=True)
    dealer_name = serializers.CharField(source="dealer.name", read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id", "lead", "customer", "type", "subject", "description",
            "datetime", "user", "user_name", "dealer", "dealer_name",
            "created_by", "created_by_name", "updated_by", "updated_by_name", "created_at",
        ]
        read_only_fields = ["created_at", "created_by", "created_by_name", "updated_by", "updated_by_name"]

    def get_user(self, obj):
        return obj.resolved_user


class CompanyBrandingSerializer(serializers.ModelSerializer):
    letterhead_url = serializers.SerializerMethodField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = CompanyBranding
        fields = [
            "id",
            "letterhead_image",
            "letterhead_url",
            "updated_at",
            "updated_by",
            "updated_by_name",
        ]
        read_only_fields = ["id", "letterhead_url", "updated_at", "updated_by", "updated_by_name"]

    def get_letterhead_url(self, obj):
        if obj.letterhead_image:
            request = self.context.get("request")
            url = obj.letterhead_image.url
            return request.build_absolute_uri(url) if request else url
        return None


class DocumentTypeMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentTypeMaster
        fields = [
            "id",
            "name",
            "code",
            "description",
            "is_required_for_shipment",
            "is_active",
            "created_at",
        ]


class DocumentVersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)
    download_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DocumentVersion
        fields = [
            "id",
            "document",
            "version_no",
            "file_hash",
            "file_size",
            "file_type",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "change_note",
            "download_url",
        ]

    def get_download_url(self, obj):
        request = self.context.get("request")
        url = f"/api/crm/documents/{obj.document_id}/versions/{obj.id}/download/"
        return request.build_absolute_uri(url) if request else url


class DocumentAttachmentSerializer(serializers.ModelSerializer):
    shipment_no = serializers.CharField(source="shipment.shipment_no", read_only=True)
    unit_vin = serializers.CharField(source="unit.vin_chassis_no", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    sale_no = serializers.CharField(source="sale.sale_no", read_only=True)
    employee_name = serializers.SerializerMethodField(read_only=True)
    target_summary = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = DocumentAttachment
        fields = [
            "id",
            "document",
            "shipment",
            "shipment_no",
            "unit",
            "unit_vin",
            "customer",
            "customer_name",
            "sale",
            "sale_no",
            "employee",
            "employee_name",
            "target_summary",
            "created_at",
        ]

    def get_target_summary(self, obj):
        if obj.shipment:
            return f"Shipment #{obj.shipment.shipment_no or obj.shipment.batch_no}"
        if obj.unit:
            return f"Unit VIN: {obj.unit.vin_chassis_no}"
        if obj.customer:
            return f"Customer: {obj.customer.name}"
        if obj.sale:
            return f"Sale #{obj.sale.sale_no}"
        if obj.employee_id:
            return f"Employee {obj.employee.employee_code} {obj.employee.full_name}"
        return "Unknown"

    def get_employee_name(self, obj):
        if not obj.employee_id:
            return ""
        return f"{obj.employee.employee_code} {obj.employee.full_name}"


class DocumentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="title", required=False)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)
    document_type_master_detail = DocumentTypeMasterSerializer(
        source="document_type_master", read_only=True
    )
    file_url = serializers.SerializerMethodField(read_only=True)
    download_url = serializers.SerializerMethodField(read_only=True)
    preview_url = serializers.SerializerMethodField(read_only=True)
    expiry_status = serializers.SerializerMethodField(read_only=True)
    versions = DocumentVersionSerializer(many=True, read_only=True)
    version = serializers.SerializerMethodField(read_only=True)
    attachments = DocumentAttachmentSerializer(many=True, read_only=True)
    used_in = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "name",
            "category",
            "document_type_master",
            "document_type_master_detail",
            "document_type",
            "file",
            "file_url",
            "download_url",
            "preview_url",
            "file_hash",
            "file_size",
            "file_type",
            "version",
            "expiry_date",
            "expiry_status",
            "notes",
            "is_deleted",
            "deletion_reason",
            "customer",
            "lead",
            "quotation",
            "uploaded_by",
            "uploaded_by_name",
            "versions",
            "attachments",
            "used_in",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "file_url",
            "download_url",
            "preview_url",
            "file_hash",
            "file_size",
            "file_type",
            "version",
            "expiry_status",
            "uploaded_by",
            "uploaded_by_name",
            "versions",
            "attachments",
            "used_in",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def get_version(self, obj):
        return obj.versions.count() + 1

    def get_file_url(self, obj):
        if obj.file:
            return private_media_url(self.context.get("request"), f"/api/crm/documents/{obj.id}/preview/")
        return None

    def get_download_url(self, obj):
        if obj.file:
            return private_media_url(self.context.get("request"), f"/api/crm/documents/{obj.id}/download/")
        return None

    def get_preview_url(self, obj):
        if obj.file:
            return private_media_url(self.context.get("request"), f"/api/crm/documents/{obj.id}/preview/")
        return None

    def get_expiry_status(self, obj):
        if not obj.expiry_date:
            return None
        today = timezone.localdate()
        if obj.expiry_date < today:
            return "EXPIRED"
        if obj.expiry_date <= today + datetime.timedelta(days=30):
            return "EXPIRING_SOON"
        return "VALID"

    def get_used_in(self, obj):
        items = []
        for att in obj.attachments.all():
            if att.shipment:
                items.append({
                    "type": "shipment",
                    "id": att.shipment_id,
                    "label": f"Shipment #{att.shipment.shipment_no or att.shipment.batch_no}",
                })
            elif att.unit:
                items.append({
                    "type": "unit",
                    "id": att.unit_id,
                    "label": f"Unit: {att.unit.vin_chassis_no}",
                })
            elif att.customer:
                items.append({
                    "type": "customer",
                    "id": att.customer_id,
                    "label": f"Customer: {att.customer.name}",
                })
            elif att.sale:
                items.append({
                    "type": "sale",
                    "id": att.sale_id,
                    "label": f"Sale #{att.sale.sale_no}",
                })
        if obj.customer_id and not any(i["type"] == "customer" and i["id"] == obj.customer_id for i in items):
            items.append({
                "type": "customer",
                "id": obj.customer_id,
                "label": f"Customer: {obj.customer.name}",
            })
        if obj.lead_id and not any(i["type"] == "lead" and i["id"] == obj.lead_id for i in items):
            items.append({
                "type": "lead",
                "id": obj.lead_id,
                "label": f"Lead: {obj.lead.name}",
            })
        if obj.quotation_id and not any(i["type"] == "quotation" and i["id"] == obj.quotation_id for i in items):
            items.append({
                "type": "quotation",
                "id": obj.quotation_id,
                "label": f"Quotation: {obj.quotation.reference_no}",
            })
        return items
