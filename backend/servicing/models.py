from datetime import datetime, time
import logging
from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import AuditTrackedModel
from common.storage import private_storage
from inventory.models import validate_inspection_image

logger = logging.getLogger(__name__)


class ServiceRecord(AuditTrackedModel):
    """Vehicle Repair Order (VRO) / workshop service visit for a vehicle.

    Replicates the physical Vehicle Repair Order form from EV OS
    Interlinks with physical VehicleUnits, CRM Leads, and Customers.
    """

    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        IN_PROGRESS = "in_progress", "In Progress"
        WAITING_FOR_PARTS = "waiting_for_parts", "Waiting for Parts"
        COMPLETED = "completed", "Completed"
        DELIVERED = "delivered", "Delivered"

    vro_no = models.CharField(max_length=30, unique=True, blank=True)
    is_external = models.BooleanField(
        default=False,
        help_text="True for vehicles not sold by your company (serviced as external vehicles)",
    )
    chassis_number = models.CharField(max_length=100, db_index=True)
    vehicle_unit = models.ForeignKey(
        "inventory.VehicleUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records",
    )
    vehicle = models.ForeignKey(
        "vehicles.Vehicle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records",
    )
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records",
    )
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records",
    )
    dealer_name = models.CharField(max_length=150, blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.RECEIVED, db_index=True
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="service_records_handled",
    )

    # Time tracking & timestamps
    date_received = models.DateField(default=timezone.localdate)
    time_received = models.CharField(
        max_length=20, blank=True, help_text="e.g. 10:30 AM"
    )
    date_completed = models.DateField(null=True, blank=True)
    actual_delivered_at = models.DateTimeField(
        null=True, blank=True, help_text="Timestamp when vehicle exited servicing"
    )

    # Vehicle specs & registration (read-only snapshots copied from unit)
    v_reg_no = models.CharField(
        max_length=50, blank=True, help_text="Vehicle registration / license plate number"
    )
    battery_kw = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    motor_no = models.CharField(max_length=100, blank=True)
    date_of_sale = models.DateField(null=True, blank=True)
    ev_company = models.CharField(
        max_length=150, default="EV OS", blank=True
    )

    # Customer info snapshot (read-only snapshots copied from customer)
    customer_name = models.CharField(max_length=200, blank=True)
    customer_address = models.CharField(max_length=300, blank=True)
    customer_mobile = models.CharField(max_length=50, blank=True)

    # Costs & Estimates
    estimated_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, help_text="Estimated cost of labour and parts"
    )
    labour_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    parts_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )

    # Work description
    job_description = models.TextField(blank=True)
    action_taken = models.TextField(blank=True)
    service_notes = models.TextField(blank=True)
    odometer_reading = models.PositiveIntegerField(null=True, blank=True)

    # Vehicle accessories entry inventory checklist
    # Stores 11 items: service_book, toolkit, spare_wheel, jack_and_handel, mats, mud_flaps, stereo, clocks, wheel_caps, idol, others
    entry_inventory = models.JSONField(default=dict, blank=True)

    # Staff & Undertaking
    service_advisor = models.CharField(max_length=150, blank=True)
    work_forwarded_to = models.CharField(max_length=150, blank=True)
    customer_undertaking_agreed = models.BooleanField(
        default=True,
        help_text="I hereby authorize you to undertake repairs/testing of my vehicle and agree to the conditions",
    )
    customer_signature = models.CharField(max_length=150, blank=True)

    job_type = models.CharField(max_length=100, blank=True, default="")
    technician_name = models.CharField(max_length=150, blank=True, default="")
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        "inventory.ImportJob",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_services",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_received", "-id"]

    def __str__(self):
        return f"{self.vro_no or 'VRO'}: {self.chassis_number} ({self.get_status_display()})"

    def populate_snapshots(self):
        """Populate snapshot fields from linked VehicleUnit and Customer."""
        if self.vehicle_unit:
            unit = self.vehicle_unit
            if not self.chassis_number:
                self.chassis_number = unit.vin_chassis_no
            if not self.motor_no and unit.motor_no:
                self.motor_no = unit.motor_no
            if self.battery_kw is None and unit.effective_battery_kw is not None:
                self.battery_kw = unit.effective_battery_kw
            if not self.v_reg_no and unit.registration_no:
                self.v_reg_no = unit.registration_no
            if not self.date_of_sale and unit.sold_date:
                self.date_of_sale = unit.sold_date

        if self.customer:
            cust = self.customer
            if not self.customer_name:
                self.customer_name = cust.name
            if not self.customer_mobile and cust.phone:
                self.customer_mobile = cust.phone
            if not self.customer_address and cust.location:
                self.customer_address = cust.location

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if is_new:
            self.populate_snapshots()
        super().save(*args, **kwargs)
        if not self.vro_no:
            year = timezone.localdate().year
            self.vro_no = f"VRO-{year}-{self.pk:04d}"
            super().save(update_fields=["vro_no"])

    @property
    def total_cost(self):
        parts_total = sum((p.total_cost for p in self.parts.all()), start=0)
        return float(self.labour_cost or 0) + float(self.parts_cost or 0 or parts_total)

    @property
    def duration_display(self):
        """Calculate human-readable duration spent in servicing."""
        if not self.date_received:
            return "—"
        try:
            start_dt = datetime.combine(self.date_received, time(9, 0))
            if self.time_received:
                # Try parsing time e.g. "10:30 AM" or "10:30"
                t_str = self.time_received.strip().upper()
                for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
                    try:
                        parsed_t = datetime.strptime(t_str, fmt).time()
                        start_dt = datetime.combine(self.date_received, parsed_t)
                        break
                    except ValueError:
                        pass
            end_dt = self.actual_delivered_at
            if not end_dt and self.date_completed:
                end_dt = datetime.combine(self.date_completed, time(17, 0))
            if not end_dt:
                if self.status in [self.Status.COMPLETED, self.Status.DELIVERED]:
                    end_dt = self.updated_at.replace(tzinfo=None) if self.updated_at else datetime.now()
                else:
                    return "In Progress"

            if hasattr(end_dt, "tzinfo") and end_dt.tzinfo:
                end_dt = end_dt.replace(tzinfo=None)

            delta = end_dt - start_dt
            if delta.total_seconds() < 0:
                return "1 hour"
            days = delta.days
            hours = int((delta.seconds % 86400) // 3600)
            minutes = int((delta.seconds % 3600) // 60)

            parts = []
            if days > 0:
                parts.append(f"{days} day{'s' if days > 1 else ''}")
            if hours > 0:
                parts.append(f"{hours} hr{'s' if hours > 1 else ''}")
            if minutes > 0 and days == 0:
                parts.append(f"{minutes} min{'s' if minutes > 1 else ''}")
            return " ".join(parts) if parts else "Under 1 hr"
        except Exception as exc:
            logger.debug("Failed to calculate duration_display: %s", exc)
            return "N/A"

    def save(self, *args, **kwargs):
        # Auto-generate VRO number if empty
        if not self.vro_no:
            year = timezone.localdate().year
            count = ServiceRecord.objects.filter(vro_no__startswith=f"VRO-{year}").count() + 1
            self.vro_no = f"VRO-{year}-{count:04d}"

        # Try to resolve vehicle_unit and CRM customer/lead if not linked
        if not self.vehicle_unit_id and self.chassis_number:
            from inventory.models import VehicleUnit
            unit = VehicleUnit.objects.filter(vin_chassis_no__iexact=self.chassis_number.strip()).first()
            if unit:
                self.vehicle_unit = unit

        if self.vehicle_unit:
            unit = self.vehicle_unit
            if not self.chassis_number:
                self.chassis_number = unit.vin_chassis_no
            if not self.customer_id and unit.customer_id:
                self.customer = unit.customer
            if not self.lead_id and unit.lead_id:
                self.lead = unit.lead
            if not self.customer_name:
                self.customer_name = unit.customer_name or (self.customer.name if self.customer else "") or (self.lead.resolved_name if self.lead else "")
            if not self.customer_mobile:
                self.customer_mobile = (self.customer.phone if self.customer else "") or (self.lead.phone if self.lead else "")
            if not self.customer_address:
                self.customer_address = (self.customer.location if self.customer else "") or (self.lead.address if self.lead else "")
            if not self.date_of_sale and unit.sold_date:
                self.date_of_sale = unit.sold_date
            if not self.motor_no and unit.motor_no:
                self.motor_no = unit.motor_no
            if not self.battery_kw and unit.effective_battery_kw:
                self.battery_kw = unit.effective_battery_kw

        # Ensure cross-linking between customer and lead if one is known
        if self.customer and not self.lead_id and self.customer.lead_id:
            self.lead = self.customer.lead
        # Auto-set actual_delivered_at if moved to DELIVERED and not set
        if self.status == self.Status.DELIVERED and not self.actual_delivered_at:
            self.actual_delivered_at = timezone.now()
            if not self.date_completed:
                self.date_completed = timezone.localdate()

        super().save(*args, **kwargs)

        # Auto-log CRM activity on Customer & Lead when completed or delivered.
        # Historical imports must not appear in the activity feed.
        if (
            self.source != "historical import"
            and self.status in [self.Status.COMPLETED, self.Status.DELIVERED]
            and (self.customer or self.lead)
        ):
            try:
                from crm.models import Activity

                act_subj = f"Servicing {self.get_status_display()}: {self.vro_no}"
                if not Activity.objects.filter(subject=act_subj).exists():
                    v_name = getattr(self, "vehicle_model_name", None) or (
                        str(self.vehicle_unit.vehicle_model) if self.vehicle_unit and self.vehicle_unit.vehicle_model else ""
                    )
                    Activity.objects.create(
                        customer=self.customer,
                        lead=self.lead,
                        type=Activity.Type.NOTE,
                        subject=act_subj,
                        description=(
                            f"VRO #{self.vro_no} for vehicle {self.chassis_number} ({v_name}). "
                            f"Duration: {self.duration_display}. Total cost: NPR {self.total_cost:,.0f}."
                        ),
                        user_name="Workshop Service",
                    )
                if self.customer:
                    self.customer.last_activity = timezone.now()
                    self.customer.save(update_fields=["last_activity", "updated_at"])
            except Exception as exc:
                logger.exception("Failed to auto-log CRM activity for service record %s: %s", self.vro_no, exc)


class ServiceRecordPart(AuditTrackedModel):
    """One changed part on a service visit (queryable child table, not a blob)."""

    record = models.ForeignKey(
        ServiceRecord, related_name="parts", on_delete=models.CASCADE
    )
    part_name = models.CharField(max_length=200)
    part_number = models.CharField(max_length=100, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    labour_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.part_name} x{self.quantity} ({self.record.chassis_number})"

    @property
    def total_cost(self):
        return float(self.cost or 0) * (self.quantity or 1)


ENTRY_CHECKLIST_KEYS = (
    "service_book",
    "toolkit",
    "spare_wheel",
    "jack_and_handel",
    "mats",
    "mud_flaps",
    "stereo",
    "clocks",
    "wheel_caps",
    "idol",
    "others",
)


class ServiceEntryImage(models.Model):
    """Photo attached to one vehicle-entry checklist item on a repair order."""

    record = models.ForeignKey(
        ServiceRecord, related_name="entry_images", on_delete=models.CASCADE
    )
    item_key = models.CharField(max_length=50)
    image = models.ImageField(
        upload_to="servicing/entry/",
        storage=private_storage,
        validators=[validate_inspection_image],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["record", "item_key"], name="uniq_service_entry_image"
            )
        ]

    def __str__(self):
        return f"{self.record_id} · {self.item_key}"

    @property
    def image_src(self):
        if self.image and self.pk and self.record_id:
            return f"/api/servicing/records/{self.record_id}/entry-images/{self.item_key}/"
        return ""
