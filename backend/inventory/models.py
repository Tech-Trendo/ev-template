"""Vehicle stock, import, PDI and condition-report models.

One physical vehicle unit (``VehicleUnit``) is the core record shared by
stock management, PDI inspections and full condition reports. Every
status-affecting change goes through ``VehicleUnit.transition_to`` so a
``StockMovement`` ledger row is always written alongside it.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from common.models import AuditTrackedModel, CreatedTrackedModel
from common.storage import private_storage


class OverallRating(models.TextChoices):
    VERY_GOOD = "VERY_GOOD", "Very Good"
    GOOD = "GOOD", "Good"
    POOR = "POOR", "Poor"


class CheckResult(models.TextChoices):
    OK = "OK", "OK"
    NOT_OK = "NOT_OK", "Not OK"
    NA = "NA", "N/A"


class PaymentMode(models.TextChoices):
    CASH = "CASH", "Cash / Bank Transfer"
    BANK_FINANCE = "BANK_FINANCE", "Bank Finance"
    PARTIAL_FINANCE = "PARTIAL_FINANCE", "Partial Finance / EMI"
    EXCHANGE = "EXCHANGE", "Exchange / Trade-In"
    LEASE = "LEASE", "Leasing"


class FinanceStatus(models.TextChoices):
    NOT_APPLICABLE = "NOT_APPLICABLE", "Not Applicable"
    PENDING_APPROVAL = "PENDING_APPROVAL", "Pending Approval"
    APPROVED = "APPROVED", "Approved"
    DISBURSED = "DISBURSED", "Disbursed"
    SELF_FINANCED = "SELF_FINANCED", "Self Financed"


class VehicleModel(AuditTrackedModel):
    """Spec master for an EV model sold by the dealership (brand + model)."""

    CHARGER_AC_3_5 = "AC_3_5"
    CHARGER_AC_7 = "AC_7"
    CHARGER_DC_FAST = "DC_FAST"
    CHARGER_CHOICES = [
        (CHARGER_AC_3_5, "AC 3.5kW"),
        (CHARGER_AC_7, "AC 7kW"),
        (CHARGER_DC_FAST, "DC Fast"),
    ]

    brand = models.CharField(max_length=100, db_index=True)
    model_name = models.CharField(max_length=100)
    battery_power_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    motor_power_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    seating_capacity = models.PositiveSmallIntegerField(null=True, blank=True)
    charger_type = models.CharField(
        max_length=20, choices=CHARGER_CHOICES, blank=True
    )
    default_color_options = models.JSONField(default=list, blank=True)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    vehicle_warranty_months = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="General vehicle warranty duration in months.",
    )
    vehicle_warranty_km = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="General vehicle warranty mileage limit in km.",
    )
    battery_warranty_months = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Traction battery warranty duration in months.",
    )
    battery_warranty_km = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Traction battery warranty mileage limit in km.",
    )
    motor_warranty_months = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Drive motor warranty duration in months.",
    )
    service_interval_months = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Routine service interval in months.",
    )
    service_interval_km = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Routine service interval mileage limit in km.",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["brand", "model_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["brand", "model_name"], name="uniq_inventory_model"
            )
        ]

    def __str__(self):
        if self.model_name.lower().startswith(self.brand.lower()):
            return self.model_name
        return f"{self.brand} {self.model_name}".strip()

    @property
    def has_active_variants(self) -> bool:
        """True if this model has at least one active variant; controls whether variant selection is required."""
        return self.variants.filter(is_active=True).exists()


class VehicleModelSpec(models.Model):
    """Battery capacity or cargo length choices for one vehicle model."""

    class Kind(models.TextChoices):
        BATTERY = "battery", "Battery capacity"
        CARGO_LENGTH = "cargo_length", "Cargo length"

    vehicle_model = models.ForeignKey(
        VehicleModel,
        on_delete=models.CASCADE,
        related_name="specs",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    label = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["vehicle_model", "kind", "sort_order", "label"]
        constraints = [
            models.UniqueConstraint(
                fields=["vehicle_model", "kind", "label"],
                name="uniq_vehicle_model_spec_label",
            )
        ]

    def __str__(self):
        return f"{self.vehicle_model} {self.get_kind_display()}: {self.label}"


class VehicleBodyType(models.Model):
    """Admin-managed list of body types (e.g. Container, Chiller, Flatbed, Tipper)."""

    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name = "Vehicle Body Type"
        verbose_name_plural = "Vehicle Body Types"

    def __str__(self):
        return self.name


class VehicleVariant(AuditTrackedModel):
    """A named variant under a VehicleModel (e.g. Aochi 6 Ton -> Container, Chiller).

    A model with at least one active variant requires variant selection when
    creating a VehicleUnit, Quotation, or Sale. Models with no active variants
    behave exactly as before.
    """

    vehicle_model = models.ForeignKey(
        VehicleModel,
        on_delete=models.CASCADE,
        related_name="variants",
    )
    name = models.CharField(max_length=150, help_text="Variant name, e.g. Container, Chiller, Flatbed")
    product_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Short product code used in quotation references, e.g. CHA, HDC, COT.",
    )
    body_type = models.ForeignKey(
        VehicleBodyType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="variants",
    )
    spec_text = models.TextField(
        blank=True,
        help_text="Short specification summary shown on quotation and unit profile.",
    )
    price_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional list price for this variant. Overrides the model default when set.",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["vehicle_model", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["vehicle_model", "name"],
                name="uniq_vehicle_variant_per_model",
            )
        ]
        permissions = [
            ("manage_vehiclevariant", "Can add, change and delete vehicle variants"),
        ]

    def __str__(self):
        return f"{self.vehicle_model} — {self.name}"


def sync_catalog_vehicles_to_models():
    """Synchronize catalog vehicles from vehicles.models.Vehicle into inventory VehicleModel."""
    try:
        from vehicles.models import Vehicle
    except ImportError:
        return

    # Delete obsolete unreferenced dummy seed models (e.g. 'M', 'M2') and
    # models left behind by the old ``name[6:]`` slicing bug.
    VehicleModel.objects.filter(
        brand="VT",
        model_name__in=["M", "M2", "go 10T", "ler 6T", "yVan 3T"],
        units__isnull=True,
    ).delete()

    for v in Vehicle.objects.all():
        name = (v.name or "").strip()
        if not name:
            continue
        upper = name.upper()
        if upper.startswith("VT "):
            brand = "VT"
            model_name = name[3:].strip()
        elif upper.startswith("VT-"):
            brand = "VT"
            model_name = name[3:].strip()
        elif " " in name:
            parts = name.split(" ", 1)
            brand = parts[0].strip()
            model_name = parts[1].strip()
        else:
            brand = "VT"
            model_name = name

        vm, _ = VehicleModel.objects.get_or_create(
            brand=brand,
            model_name=model_name,
            defaults={
                "is_active": v.is_active,
                "default_color_options": ["White", "Silver", "Blue", "Gray"],
            },
        )
        if vm.is_active != v.is_active:
            vm.is_active = v.is_active
            vm.save(update_fields=["is_active"])


class TransportStatusOption(models.Model):
    """Dynamically managed transport status options for China shipments.

    Shipment forms read active statuses from this table. ``ImportBatch.transport_status``
    stores the status code/name as a plain string, preserving historical consignments.
    """
    name = models.CharField(max_length=50, unique=True, help_text="System code, e.g. IN_TRANSIT")
    label = models.CharField(max_length=100, help_text="Display label shown in UI")
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Transport Status"
        verbose_name_plural = "Transport Statuses"

    def __str__(self):
        return self.label or self.name


class BorderCrossing(models.Model):
    """Dynamically managed Nepal-China border crossings for shipments."""
    name = models.CharField(max_length=100, unique=True, help_text="e.g. Rasuwagadhi (Kerung)")
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Border Crossing"
        verbose_name_plural = "Border Crossings"

    def __str__(self):
        return self.name


class DestinationWarehouse(models.Model):
    """Dynamically managed destination warehouses/stockyards for shipments."""
    name = models.CharField(max_length=150, unique=True, help_text="e.g. Kathmandu Central Stockyard")
    location = models.CharField(max_length=255, blank=True, help_text="Physical location / address")
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Destination Warehouse"
        verbose_name_plural = "Destination Warehouses"

    def __str__(self):
        return self.name


class ShipmentSequence(models.Model):
    """Yearly counter backing auto-generated shipment numbers (SHP-YYYY-NNNNNN)."""

    sequence_type = models.CharField(max_length=10, default="SHP", db_index=True)
    year = models.PositiveIntegerField()
    last_seq = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sequence_type", "year"],
                name="uniq_shipmentsequence_type_year",
            )
        ]

    def __str__(self):
        return f"{self.sequence_type}-{self.year}: {self.last_seq}"

    @classmethod
    def next_shipment_no(cls):
        year = timezone.localdate().year
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                sequence_type="SHP", year=year
            )
            seq.last_seq += 1
            while ImportBatch.objects.filter(
                shipment_no=f"SHP-{year}-{seq.last_seq:06d}"
            ).exists():
                seq.last_seq += 1
            seq.save(update_fields=["last_seq"])
            return f"SHP-{year}-{seq.last_seq:06d}"

    @classmethod
    def record_external_shipment_no(cls, shipment_no: str):
        """Advance yearly sequence if external shipment number matches SHP-YYYY-NNNNNN
        so future auto-generated shipment numbers cannot collide."""
        import re
        m = re.match(r"^SHP-(\d{4})-(\d+)$", (shipment_no or "").strip())
        if not m:
            return
        year = int(m.group(1))
        seq_num = int(m.group(2))
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                sequence_type="SHP", year=year
            )
            if seq.last_seq < seq_num:
                seq.last_seq = seq_num
                seq.save(update_fields=["last_seq"])


class ImportJob(models.Model):
    """Tracks a historical bulk import file execution (dry run, commit, rollback)."""

    class ImportType(models.TextChoices):
        CUSTOMERS = "customers", "Customers"
        SHIPMENTS = "shipments", "Shipments"
        UNITS = "units", "Units"
        SALES = "sales", "Sales"
        SERVICING = "servicing", "Servicing History"
        SHIPMENT_COSTS = "shipment_costs", "Shipment Cost Lines"

    class Status(models.TextChoices):
        DRY_RUN = "dry_run", "Dry run"
        COMMITTED = "committed", "Committed"
        FAILED = "failed", "Failed"
        ROLLED_BACK = "rolled_back", "Rolled back"

    import_type = models.CharField(max_length=30, choices=ImportType.choices)
    original_filename = models.CharField(max_length=255)
    file_sha256 = models.CharField(max_length=64, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="import_jobs",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRY_RUN,
        db_index=True,
    )
    rows_read = models.PositiveIntegerField(default=0)
    rows_created = models.PositiveIntegerField(default=0)
    rows_skipped = models.PositiveIntegerField(default=0)
    rows_error = models.PositiveIntegerField(default=0)
    options_used = models.JSONField(default=dict, blank=True)
    error_summary = models.JSONField(default=list, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    rollback_blocked_reason = models.TextField(blank=True, default="")
    rolled_back_at = models.DateTimeField(null=True, blank=True)
    rolled_back_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]
        permissions = [
            ("run_historical_import", "Can run historical data imports"),
        ]

    def __str__(self):
        return f"ImportJob #{self.id} ({self.get_import_type_display()} - {self.get_status_display()})"


class ShipmentCostType(models.Model):
    """Admin-managed cost categories (freight, customs duty, VAT, clearing agent, transport, insurance, other)."""

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ShipmentCost(models.Model):
    """Cost lines incurred for a specific shipment/import batch."""

    shipment = models.ForeignKey(
        "ImportBatch", on_delete=models.CASCADE, related_name="costs"
    )
    cost_type = models.ForeignKey(
        ShipmentCostType, on_delete=models.PROTECT, related_name="shipment_costs"
    )
    description = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=10, default="NPR")
    exchange_rate = models.DecimalField(max_digits=12, decimal_places=4, default=1.0)
    amount_npr = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        ImportJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_shipment_costs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        rate = self.exchange_rate if self.exchange_rate is not None else 1.0
        self.amount_npr = round(self.amount * rate, 2)
        super().save(*args, **kwargs)

    def __str__(self):
        ref = getattr(self.shipment, "shipment_no", "") or getattr(self.shipment, "batch_no", "")
        return f"{ref} · {self.cost_type.name}: {self.currency} {self.amount}"


class ImportBatch(models.Model):
    """One shipment/container of vehicles arriving from China or overseas."""

    class TransportStatus(models.TextChoices):
        ORDERED = "ORDERED", "Dispatched from China Factory"
        IN_TRANSIT = "IN_TRANSIT", "In Transit (China to Border)"
        BORDER_CUSTOMS = "BORDER_CUSTOMS", "At Nepal Border Customs"
        CUSTOMS_CLEARED = "CUSTOMS_CLEARED", "Customs Cleared & En Route"
        ARRIVED = "ARRIVED", "Arrived at Stockyard"

    class ShipmentStatus(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        IN_TRANSIT = "IN_TRANSIT", "In transit"
        AT_PORT = "AT_PORT", "At port"
        CUSTOMS_CLEARANCE = "CUSTOMS_CLEARANCE", "Customs clearance"
        RECEIVED = "RECEIVED", "Received"
        CLOSED = "CLOSED", "Closed"

    shipment_no = models.CharField(max_length=50, unique=True, null=True, blank=True, db_index=True)
    batch_no = models.CharField(max_length=50, unique=True, blank=True)
    supplier_exporter = models.CharField(max_length=200, blank=True)
    container_bl_no = models.CharField(max_length=100, blank=True)
    vessel_transport_mode = models.CharField(max_length=100, blank=True, default="Road / Truck")
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_arrival = models.CharField(max_length=100, blank=True, default="Birgunj ICD")
    etd = models.DateField(null=True, blank=True)
    eta = models.DateField(null=True, blank=True)
    actual_arrival_date = models.DateField(null=True, blank=True)
    customs_clearance_date = models.DateField(null=True, blank=True)
    warehouse_received_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=ShipmentStatus.choices,
        default=ShipmentStatus.ORDERED,
        db_index=True,
    )
    origin = models.CharField(max_length=200, blank=True)
    transport_status = models.CharField(
        max_length=50,
        default="IN_TRANSIT",
        db_index=True,
    )
    border_crossing = models.CharField(
        max_length=100, blank=True, default="Rasuwagadhi (Kerung)"
    )
    customs_declaration_no = models.CharField(max_length=100, blank=True)
    container_or_truck_no = models.CharField(max_length=100, blank=True)
    carrier_name = models.CharField(max_length=150, blank=True)
    destination_warehouse = models.CharField(
        max_length=150, blank=True, default="Kathmandu Central Stockyard"
    )
    lc_number = models.CharField(max_length=100, blank=True)
    shipped_date = models.DateField(null=True, blank=True)
    eta_date = models.DateField(null=True, blank=True)
    arrived_date = models.DateField(null=True, blank=True)
    invoice_no = models.CharField(max_length=100, blank=True)
    total_units = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        ImportJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_shipments",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    deletion_reason = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="import_batches",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_import_batches",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def created_by_name(self) -> str:
        if self.created_by:
            return self.created_by.get_full_name() or self.created_by.username
        return "System / legacy"

    @property
    def updated_by_name(self) -> str:
        if self.updated_by:
            return self.updated_by.get_full_name() or self.updated_by.username
        return "System / legacy"

    class Meta:
        ordering = ["-created_at", "-id"]
        permissions = [
            ("view_shipment_costs", "Can view shipment landed costs"),
            ("override_shipment_closed", "Can override missing required documents to close shipment"),
        ]

    def __str__(self):
        return self.shipment_no or self.batch_no or f"Batch #{self.pk}"

    def get_transport_status_display(self):
        try:
            status_obj = TransportStatusOption.objects.filter(name=self.transport_status).first()
            if status_obj and status_obj.label:
                return status_obj.label
        except Exception:
            pass
        return dict(self.TransportStatus.choices).get(self.transport_status, self.transport_status)

    @property
    def total_landed_cost_npr(self):
        return sum(c.amount_npr for c in self.costs.all())

    @property
    def average_cost_per_unit_npr(self):
        count = self.units.count()
        if count:
            return round(self.total_landed_cost_npr / count, 2)
        return 0

    def get_progress_summary(self):
        units_qs = self.units.all()
        expected = units_qs.count() or self.total_units
        received = units_qs.exclude(status=VehicleUnit.Status.IN_TRANSIT).count()

        vei_inspections = PDIInspection.objects.filter(
            vehicle__in=units_qs,
            inspection_type=PDIInspection.InspectionType.VEI,
        )
        done_unit_ids = set(
            vei_inspections.filter(
                status__in=[
                    PDIInspection.InspectionStatus.COMPLETED,
                    PDIInspection.InspectionStatus.LOCKED,
                ]
            ).values_list("vehicle_id", flat=True)
        )
        issues_unit_ids = set(
            vei_inspections.filter(
                models.Q(issues__resolved=False)
                | models.Q(results__result=CheckResult.NOT_OK)
                | models.Q(overall_rating=OverallRating.POOR)
            ).values_list("vehicle_id", flat=True)
        )
        return {
            "units_expected": expected,
            "units_received": received,
            "vei_done": len(done_unit_ids),
            "vei_with_issues": len(issues_unit_ids),
        }

    def save(self, *args, **kwargs):
        if not self.shipment_no:
            self.shipment_no = ShipmentSequence.next_shipment_no()
        if not self.batch_no:
            self.batch_no = self.shipment_no

        if not self.supplier_exporter and self.origin:
            self.supplier_exporter = self.origin
        elif self.supplier_exporter and not self.origin:
            self.origin = self.supplier_exporter

        if not self.container_bl_no and self.container_or_truck_no:
            self.container_bl_no = self.container_or_truck_no
        elif self.container_bl_no and not self.container_or_truck_no:
            self.container_or_truck_no = self.container_bl_no

        if not self.eta and self.eta_date:
            self.eta = self.eta_date
        elif self.eta and not self.eta_date:
            self.eta_date = self.eta

        if not self.actual_arrival_date and self.arrived_date:
            self.actual_arrival_date = self.arrived_date
        elif self.actual_arrival_date and not self.arrived_date:
            self.arrived_date = self.actual_arrival_date

        super().save(*args, **kwargs)

    def refresh_unit_count(self):
        count = self.units.count()
        if count != self.total_units:
            self.total_units = count
            self.save(update_fields=["total_units"])

    def receive_all_units(self, by=None, note=""):
        """Transition all units in IN_TRANSIT to IN_WAREHOUSE and update batch status."""
        today = timezone.localdate()
        with transaction.atomic():
            self.transport_status = self.TransportStatus.ARRIVED
            self.status = self.ShipmentStatus.RECEIVED
            if not self.arrived_date:
                self.arrived_date = today
            if not self.actual_arrival_date:
                self.actual_arrival_date = today
            if not self.warehouse_received_date:
                self.warehouse_received_date = today
            self.save(update_fields=[
                "transport_status", "status", "arrived_date",
                "actual_arrival_date", "warehouse_received_date", "updated_at"
            ])

            moved_count = 0
            for unit in self.units.filter(status=VehicleUnit.Status.IN_TRANSIT):
                unit.transition_to(
                    VehicleUnit.Status.IN_WAREHOUSE,
                    by=by,
                    note=note or f"Shipment {self.shipment_no or self.batch_no} arrived at {self.destination_warehouse or 'warehouse'}",
                )
                moved_count += 1
            return moved_count


def add_months(d, months):
    """Add integer months to a date object, clamping to the last valid day of month."""
    if not d or not months:
        return None
    if isinstance(d, str):
        from django.utils.dateparse import parse_date
        d = parse_date(d)
    if not d:
        return None
    import calendar
    from datetime import date
    total_months = (d.year * 12 + d.month - 1) + months
    year = total_months // 12
    month = (total_months % 12) + 1
    max_days = calendar.monthrange(year, month)[1]
    day = min(d.day, max_days)
    return date(year, month, day)


class VehicleUnit(AuditTrackedModel):
    """One physical vehicle unit — the core record of this module."""

    class Status(models.TextChoices):
        IN_TRANSIT = "IN_TRANSIT", "In Transit"
        IN_WAREHOUSE = "IN_WAREHOUSE", "In Warehouse"
        PDI_PENDING = "PDI_PENDING", "PDI Pending"
        PDI_PASSED = "PDI_PASSED", "PDI Passed"
        PDI_FAILED = "PDI_FAILED", "PDI Failed"
        READY_FOR_SALE = "READY_FOR_SALE", "Ready for Sale"
        RESERVED = "RESERVED", "Reserved"
        SOLD = "SOLD", "Sold"
        RETURNED = "RETURNED", "Returned"
        SCRAPPED = "SCRAPPED", "Scrapped"

    #: Allowed status transitions, enforced server-side.
    TRANSITIONS = {
        Status.IN_TRANSIT: [Status.IN_WAREHOUSE, Status.SCRAPPED],
        Status.IN_WAREHOUSE: [Status.PDI_PENDING, Status.SCRAPPED],
        Status.PDI_PENDING: [
            Status.PDI_PASSED,
            Status.PDI_FAILED,
            Status.IN_WAREHOUSE,
            Status.SCRAPPED,
        ],
        Status.PDI_FAILED: [Status.PDI_PENDING, Status.SCRAPPED],
        Status.PDI_PASSED: [
            Status.READY_FOR_SALE,
            Status.PDI_PENDING,
            Status.SCRAPPED,
        ],
        Status.READY_FOR_SALE: [
            Status.RESERVED,
            Status.SOLD,
            Status.SCRAPPED,
        ],
        Status.RESERVED: [
            Status.SOLD,
            Status.READY_FOR_SALE,
            Status.SCRAPPED,
        ],
        Status.SOLD: [Status.RETURNED],
        Status.RETURNED: [Status.IN_WAREHOUSE, Status.SCRAPPED],
        Status.SCRAPPED: [],
    }

    vin_chassis_no = models.CharField(max_length=100, unique=True, db_index=True)
    registration_no = models.CharField(max_length=50, blank=True, db_index=True)
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.PROTECT,
        related_name="units",
    )
    vehicle_model = models.ForeignKey(
        VehicleModel,
        on_delete=models.PROTECT,
        related_name="units",
    )
    variant = models.ForeignKey(
        "VehicleVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units",
        help_text="Selected variant for this unit. Required when the model has active variants.",
    )
    motor_no = models.CharField(max_length=100, blank=True, db_index=True)
    battery_no = models.CharField(
        max_length=100, blank=True, default="", db_index=True
    )
    battery_power_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    motor_power_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    color = models.CharField(max_length=60, blank=True, db_index=True)
    manufacture_date = models.DateField(null=True, blank=True)
    odometer_km = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_WAREHOUSE,
        db_index=True,
    )
    purchase_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    landed_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    selling_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    sold_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchased_units",
    )
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="units",
        db_index=True,
        help_text="Allocated dealership holding or selling this unit.",
    )
    current_customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_units",
        db_index=True,
    )
    customer_name = models.CharField(max_length=200, blank=True)
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchased_units",
    )
    quotation = models.ForeignKey(
        "crm.Quotation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sold_units",
    )
    sold_date = models.DateField(null=True, blank=True)
    warranty_end_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(
        max_length=30, choices=PaymentMode.choices, default=PaymentMode.CASH
    )
    finance_bank_name = models.CharField(max_length=150, blank=True)
    down_payment = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    loan_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    loan_tenure_months = models.PositiveIntegerField(null=True, blank=True)
    interest_rate = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    monthly_emi = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    finance_status = models.CharField(
        max_length=30, choices=FinanceStatus.choices, default=FinanceStatus.NOT_APPLICABLE
    )
    tax_invoice_no = models.CharField(max_length=100, blank=True)
    receipt_voucher_no = models.CharField(max_length=100, blank=True)
    salesperson_name = models.CharField(max_length=150, blank=True)
    delivery_notes = models.TextField(blank=True)
    reservation_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="UTC timestamp when the direct (non-quotation) unit reservation expires.",
    )
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        ImportJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_units",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["battery_no"],
                condition=~models.Q(battery_no=""),
                name="unique_vehicle_unit_battery_no",
            )
        ]

    def clean(self):
        super().clean()
        if self.status == self.Status.SOLD and not self.sold_price:
            raise ValidationError({"sold_price": "Sold price is required."})
        # Variant validation
        if self.vehicle_model_id:
            if self.variant_id:
                if self.variant.vehicle_model_id != self.vehicle_model_id:
                    raise ValidationError(
                        {"variant": "Selected variant does not belong to the chosen vehicle model."}
                    )
            else:
                # Only require variant for new units; existing units without variant are grandfathered.
                if not self.pk and self.vehicle_model.has_active_variants:
                    raise ValidationError(
                        {"variant": "This vehicle model has variants. Please select a variant."}
                    )
        if self.battery_no:
            val = self.battery_no.strip()
            qs = VehicleUnit.objects.filter(battery_no__iexact=val)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            conflicting = qs.first()
            if conflicting:
                raise ValidationError(
                    {
                        "battery_no": f"Battery number already used on unit VIN-{conflicting.vin_chassis_no}"
                    }
                )

    def save(self, *args, **kwargs):
        if self.battery_no:
            self.battery_no = self.battery_no.strip()
            update_fields = kwargs.get("update_fields")
            if update_fields is None or "battery_no" in update_fields:
                qs = VehicleUnit.objects.filter(battery_no__iexact=self.battery_no)
                if self.pk:
                    qs = qs.exclude(pk=self.pk)
                conflicting = qs.first()
                if conflicting:
                    raise ValidationError(
                        {
                            "battery_no": f"Battery number already used on unit VIN-{conflicting.vin_chassis_no}"
                        }
                    )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.vin_chassis_no} ({self.get_status_display()})"

    @property
    def pdi_status(self):
        latest = self.pdi_inspections.filter(
            inspection_type="PDI"
        ).order_by("-inspection_date", "-id").first()
        if latest:
            return latest.status
        if self.source == "historical import":
            return "LEGACY"
        return ""

    @property
    def latest_sale(self):
        return self.sales.filter(is_current=True).first() or self.sales.first()

    @property
    def warranty_start(self):
        sale = self.latest_sale
        return sale.sale_date if sale else self.sold_date

    def _calculate_warranty_end(self, months):
        if not months or not self.warranty_start:
            return None
        return add_months(self.warranty_start, months)

    @property
    def vehicle_warranty_end(self):
        if self.warranty_end_date:
            return self.warranty_end_date
        if self.warranty_start and self.vehicle_model and self.vehicle_model.vehicle_warranty_months:
            return self._calculate_warranty_end(self.vehicle_model.vehicle_warranty_months)
        return None

    @property
    def battery_warranty_end(self):
        if self.warranty_start and self.vehicle_model and self.vehicle_model.battery_warranty_months:
            return self._calculate_warranty_end(self.vehicle_model.battery_warranty_months)
        return None

    @property
    def motor_warranty_end(self):
        if self.warranty_start and self.vehicle_model and self.vehicle_model.motor_warranty_months:
            return self._calculate_warranty_end(self.vehicle_model.motor_warranty_months)
        return None

    @property
    def vehicle_warranty_status(self):
        if not self.vehicle_model or self.vehicle_model.vehicle_warranty_months is None:
            return "not_configured"
        if not self.warranty_start and not self.warranty_end_date:
            return "none"
        if self.warranty_end_date:
            return "active" if timezone.localdate() <= self.warranty_end_date else "expired"
        end_d = self.vehicle_warranty_end
        if not end_d:
            return "not_configured"
        if timezone.localdate() > end_d:
            return "expired"
        if (
            self.vehicle_model.vehicle_warranty_km is not None
            and self.odometer_km is not None
            and self.odometer_km > self.vehicle_model.vehicle_warranty_km
        ):
            return "expired"
        return "active"

    @property
    def battery_warranty_status(self):
        if not self.vehicle_model or self.vehicle_model.battery_warranty_months is None:
            return "not_configured"
        if not self.warranty_start:
            return "none"
        end_d = self.battery_warranty_end
        if not end_d:
            return "not_configured"
        if timezone.localdate() > end_d:
            return "expired"
        if (
            self.vehicle_model.battery_warranty_km is not None
            and self.odometer_km is not None
            and self.odometer_km > self.vehicle_model.battery_warranty_km
        ):
            return "expired"
        return "active"

    @property
    def motor_warranty_status(self):
        if not self.vehicle_model or self.vehicle_model.motor_warranty_months is None:
            return "not_configured"
        if not self.warranty_start:
            return "none"
        end_d = self.motor_warranty_end
        if not end_d:
            return "not_configured"
        return "active" if timezone.localdate() <= end_d else "expired"

    @property
    def warranty_end(self):
        return self.vehicle_warranty_end

    @property
    def warranty_status(self):
        return self.vehicle_warranty_status

    @property
    def effective_battery_kw(self):
        return (
            self.battery_power_kw
            if self.battery_power_kw is not None
            else self.vehicle_model.battery_power_kw
        )

    @property
    def effective_motor_kw(self):
        return (
            self.motor_power_kw
            if self.motor_power_kw is not None
            else self.vehicle_model.motor_power_kw
        )

    @property
    def latest_pdi(self):
        return self.pdi_inspections.order_by("-inspection_date", "-id").first()

    @property
    def next_service_due(self):
        """
        Compute routine service due status and metrics from last completed
        ServiceRecord (or sale date if never serviced) plus model interval,
        and odometer + interval_km, whichever triggers first.
        """
        if not self.vehicle_model:
            return {
                "status": "not_configured",
                "due_date": None,
                "due_km": None,
                "days_until_due": None,
                "km_until_due": None,
                "is_overdue": False,
                "overdue_by_date": False,
                "overdue_by_km": False,
                "last_service_date": None,
                "last_service_km": None,
            }

        m_months = self.vehicle_model.service_interval_months
        m_km = self.vehicle_model.service_interval_km
        if m_months is None and m_km is None:
            return {
                "status": "not_configured",
                "due_date": None,
                "due_km": None,
                "days_until_due": None,
                "km_until_due": None,
                "is_overdue": False,
                "overdue_by_date": False,
                "overdue_by_km": False,
                "last_service_date": None,
                "last_service_km": None,
            }

        last_srv = (
            self.service_records.filter(status__in=["completed", "delivered"])
            .order_by("-date_completed", "-date_received", "-id")
            .first()
        )

        if last_srv:
            base_date = last_srv.date_completed or last_srv.date_received
            base_km = last_srv.odometer_reading if last_srv.odometer_reading is not None else 0
        else:
            base_date = self.warranty_start
            base_km = 0

        if not base_date and m_months:
            return {
                "status": "none",
                "due_date": None,
                "due_km": None,
                "days_until_due": None,
                "km_until_due": None,
                "is_overdue": False,
                "overdue_by_date": False,
                "overdue_by_km": False,
                "last_service_date": None,
                "last_service_km": None,
            }

        due_date = add_months(base_date, m_months) if (base_date and m_months) else None
        due_km = (base_km + m_km) if m_km is not None else None

        today = timezone.localdate()
        current_km = self.odometer_km

        overdue_by_date = bool(due_date and today > due_date)
        overdue_by_km = bool(due_km is not None and current_km is not None and current_km > due_km)
        is_overdue = overdue_by_date or overdue_by_km

        days_until_due = (due_date - today).days if due_date else None
        km_until_due = (due_km - current_km) if (due_km is not None and current_km is not None) else None

        if is_overdue:
            status_val = "overdue"
        elif (days_until_due is not None and 0 <= days_until_due <= 7) or (
            km_until_due is not None and 0 <= km_until_due <= 500
        ):
            status_val = "due_soon"
        elif due_date or due_km:
            status_val = "ok"
        else:
            status_val = "not_configured"

        return {
            "status": status_val,
            "due_date": due_date,
            "due_km": due_km,
            "days_until_due": days_until_due,
            "km_until_due": km_until_due,
            "is_overdue": is_overdue,
            "overdue_by_date": overdue_by_date,
            "overdue_by_km": overdue_by_km,
            "last_service_date": base_date,
            "last_service_km": base_km,
        }

    @property
    def next_service_due_date(self):
        return self.next_service_due.get("due_date")

    @property
    def next_service_due_km(self):
        return self.next_service_due.get("due_km")

    @property
    def is_service_overdue(self):
        return self.next_service_due.get("is_overdue", False)

    @property
    def service_due_status(self):
        return self.next_service_due.get("status", "none")

    @property
    def open_inspection_issues(self):
        from inventory.models import InspectionIssue
        return InspectionIssue.objects.filter(inspection__vehicle=self, resolved=False)

    @property
    def open_inspection_issues_count(self):
        return self.open_inspection_issues.count()

    def transition_to(self, target, by=None, note=""):
        """Move to ``target`` status, enforcing the workflow + audit ledger."""
        target = str(target)
        allowed = [str(s) for s in self.TRANSITIONS.get(self.status, [])]
        if target not in allowed:
            raise ValidationError(
                f"Cannot move vehicle from {self.get_status_display()} "
                f"to {dict(self.Status.choices).get(target, target)}."
            )
        movement_type = StockMovement.movement_for_transition(self.status, target)
        with transaction.atomic():
            self.status = target
            self.save(update_fields=["status", "updated_at"])
            StockMovement.objects.create(
                vehicle=self,
                movement_type=movement_type,
                quantity=1,
                reference_note=note or "",
                created_by=by,
            )
        return self


class StockMovement(models.Model):
    """Append-only ledger of every stock-affecting event (audit source)."""

    class MovementType(models.TextChoices):
        IMPORTED = "IMPORTED", "Imported"
        ARRIVED = "ARRIVED", "Arrived at Warehouse"
        PDI_STARTED = "PDI_STARTED", "PDI Started"
        PDI_CANCELLED = "PDI_CANCELLED", "PDI Cancelled"
        PDI_PASSED = "PDI_PASSED", "PDI Passed"
        PDI_FAILED = "PDI_FAILED", "PDI Failed"
        MOVED_TO_READY = "MOVED_TO_READY", "Moved to Ready for Sale"
        RESERVED = "RESERVED", "Reserved"
        RELEASED = "RELEASED", "Reservation Released"
        SOLD = "SOLD", "Sold"
        RETURNED = "RETURNED", "Returned"
        RESTOCKED = "RESTOCKED", "Restocked"
        SCRAPPED = "SCRAPPED", "Scrapped"

    vehicle = models.ForeignKey(
        VehicleUnit, on_delete=models.CASCADE, related_name="movements"
    )
    movement_type = models.CharField(
        max_length=20, choices=MovementType.choices, db_index=True
    )
    quantity = models.PositiveIntegerField(default=1)
    reference_note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def created_by_name(self) -> str:
        if self.created_by:
            return self.created_by.get_full_name() or self.created_by.username
        return "System / legacy"

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.vehicle.vin_chassis_no} — {self.get_movement_type_display()}"

    @staticmethod
    def movement_for_transition(source, target):
        S = VehicleUnit.Status
        M = StockMovement.MovementType
        mapping = {
            (S.IN_TRANSIT, S.IN_WAREHOUSE): M.ARRIVED,
            (S.RETURNED, S.IN_WAREHOUSE): M.RESTOCKED,
            (S.PDI_PENDING, S.IN_WAREHOUSE): M.PDI_CANCELLED,
            (S.IN_WAREHOUSE, S.PDI_PENDING): M.PDI_STARTED,
            (S.PDI_FAILED, S.PDI_PENDING): M.PDI_STARTED,
            (S.PDI_PASSED, S.PDI_PENDING): M.PDI_STARTED,
            (S.PDI_PENDING, S.PDI_PASSED): M.PDI_PASSED,
            (S.PDI_PENDING, S.PDI_FAILED): M.PDI_FAILED,
            (S.PDI_PASSED, S.READY_FOR_SALE): M.MOVED_TO_READY,
            (S.READY_FOR_SALE, S.RESERVED): M.RESERVED,
            (S.RESERVED, S.READY_FOR_SALE): M.RELEASED,
            (S.READY_FOR_SALE, S.SOLD): M.SOLD,
            (S.RESERVED, S.SOLD): M.SOLD,
            (S.SOLD, S.RETURNED): M.RETURNED,
        }
        if (source, target) in mapping:
            return mapping[(source, target)]
        if target == S.SCRAPPED:
            return M.SCRAPPED
        return M.ARRIVED


def validate_inspection_image(image):
    """Validate inspection photo file size (<=5MB) and image format (JPEG, PNG, WebP)."""
    if not image:
        return
    max_size = 5 * 1024 * 1024
    if hasattr(image, "size") and image.size and image.size > max_size:
        raise ValidationError("Image file size cannot exceed 5MB.")

    content_type = getattr(image, "content_type", "")
    if content_type:
        allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
        if content_type.lower() not in allowed:
            raise ValidationError("Invalid image type. Only JPEG, PNG, and WebP are allowed.")
    else:
        name = getattr(image, "name", "")
        if name:
            import os
            ext = os.path.splitext(name)[1].lower()
            if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
                raise ValidationError("Invalid image extension. Only JPEG, PNG, and WebP are allowed.")


class PDITemplate(models.Model):
    """Versioned checklist template with optional model/variant overrides."""

    class InspectionType(models.TextChoices):
        VEI = "VEI", "Vehicle Entry Inspection"
        PDI = "PDI", "Pre-Delivery Inspection"

    inspection_type = models.CharField(
        max_length=10,
        choices=InspectionType.choices,
        default=InspectionType.PDI,
        db_index=True,
    )
    name = models.CharField(max_length=150, blank=True, default="")
    vehicle_model = models.ForeignKey(
        "VehicleModel",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="pdi_templates",
        help_text="Optional override for a specific vehicle model",
    )
    variant = models.ForeignKey(
        "VehicleVariant",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="pdi_templates",
        help_text="Optional override for a specific variant",
    )
    version_no = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_no", "-id"]
        permissions = [
            ("manage_pditemplate", "Can manage checklist templates"),
        ]

    def __str__(self):
        state = "active" if self.is_active else "inactive"
        scope = ""
        if self.variant:
            scope = f" · Variant {self.variant.name}"
        elif self.vehicle_model:
            scope = f" · Model {self.vehicle_model.name}"
        name_str = f" ({self.name})" if self.name else ""
        return f"{self.get_inspection_type_display()} Template v{self.version_no}{scope}{name_str} ({state})"

    @classmethod
    def get_template_for_vehicle(cls, inspection_type="PDI", vehicle_unit=None, vehicle_model_id=None, variant_id=None):
        """
        Resolves template with fallback:
        1. Specific variant override
        2. Specific model override (without variant)
        3. Global default template (no model and no variant)
        """
        insp_type = (inspection_type or "PDI").upper()
        v_id = variant_id or (getattr(vehicle_unit, "variant_id", None) if vehicle_unit else None)
        m_id = vehicle_model_id or (getattr(vehicle_unit, "vehicle_model_id", None) if vehicle_unit else None)

        if v_id:
            tmpl = cls.objects.filter(is_active=True, inspection_type=insp_type, variant_id=v_id).order_by("-version_no", "-id").first()
            if tmpl:
                return tmpl

        if m_id:
            tmpl = cls.objects.filter(is_active=True, inspection_type=insp_type, vehicle_model_id=m_id, variant__isnull=True).order_by("-version_no", "-id").first()
            if tmpl:
                return tmpl

        tmpl = cls.objects.filter(is_active=True, inspection_type=insp_type, vehicle_model__isnull=True, variant__isnull=True).order_by("-version_no", "-id").first()
        if tmpl:
            return tmpl

        return cls.objects.filter(is_active=True, inspection_type=insp_type).order_by("-version_no", "-id").first()


class PDIChecklistItem(models.Model):
    """One master checklist row belonging to a template version."""

    SECTION_TOOLS = "TOOLS_AND_EQUIPMENT"
    SECTION_FUNCTIONALITY = "FUNCTIONALITY"
    SECTION_APPEARANCE = "APPEARANCE_AND_CONDITION"
    SECTION_CHOICES = [
        (SECTION_TOOLS, "Tools & Equipment"),
        (SECTION_FUNCTIONALITY, "Functionality"),
        (SECTION_APPEARANCE, "Appearance & Condition"),
    ]
    SUB_INTERIOR = "INTERIOR_CLEANLINESS"
    SUB_EXTERIOR = "EXTERIOR_BODY_PARTS"
    SUB_SECTION_CHOICES = [
        (SUB_INTERIOR, "Interior Cleanliness"),
        (SUB_EXTERIOR, "Exterior Body Parts"),
    ]

    template = models.ForeignKey(
        PDITemplate, on_delete=models.CASCADE, related_name="items"
    )
    section = models.CharField(max_length=30, choices=SECTION_CHOICES, db_index=True)
    sub_section = models.CharField(
        max_length=30, choices=SUB_SECTION_CHOICES, null=True, blank=True
    )
    label = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["template", "sort_order", "id"]

    def __str__(self):
        return f"v{self.template.version_no} · {self.label}"


class PDISequence(models.Model):
    """Yearly counter backing auto-generated inspection numbers (PDI-YYYY-NNNNNN or VEI-YYYY-NNNNNN)."""

    sequence_type = models.CharField(max_length=10, default="PDI", db_index=True)
    year = models.PositiveIntegerField()
    last_seq = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sequence_type", "year"],
                name="uniq_pdisequence_type_year",
            )
        ]

    def __str__(self):
        return f"{self.sequence_type}-{self.year}: {self.last_seq}"

    @classmethod
    def next_inspection_no(cls, inspection_type="PDI"):
        year = timezone.localdate().year
        seq_type = (inspection_type or "PDI").upper()
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                sequence_type=seq_type, year=year
            )
            seq.last_seq += 1
            seq.save(update_fields=["last_seq"])
            return f"{seq_type}-{year}-{seq.last_seq:06d}"

    @classmethod
    def next_pdi_no(cls):
        return cls.next_inspection_no("PDI")


class PDIInspection(AuditTrackedModel):
    """One inspection attempt for one vehicle (draft → completed → locked)."""

    class InspectionType(models.TextChoices):
        VEI = "VEI", "Vehicle Entry Inspection"
        PDI = "PDI", "Pre-Delivery Inspection"

    class InspectionStatus(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        COMPLETED = "COMPLETED", "Completed"
        LOCKED = "LOCKED", "Locked"

    OPEN_STATUSES = [
        InspectionStatus.DRAFT,
        InspectionStatus.SUBMITTED,
    ]

    inspection_type = models.CharField(
        max_length=10,
        choices=InspectionType.choices,
        default=InspectionType.PDI,
        db_index=True,
    )
    pdi_no = models.CharField(max_length=20, unique=True, blank=True)
    vehicle = models.ForeignKey(
        VehicleUnit, on_delete=models.CASCADE, related_name="pdi_inspections"
    )
    template = models.ForeignKey(
        PDITemplate, on_delete=models.PROTECT, related_name="inspections"
    )
    import_batch = models.ForeignKey(
        "ImportBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inspections",
        help_text="Import batch or shipment this unit arrived in",
    )
    inspection_date = models.DateField(default=timezone.localdate)

    # Vehicle snapshots at inspection time (header fields of the paper form).
    ev_company_name = models.CharField(
        max_length=200,
        default="EV OS",
        blank=True,
    )
    vin_chassis_no = models.CharField(max_length=100, blank=True)
    model_snapshot = models.CharField(max_length=200, blank=True)
    battery_power_snapshot = models.CharField(max_length=50, blank=True)
    motor_power_snapshot = models.CharField(max_length=50, blank=True)
    motor_no_snapshot = models.CharField(max_length=100, blank=True)
    manufacture_date_snapshot = models.DateField(null=True, blank=True)
    color_snapshot = models.CharField(max_length=60, blank=True)
    odometer_km_snapshot = models.PositiveIntegerField(default=0)

    overall_rating = models.CharField(
        max_length=20, choices=OverallRating.choices, null=True, blank=True
    )
    checked_by = models.CharField(max_length=200, blank=True)
    checked_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pdi_inspections",
    )
    status = models.CharField(
        max_length=20,
        choices=InspectionStatus.choices,
        default=InspectionStatus.DRAFT,
        db_index=True,
    )
    signature = models.ImageField(
        upload_to="pdi/signatures/", null=True, blank=True, storage=private_storage
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-inspection_date", "-id"]
        permissions = [
            ("reopen_pdiinspection", "Can reopen completed/locked inspection"),
            ("complete_pdiinspection", "Can complete inspection"),
            ("print_pdiinspection", "Can print inspection report"),
        ]

    def __str__(self):
        return f"{self.pdi_no or 'unsaved inspection'} — {self.vehicle.vin_chassis_no}"

    def save(self, *args, **kwargs):
        if not self.pdi_no:
            self.pdi_no = PDISequence.next_inspection_no(self.inspection_type or "PDI")
        if not self.import_batch_id and self.vehicle_id and getattr(self.vehicle, "import_batch_id", None):
            self.import_batch = self.vehicle.import_batch
        super().save(*args, **kwargs)

    @property
    def signature_url(self):
        if self.signature and self.pk:
            return f"/api/inventory/pdi/{self.pk}/signature/"
        return ""

    @property
    def is_locked(self):
        return self.status != self.InspectionStatus.DRAFT

    @property
    def not_ok_count(self):
        return self.results.filter(result=CheckResult.NOT_OK).count()

    @property
    def open_issues_count(self):
        return self.issues.filter(resolved=False).count()

    def sync_issues_from_results(self):
        """Open an issue for each Not OK item, and close it when that item is no longer Not OK."""
        not_ok_ids = set()
        for res in self.results.filter(result=CheckResult.NOT_OK).select_related("item"):
            not_ok_ids.add(res.item_id)
            label = res.label_snapshot or (res.item.label if res.item_id else "Checklist item")
            desc = res.remark or f"Defect reported: {label}"
            issue = self.issues.filter(item_id=res.item_id).order_by("resolved", "-id").first()
            if not issue:
                InspectionIssue.objects.create(
                    inspection=self,
                    item=res.item,
                    result=res,
                    description=desc,
                )
                continue
            # A person resolved this while the item is still Not OK — leave it closed.
            if issue.resolved and issue.resolved_by_id:
                continue
            fields = []
            if issue.resolved:
                issue.resolved = False
                issue.resolved_by = None
                issue.resolved_at = None
                issue.resolution_notes = ""
                fields += ["resolved", "resolved_by", "resolved_at", "resolution_notes"]
            if issue.result_id != res.id:
                issue.result = res
                fields.append("result")
            if issue.description != desc:
                issue.description = desc
                fields.append("description")
            if fields:
                fields.append("updated_at")
                issue.save(update_fields=fields)

        now = timezone.now()
        for issue in self.issues.filter(resolved=False).exclude(item_id__in=not_ok_ids):
            if not issue.item_id:
                continue
            issue.resolved = True
            issue.resolved_at = now
            if not issue.resolution_notes:
                issue.resolution_notes = "Checklist item marked OK"
            issue.save(update_fields=["resolved", "resolved_at", "resolution_notes", "updated_at"])

    def compute_vehicle_target(self):
        """FAILED when rating is Poor or any item is Not OK, else PASSED."""
        if self.overall_rating == OverallRating.POOR or self.not_ok_count:
            return VehicleUnit.Status.PDI_FAILED
        return VehicleUnit.Status.PDI_PASSED


class PDIResult(models.Model):
    """One checklist answer inside a PDI inspection (label snapshotted)."""

    inspection = models.ForeignKey(
        PDIInspection, on_delete=models.CASCADE, related_name="results"
    )
    item = models.ForeignKey(
        PDIChecklistItem, on_delete=models.PROTECT, related_name="+"
    )
    label_snapshot = models.CharField(max_length=255, blank=True)
    section_snapshot = models.CharField(max_length=30, blank=True)
    sub_section_snapshot = models.CharField(max_length=30, blank=True)
    result = models.CharField(
        max_length=10, choices=CheckResult.choices, default=CheckResult.NA
    )
    remark = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to="pdi/photos/",
        null=True,
        blank=True,
        validators=[validate_inspection_image],
        storage=private_storage,
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["inspection", "item"], name="uniq_pdi_result"
            )
        ]

    def __str__(self):
        return f"{self.inspection.pdi_no} · {self.label_snapshot or self.item_id}"

    @property
    def photo_src(self):
        if self.photo and self.pk and self.inspection_id and self.item_id:
            return f"/api/inventory/pdi/{self.inspection_id}/results/{self.item_id}/photo/"
        return ""


class InspectionPhoto(models.Model):
    """General photo attached to an inspection attempt."""

    inspection = models.ForeignKey(
        PDIInspection, on_delete=models.CASCADE, related_name="general_photos"
    )
    photo = models.ImageField(
        upload_to="pdi/general_photos/",
        validators=[validate_inspection_image],
        storage=private_storage,
    )
    caption = models.CharField(max_length=255, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"Photo for {self.inspection.pdi_no} ({self.caption or 'Untitled'})"

    @property
    def photo_url(self):
        if self.photo and self.pk and self.inspection_id:
            return f"/api/inventory/pdi/{self.inspection_id}/photos/{self.pk}/view/"
        return ""


class InspectionIssue(AuditTrackedModel):
    """An open or resolved defect recorded during an inspection."""

    inspection = models.ForeignKey(
        PDIInspection, on_delete=models.CASCADE, related_name="issues"
    )
    item = models.ForeignKey(
        PDIChecklistItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    result = models.ForeignKey(
        PDIResult,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    description = models.TextField()
    resolved = models.BooleanField(default=False, db_index=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_inspection_issues",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["resolved", "-created_at"]
        permissions = [
            ("resolve_inspectionissue", "Can resolve inspection issue"),
        ]

    def __str__(self):
        status = "Resolved" if self.resolved else "Open"
        return f"[{status}] {self.inspection.pdi_no}: {self.description[:40]}"

    def resolve(self, user, notes=""):
        self.resolved = True
        self.resolved_by = user
        self.resolved_at = timezone.now()
        if notes:
            self.resolution_notes = notes
        self.save(update_fields=["resolved", "resolved_by", "resolved_at", "resolution_notes", "updated_at"])


class ConditionReport(AuditTrackedModel):
    """Standalone full condition report (independent from the PDI record)."""

    class ReportType(models.TextChoices):
        PRE_DELIVERY = "PRE_DELIVERY", "Pre-Delivery"
        AT_DELIVERY = "AT_DELIVERY", "At Delivery"
        SERVICE = "SERVICE", "Service"
        RESALE_INSPECTION = "RESALE_INSPECTION", "Resale Inspection"

    vehicle = models.ForeignKey(
        VehicleUnit, on_delete=models.CASCADE, related_name="condition_reports"
    )
    template = models.ForeignKey(
        PDITemplate, on_delete=models.PROTECT, related_name="condition_reports"
    )
    report_type = models.CharField(
        max_length=20, choices=ReportType.choices, db_index=True
    )
    report_date = models.DateField(default=timezone.localdate)
    odometer_km = models.PositiveIntegerField(default=0)
    overall_rating = models.CharField(
        max_length=20, choices=OverallRating.choices, null=True, blank=True
    )
    inspected_by = models.CharField(max_length=200, blank=True)
    inspected_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="condition_reports",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-report_date", "-id"]

    def __str__(self):
        return (
            f"{self.get_report_type_display()} — "
            f"{self.vehicle.vin_chassis_no} ({self.report_date})"
        )


class ConditionResult(models.Model):
    """One checklist answer inside a condition report."""

    report = models.ForeignKey(
        ConditionReport, on_delete=models.CASCADE, related_name="results"
    )
    item = models.ForeignKey(
        PDIChecklistItem, on_delete=models.PROTECT, related_name="+"
    )
    label_snapshot = models.CharField(max_length=255, blank=True)
    section_snapshot = models.CharField(max_length=30, blank=True)
    sub_section_snapshot = models.CharField(max_length=30, blank=True)
    result = models.CharField(
        max_length=10, choices=CheckResult.choices, default=CheckResult.NA
    )
    remark = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to="condition/photos/", null=True, blank=True, storage=private_storage
    )

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["report", "item"], name="uniq_condition_result"
            )
        ]

    def __str__(self):
        return f"Report #{self.report_id} · {self.label_snapshot or self.item_id}"

    @property
    def photo_src(self):
        if self.photo and self.pk and self.report_id and self.item_id:
            return f"/api/inventory/condition-reports/{self.report_id}/results/{self.item_id}/photo/"
        return ""


class ConditionPhoto(models.Model):
    """Gallery photo for overall vehicle condition (front/back/sides/...)."""

    report = models.ForeignKey(
        ConditionReport, on_delete=models.CASCADE, related_name="photos"
    )
    image = models.ImageField(
        upload_to="condition/gallery/", storage=private_storage
    )
    caption = models.CharField(max_length=120, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"Report #{self.report_id} · {self.caption or 'photo'}"

    @property
    def image_src(self):
        if self.image and self.pk and self.report_id:
            return f"/api/inventory/condition-reports/{self.report_id}/photos/{self.pk}/view/"
        return ""


class VehicleReceiveCheckList(models.Model):
    """Vehicle condition checklist at intake — workshop service receive or legacy yard arrival.

    Replicates the physical receive form and Tool Kit Bag sheet. When ``service_record`` is set,
    this documents condition when the vehicle is received for servicing (before VRO release).
    """

    receive_no = models.CharField(max_length=30, unique=True, blank=True)
    vehicle = models.ForeignKey(
        VehicleUnit, on_delete=models.CASCADE, related_name="receive_checklists"
    )
    service_record = models.ForeignKey(
        "servicing.ServiceRecord",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="receive_checklists",
    )
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receive_checklists",
    )
    receive_date = models.DateField(default=timezone.localdate)
    driver_name = models.CharField(max_length=150, blank=True)
    driver_contact = models.CharField(max_length=50, blank=True)
    driver_signature = models.CharField(max_length=150, blank=True)
    rep_signature = models.CharField(max_length=150, blank=True)
    ev_company = models.CharField(
        max_length=200,
        default="EV OS, Your Address, Your City | +1 555 0100",
        blank=True,
    )
    vehicle_run_km = models.PositiveIntegerField(default=0)
    ev_seater = models.CharField(max_length=50, blank=True)
    battery_power_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    ev_charge_percent = models.PositiveIntegerField(default=100)
    vehicle_color = models.CharField(max_length=60, blank=True)
    vehicle_parked_yard = models.CharField(max_length=150, blank=True)
    any_other_information = models.TextField(
        blank=True,
        help_text="e.g. Key lost at china port so ignition key made directly ONN through negative screw driver.",
    )
    legend_notes = models.TextField(
        blank=True,
        default="N/C = Not Checked due to display not gets ONN so, N/A = Not Available, N/W = Not Working, N/P = Not Provided, OK = Working well functionality",
    )
    entity_conditions = models.JSONField(default=list, blank=True)
    toolkit_items = models.JSONField(default=list, blank=True)
    overall_status = models.CharField(max_length=20, default="ACCEPTED")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="receive_checklists",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-receive_date", "-id"]

    def __str__(self):
        return f"{self.receive_no or 'RCV'} — {self.vehicle.vin_chassis_no}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.receive_no:
            year = timezone.localdate().year
            self.receive_no = f"RCV-{year}-{self.pk:04d}"
            super().save(update_fields=["receive_no"])


class Sale(models.Model):
    """A sale contract / ownership record for a vehicle unit.

    Supports ownership history: a unit can have several Sales over time (resale).
    The latest active sale (is_current=True) defines the unit's current owner.
    """

    unit = models.ForeignKey(
        VehicleUnit,
        on_delete=models.CASCADE,
        related_name="sales",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.PROTECT,
        related_name="sales",
    )
    quotation = models.ForeignKey(
        "crm.Quotation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    variant = models.ForeignKey(
        "VehicleVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
        help_text="Vehicle variant sold. Mirrors the unit's variant at time of sale.",
    )
    sale_date = models.DateField(default=timezone.localdate)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_mode = models.CharField(
        max_length=30, choices=PaymentMode.choices, default=PaymentMode.CASH
    )
    bank = models.CharField(max_length=150, blank=True)
    down_payment = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    loan_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    tenure = models.PositiveIntegerField(
        null=True, blank=True, help_text="Tenure in months"
    )
    interest = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    emi = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    tax_invoice_no = models.CharField(max_length=100, blank=True)
    receipt_no = models.CharField(max_length=100, blank=True)
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    salesperson = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_recorded",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_created",
        help_text="User who created this sale record.",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_updated",
        help_text="User who last updated this sale record.",
    )

    @property
    def created_by_name(self) -> str:
        if self.created_by:
            return self.created_by.get_full_name() or self.created_by.username
        return "System / legacy"

    @property
    def updated_by_name(self) -> str:
        if self.updated_by:
            return self.updated_by.get_full_name() or self.updated_by.username
        return "System / legacy"
    finance_status = models.CharField(
        max_length=30,
        choices=FinanceStatus.choices,
        default=FinanceStatus.NOT_APPLICABLE,
        help_text="Finance approval status for this sale.",
    )
    warranty_end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Manual warranty end date override. If blank, follows model configuration.",
    )
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CANCELLED = "CANCELLED", "Cancelled"

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_sales",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    salesperson_name = models.CharField(max_length=150, blank=True, default="")
    notes = models.TextField(blank=True)
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        ImportJob,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_sales",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    is_current = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-sale_date", "-id"]
        permissions = [
            ("cancel_sale", "Can cancel vehicle sales"),
        ]

    def __str__(self):
        return f"Sale: {self.unit.vin_chassis_no} to {self.customer.name} ({self.sale_date})"

    def clean(self):
        super().clean()
        if self.unit_id and not self.variant_id and getattr(self.unit, "variant_id", None):
            self.variant_id = self.unit.variant_id
        if self.variant_id and self.unit_id and self.unit.vehicle_model_id:
            if self.variant.vehicle_model_id != self.unit.vehicle_model_id:
                raise ValidationError({"variant": "Selected variant does not belong to the vehicle unit's model."})

    def save(self, *args, **kwargs):
        if not self.variant_id and self.unit_id and getattr(self.unit, "variant_id", None):
            self.variant_id = self.unit.variant_id
        with transaction.atomic():
            super().save(*args, **kwargs)
            if self.is_current:
                Sale.objects.filter(unit=self.unit).exclude(pk=self.pk).update(is_current=False)

    def delete(self, *args, **kwargs):
        raise ValidationError("Sale records cannot be deleted. Cancel the sale instead.")
