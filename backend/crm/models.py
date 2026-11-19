import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from common.models import AuditTrackedModel
from common.storage import private_storage


class LeadSource(models.Model):
    """Dynamically managed lead sources.

    The dropdowns on the Leads page read from this table (via ``/api/crm/meta/``),
    so sources added here immediately show up in the lead source dropdown.
    ``Lead.source`` stores the source *name* as a plain string — deactivating or
    renaming a row here only affects new/filter dropdowns, never historical leads.
    """

    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Lead Source"
        verbose_name_plural = "Lead Sources"

    def __str__(self):
        return self.name


class ActivityType(models.Model):
    """Dynamically managed activity types.

    The Add Activity form's type dropdown reads from this table (via
    ``/api/crm/meta/``), so types added here immediately show up in the
    dropdown. ``Activity.type`` stores the type *name* as a plain string —
    deactivating or renaming a row here only affects new/filter dropdowns,
    never historical activities.
    """

    name = models.CharField(max_length=50, unique=True)
    label = models.CharField(
        max_length=100,
        blank=True,
        help_text="Display label shown in dropdowns. Defaults to the name.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Activity Type"
        verbose_name_plural = "Activity Types"

    def __str__(self):
        return self.label or self.name


class Bank(models.Model):
    """Banks and financial institutions used on quotations.

    The quotation form's bank dropdown reads from this table. ``Quotation.bank_name``
    stores the chosen name as text, so renaming a row only affects new selections.
    """

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Nepal Rastra Bank institution code, when known.",
    )
    category = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Bank"
        verbose_name_plural = "Banks"
        constraints = [
            models.UniqueConstraint(
                fields=["code"],
                condition=~models.Q(code=""),
                name="uniq_bank_code",
            ),
        ]

    def __str__(self):
        return self.name


class BankBranch(models.Model):
    """Branch of a bank, shown in the quotation bank-branch dropdown."""

    bank = models.ForeignKey(Bank, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, blank=True, default="")
    address = models.CharField(max_length=400, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        verbose_name = "Bank Branch"
        verbose_name_plural = "Bank Branches"
        constraints = [
            models.UniqueConstraint(
                fields=["bank", "code"],
                condition=~models.Q(code=""),
                name="uniq_bank_branch_code",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.bank})"


class Lead(AuditTrackedModel):
    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUALIFIED = "qualified", "Qualified"
        CONVERTED = "converted", "Converted"
        LOST = "lost", "Lost"

    class Source(models.TextChoices):
        WEBSITE = "Website", "Website"
        BOOK_TEST_DRIVE = "Book Test Drive", "Book Test Drive"
        REQUEST_QUOTE = "Request Quote", "Request Quote"
        VEHICLE_ENQUIRY = "Vehicle Enquiry", "Vehicle Enquiry"
        FACEBOOK = "Facebook", "Facebook"
        INSTAGRAM = "Instagram", "Instagram"
        GOOGLE = "Google", "Google"
        PHONE = "Phone", "Phone"
        WALK_IN = "Walk-in", "Walk-in"
        REFERRAL = "Referral", "Referral"
        DEALER = "Dealer", "Dealer"
        EVENT = "Event", "Event"
        OTHER = "Other", "Other"

    name = models.CharField(max_length=200, blank=True, default="")
    first_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100, blank=True, default="")
    company = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=300, blank=True)
    province = models.CharField(max_length=50, blank=True)
    district = models.CharField(max_length=100, blank=True)
    vehicle = models.CharField(max_length=100, blank=True, help_text="Interested vehicle model name")
    vehicle_model = models.ForeignKey(
        "inventory.VehicleModel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
        help_text="Structured vehicle model interest (optional, supplements the vehicle text field).",
    )
    variant = models.ForeignKey(
        "inventory.VehicleVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
        help_text="Specific variant the lead is interested in.",
    )
    interest_level = models.ForeignKey(
        "events.InterestLevel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
    )
    # Dynamic — values come from the LeadSource table (no Django choices so the
    # table is the single source of truth for what the dropdown offers).
    source = models.CharField(max_length=100, default=Source.WEBSITE)
    budget = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_leads_created",
    )
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
        db_index=True,
        help_text="Dealership assigned to this lead.",
    )
    created_by_name = models.CharField(max_length=150, blank=True, help_text="Snapshot of salesperson name if not linked to user")
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_activity = models.DateTimeField(default=timezone.now, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Lead"
        verbose_name_plural = "Leads"

    def __str__(self):
        return f"{self.resolved_name} ({self.get_status_display()})"

    @property
    def resolved_name(self):
        if self.name:
            return self.name.strip()
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def full_name(self):
        return self.resolved_name

    @property
    def display_id(self):
        return f"LD-{self.pk:04d}" if self.pk else "LD-—"

    def delete_cascade(self):
        """Hard-delete this lead plus every CRM record that belongs to it.

        Covers records linked through the converted ``Customer`` (one-to-one
        via ``Customer.lead``) *and* records linked to the lead directly
        (TestDrives / Quotations scheduled or created from the lead before
        conversion, which hold ``lead`` FKs). Runs in a single transaction so
        a partial delete can never leave orphans behind. Also clears the
        ``Activity`` trail — activities are historical context for the lead,
        not standalone records worth keeping.

        Callers that already run inside a transaction may call this directly;
        it is safe to nest.
        """
        from django.db import transaction

        with transaction.atomic():
            customer = Customer.objects.filter(lead=self).first()
            if customer is not None:
                # Records linked to the lead directly but already re-pointed
                # at the customer: delete once, via the customer relation.
                customer.test_drives.all().delete()
                customer.quotations.all().delete()
                customer.opportunities.all().delete()
                customer.activities.all().delete()
                customer.delete()
            # Records still attributed to the lead itself (pre-conversion
            # test drives / quotations, and the lead's own activities).
            self.test_drives.all().delete()
            self.quotations.all().delete()
            self.activities.all().delete()
            self.delete()


class Customer(models.Model):
    class Type(models.TextChoices):
        INDIVIDUAL = "Individual", "Individual"
        BUSINESS = "Business", "Business"
        FLEET = "Fleet", "Fleet"
        GOVERNMENT = "Government", "Government"
        NGO = "NGO/INGO", "NGO/INGO"
        DEALER = "Dealer", "Dealer"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    # Link back to the originating lead — leads and customers are linked by
    # the lead id (a one-to-one relation), never by matching emails.
    lead = models.OneToOneField(
        "crm.Lead",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="customer",
    )

    name = models.CharField(max_length=200)
    company = models.CharField(max_length=200, blank=True)
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.INDIVIDUAL)
    phone = models.CharField(max_length=50, blank=True)
    phone_normalized = models.CharField(max_length=20, blank=True, db_index=True)
    pan_vat_number = models.CharField(max_length=50, blank=True, help_text="PAN/VAT number for Business, Fleet, and Government customers")
    contact_person = models.CharField(max_length=150, blank=True, help_text="Contact person name for Business/Fleet/Government")
    email = models.EmailField(blank=True)
    location = models.CharField(max_length=300, blank=True, help_text="e.g. Kathmandu, Bagmati")
    address = models.CharField(max_length=300, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, null=True, default="")
    province = models.CharField(max_length=100, blank=True, null=True, default="")
    vehicles = models.JSONField(default=list, blank=True, help_text="List of vehicle names owned")
    notes = models.TextField(blank=True, help_text="Internal notes about the customer")
    total_purchases = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    source = models.CharField(max_length=50, blank=True, default="")
    import_job = models.ForeignKey(
        "inventory.ImportJob",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_customers",
    )
    is_deleted = models.BooleanField(default=False, db_index=True)
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customers",
        db_index=True,
        help_text="Dealership serving this customer.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_customers_created",
    )
    created_by_name = models.CharField(
        max_length=150,
        blank=True,
        help_text="Snapshot of user name when created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_customers_updated",
    )
    last_activity = models.DateTimeField(default=timezone.now, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def updated_by_name(self) -> str:
        if self.updated_by:
            return self.updated_by.get_full_name() or self.updated_by.username
        return "System / legacy"

    class Meta:
        ordering = ["-last_activity", "-id"]
        verbose_name = "Customer"
        verbose_name_plural = "Customers"

    def __str__(self):
        return f"{self.name} ({self.company})" if self.company else self.name

    @property
    def display_id(self):
        return f"CU-{self.pk:04d}" if self.pk else "CU-0000"

    def save(self, *args, **kwargs):
        from common.phone import normalize_nepal_phone

        self.phone_normalized = normalize_nepal_phone(self.phone)
        if kwargs.get("update_fields") and "phone" in kwargs["update_fields"]:
            fields = set(kwargs["update_fields"])
            fields.add("phone_normalized")
            kwargs["update_fields"] = list(fields)
        super().save(*args, **kwargs)


class Opportunity(models.Model):
    class Stage(models.TextChoices):
        NEW_LEAD = "new_lead", "New Lead"
        CONTACTED = "contacted", "Contacted"
        QUALIFIED = "qualified", "Qualified"
        TEST_DRIVE = "test_drive", "Test Drive"
        QUOTATION = "quotation", "Quotation"
        NEGOTIATION = "negotiation", "Negotiation"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    title = models.CharField(max_length=300)
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opportunities",
    )
    customer_name = models.CharField(max_length=200, blank=True)
    company = models.CharField(max_length=200, blank=True)
    vehicle = models.CharField(max_length=100, blank=True)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.NEW_LEAD, db_index=True)
    value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    probability = models.PositiveSmallIntegerField(default=0, help_text="0–100%")
    close_date = models.DateField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_opportunities_assigned",
    )
    assigned_to_name = models.CharField(max_length=150, blank=True, help_text="Salesperson display name if not linked to user")
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opportunities",
        db_index=True,
        help_text="Dealership handling this opportunity.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_opportunities_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_opportunities_updated",
    )
    last_activity = models.DateTimeField(default=timezone.now, blank=True)
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
        ordering = ["-last_activity", "-id"]
        verbose_name = "Opportunity"
        verbose_name_plural = "Opportunities"

    def __str__(self):
        return f"{self.title} — {self.get_stage_display()}"

    @property
    def display_id(self):
        return f"OP-{self.pk:04d}" if self.pk else "OP-—"

    @property
    def resolved_customer_name(self):
        if self.customer:
            return self.customer.name
        return self.customer_name or "—"

    @property
    def resolved_assigned_to(self):
        if self.assigned_to:
            return self.assigned_to.get_full_name() or self.assigned_to.username
        return self.assigned_to_name or "—"


class TestDrive(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        SCHEDULED = "scheduled", "Scheduled"
        CONFIRMED = "confirmed", "Confirmed"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        NO_SHOW = "no_show", "No Show"

    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="test_drives",
        help_text="Originating lead (set when scheduled from a lead, before conversion).",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="test_drives",
    )
    unit = models.ForeignKey(
        "inventory.VehicleUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="test_drives",
        help_text="Allocated vehicle unit for the test drive.",
    )
    customer_name = models.CharField(max_length=200, blank=True)
    vehicle = models.CharField(max_length=100, blank=True)
    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    salesperson = models.CharField(max_length=150, blank=True)
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="test_drives",
        db_index=True,
        help_text="Dealership conducting the test drive.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_test_drives_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_test_drives_updated",
    )
    location = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED, db_index=True)
    notes = models.TextField(blank=True)
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
        ordering = ["-date", "-id"]
        verbose_name = "Test Drive"
        verbose_name_plural = "Test Drives"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if not self.lead and not self.customer:
            raise ValidationError("A test drive must be linked to either a lead or a customer.")
        if self.unit and self.date and self.time:
            from crm.services.pipeline import check_test_drive_conflict
            conflict = check_test_drive_conflict(
                unit=self.unit,
                date=self.date,
                time=self.time,
                exclude_id=self.pk,
            )
            if conflict:
                raise ValidationError(
                    f"Vehicle unit {self.unit.vin_chassis_no} is already scheduled for a test drive at {conflict.time}."
                )

    def __str__(self):
        name = self.customer.name if self.customer else self.customer_name or "Customer"
        return f"{name}: {self.vehicle} ({self.get_status_display()})"

    @property
    def display_id(self):
        return f"TD-{self.pk:04d}" if self.pk else "TD-0000"

    @property
    def resolved_customer_name(self):
        if self.customer:
            return self.customer.name
        return self.customer_name or "N/A"


def catalog_range_for_model(model) -> str:
    """Range text from the matching catalog vehicle (Vehicle Models page)."""
    if model is None:
        return ""
    from vehicles.models import Vehicle

    names = [f"{model.brand} {model.model_name}".strip(), (model.model_name or "").strip()]
    for name in names:
        if not name:
            continue
        vehicle = Vehicle.objects.filter(name__iexact=name).only("range_km").first()
        if vehicle and vehicle.range_km:
            return vehicle.range_km.strip()
    model_name = (model.model_name or "").strip()
    if model_name:
        vehicle = Vehicle.objects.filter(name__icontains=model_name).only("range_km").first()
        if vehicle and vehicle.range_km:
            return vehicle.range_km.strip()
    return ""


class Quotation(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        VIEWED = "viewed", "Viewed"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
        help_text="Originating lead (set when created from a lead, before conversion).",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    customer_name = models.CharField(max_length=200, blank=True)
    company = models.CharField(max_length=200, blank=True)
    vehicle_model = models.ForeignKey(
        "inventory.VehicleModel",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="quotations",
        help_text="Vehicle model from catalog.",
    )
    variant = models.ForeignKey(
        "inventory.VehicleVariant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
        help_text="Selected variant. Required when the model has active variants.",
    )
    unit = models.ForeignKey(
        "inventory.VehicleUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
        help_text="Proposed unit (optional, does NOT reserve the unit).",
    )
    reserved_unit = models.ForeignKey(
        "inventory.VehicleUnit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations_reserved",
        help_text="Reserved vehicle unit for this quotation.",
    )
    reservation_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="UTC timestamp when the unit reservation expires (set by reserve_unit_for_quotation).",
    )
    vehicle = models.CharField(max_length=100, blank=True)
    salesperson = models.CharField(max_length=150, blank=True)
    salesperson_email = models.CharField(max_length=150, blank=True, default="")
    salesperson_phone = models.CharField(max_length=50, blank=True, default="")
    vehicle_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    accessories = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    other_charges = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    valid_until = models.DateField(null=True, blank=True)
    reference_no = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Customer PO or external reference number",
    )
    battery_capacity = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="e.g. CATL, 100.07 kWh",
    )
    vehicle_length = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Cargo length, e.g. 16 FT, 20 FT",
    )
    bank_name = models.CharField(
        max_length=200,
        blank=True,
        default="GLOBAL IME BANK LTD",
        help_text="Bank name printed in the quotation account details.",
    )
    bank_address = models.CharField(
        max_length=200,
        blank=True,
        default="KULESHWOR BRANCH",
        help_text="Bank branch printed in the quotation account details.",
    )
    pan_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Customer PAN / VAT number",
    )
    customer_phone = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Recipient phone number",
    )
    customer_address = models.CharField(
        max_length=300,
        blank=True,
        default="",
        help_text="Recipient address",
    )
    vehicle_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="e.g. 6 Ton Payload with 2 Doors",
    )
    transmission = models.CharField(
        max_length=50,
        blank=True,
        default="Automatic",
        help_text="e.g. Automatic",
    )
    range_km = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="e.g. 275 KM",
    )
    version = models.CharField(
        max_length=100,
        blank=True,
        default="Commercial Electric Truck",
        help_text="e.g. Commercial Electric Truck",
    )
    charger_info = models.CharField(
        max_length=100,
        blank=True,
        default="Support GB/T DC Fast Charger",
        help_text="e.g. Support GB/T DC Fast Charger",
    )
    payment_terms = models.CharField(
        max_length=255,
        blank=True,
        default="40% Down Payment & 60% Bank DO before Dispatch.",
        help_text="Payment terms",
    )
    delivery_terms = models.CharField(
        max_length=255,
        blank=True,
        default="As per Client Requirement.",
        help_text="Delivery terms",
    )
    warranty_terms = models.CharField(
        max_length=255,
        blank=True,
        default="Company Authorized Warranty Terms.",
        help_text="Warranty terms",
    )
    insurance_terms = models.CharField(
        max_length=255,
        blank=True,
        default="1 Year Insurance Included in Offered Price.",
        help_text="Insurance terms",
    )
    registration_terms = models.CharField(
        max_length=255,
        blank=True,
        default="1 Year Registration Included in Offered Price.",
        help_text="Registration terms",
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text="Vehicle quantity",
    )
    notes = models.TextField(blank=True, help_text="Internal notes shown on the quotation")
    extra_specs = models.JSONField(
        default=list,
        blank=True,
        help_text="Extra specification rows added on the quotation, as {label, value} objects.",
    )
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
        db_index=True,
        help_text="Dealership issuing this quotation.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_quotations_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_quotations_updated",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
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
    converted_to_order = models.BooleanField(
        default=False,
        help_text="True once a Sale referencing this quotation is completed.",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="child_revisions",
        help_text="Immediate prior revision of this quotation.",
    )
    root = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="all_revisions",
        help_text="Root (original) quotation in this revision chain.",
    )
    revision_number = models.PositiveIntegerField(
        default=0,
        db_index=True,
        help_text="Revision sequence number: 0 for original, 1 for R1, etc.",
    )
    is_latest = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this is the latest revision in the chain.",
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Quotation"
        verbose_name_plural = "Quotations"
        permissions = [
            ("edit_quotation", "Can edit quotation details in-place"),
            ("revise_quotation", "Can create a new quotation revision"),
        ]
        constraints = [
            # At most one active (non-expired, non-rejected) reservation per unit at a time.
            # Enforced at DB level via a partial unique index.
            models.UniqueConstraint(
                fields=["reserved_unit"],
                condition=~models.Q(reserved_unit=None)
                & ~models.Q(status__in=["rejected", "expired"]),
                name="unique_active_reservation_per_unit",
            )
        ]

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if not self.lead and not self.customer:
            raise ValidationError("A quotation must be linked to either a lead or a customer.")
        if self.vehicle_model_id:
            if self.variant_id:
                if self.variant.vehicle_model_id != self.vehicle_model_id:
                    raise ValidationError({"variant": "Selected variant does not belong to the chosen vehicle model."})
            else:
                if getattr(self.vehicle_model, "has_active_variants", False):
                    raise ValidationError({"variant": "This vehicle model has variants. Please select a variant."})

    def save(self, *args, **kwargs):
        if self.vehicle_model:
            model_str = f"{self.vehicle_model.brand} {self.vehicle_model.model_name}".strip()
            if self.variant_id and self.variant:
                model_str = f"{model_str} · {self.variant.name}".strip()
            if not self.vehicle or self.vehicle != model_str:
                self.vehicle = model_str
            if self.variant_id and self.variant and self.variant.price_override is not None and not self.vehicle_price:
                self.vehicle_price = self.variant.price_override

            # Default specs from vehicle model if not explicitly specified
            model_name_upper = (self.vehicle_model.model_name or "").upper()
            is_6t = "6T" in model_name_upper or "6 TON" in model_name_upper
            is_10t = "10T" in model_name_upper or "10 TON" in model_name_upper

            if not self.vehicle_description:
                if is_6t:
                    self.vehicle_description = "6 Ton Payload with 2 Doors"
                elif is_10t:
                    self.vehicle_description = "10 Ton Payload with 2 Doors"

            if not self.battery_capacity:
                if is_6t:
                    self.battery_capacity = "CATL, 100.07 kWh"
                elif is_10t:
                    self.battery_capacity = "CATL, 164.86 kWh"

            if not self.vehicle_length:
                if is_6t:
                    self.vehicle_length = "16 FT"
                elif is_10t:
                    self.vehicle_length = "20 FT"

            catalog_range = catalog_range_for_model(self.vehicle_model)
            if catalog_range:
                self.range_km = catalog_range
            elif not self.range_km:
                if is_6t:
                    self.range_km = "275 KM"
                elif is_10t:
                    self.range_km = "330 KM"

        # Auto-prefill customer details if empty
        if self.customer:
            if not self.pan_number and getattr(self.customer, "pan_vat_number", ""):
                self.pan_number = self.customer.pan_vat_number
            if not self.customer_phone and getattr(self.customer, "phone", ""):
                self.customer_phone = self.customer.phone
            if not self.customer_address:
                self.customer_address = getattr(self.customer, "address", "") or getattr(self.customer, "location", "")

        if self.lead:
            if not self.customer_phone and getattr(self.lead, "phone", ""):
                self.customer_phone = self.lead.phone
            if not self.customer_address and getattr(self.lead, "address", ""):
                self.customer_address = self.lead.address

        self.salesperson_email = self.resolved_salesperson_email
        self.salesperson_phone = self.resolved_salesperson_phone
        super().save(*args, **kwargs)

    @property
    def amount_in_words(self) -> str:
        total_val = int(round(self.total))
        return self._number_to_nepal_words(total_val)

    @staticmethod
    def _number_to_nepal_words(n: int) -> str:
        if n <= 0:
            return "RUPEES ZERO ONLY /-"
        ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
                'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
                'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
        tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

        def two_digits(num):
            if num < 20:
                return ones[num]
            t, o = divmod(num, 10)
            return tens[t] + ('-' + ones[o] if o else '')

        def three_digits(num):
            h, rem = divmod(num, 100)
            res = []
            if h:
                res.append(ones[h] + ' HUNDRED')
            if rem:
                res.append(two_digits(rem))
            return ' '.join(res)

        crore, rem = divmod(n, 10000000)
        lakh, rem = divmod(rem, 100000)
        thousand, rem = divmod(rem, 1000)
        hundreds = rem

        parts = []
        if crore:
            parts.append(three_digits(crore) + ' CRORE' + ('S' if crore > 1 else ''))
        if lakh:
            parts.append(two_digits(lakh) + ' LAKH' + ('S' if lakh > 1 else ''))
        if thousand:
            parts.append(two_digits(thousand) + ' THOUSAND')
        if hundreds:
            parts.append(three_digits(hundreds))

        return 'RUPEES ' + ' '.join(parts) + ' ONLY /-'

    @property
    def resolved_salesperson_name(self) -> str:
        sp = (self.salesperson or "").strip()
        user = None
        if sp:
            from django.contrib.auth.models import User
            user = User.objects.filter(username__iexact=sp).first()
            if not user:
                parts = sp.split()
                if len(parts) >= 2:
                    user = User.objects.filter(
                        first_name__iexact=parts[0], last_name__iexact=" ".join(parts[1:])
                    ).first()
                if not user and parts:
                    user = User.objects.filter(first_name__iexact=parts[0]).first()
        if user is None and (self.salesperson_email or "").strip():
            from django.contrib.auth.models import User
            user = User.objects.filter(email__iexact=self.salesperson_email.strip()).first()
        if user is not None:
            full = f"{user.first_name} {user.last_name}".strip()
            if full and full.lower() != user.username.lower():
                return full
            employee = getattr(user, "employee", None)
            employee_name = (getattr(employee, "full_name", "") or "").strip()
            if employee_name and employee_name.lower() != user.username.lower():
                return employee_name
            if full:
                return full
        if sp and " " in sp and "." not in sp.split()[0]:
            return sp
        return sp or "VehicleTemplate"

    @property
    def resolved_salesperson_email(self) -> str:
        sp = (self.salesperson or "").strip()
        if sp:
            from django.contrib.auth.models import User
            u = User.objects.filter(username__iexact=sp).first()
            if not u:
                parts = sp.split()
                if len(parts) >= 2:
                    u = User.objects.filter(first_name__iexact=parts[0], last_name__iexact=" ".join(parts[1:])).first()
                if not u and parts:
                    u = User.objects.filter(first_name__iexact=parts[0]).first()
            if u and u.email:
                return u.email
        if self.salesperson_email:
            return self.salesperson_email
        return "info@vehicletemplate.example.com"

    @property
    def resolved_salesperson_phone(self) -> str:
        sp = (self.salesperson or "").strip()
        if sp:
            from django.contrib.auth.models import User
            u = User.objects.filter(username__iexact=sp).first()
            if not u:
                parts = sp.split()
                if len(parts) >= 2:
                    u = User.objects.filter(first_name__iexact=parts[0], last_name__iexact=" ".join(parts[1:])).first()
                if not u and parts:
                    u = User.objects.filter(first_name__iexact=parts[0]).first()
            if u and hasattr(u, "profile") and u.profile and u.profile.dealer and u.profile.dealer.phone:
                return u.profile.dealer.phone
        if self.salesperson_phone:
            return self.salesperson_phone
        return "+977 9765022801"

    def __str__(self):
        name = self.customer.name if self.customer else self.customer_name or "Customer"
        return f"{self.display_id}: {name} ({self.get_status_display()})"

    @property
    def display_id(self):
        base_pk = self.root_id or self.pk
        base_str = f"QT-{base_pk:04d}" if base_pk else "QT-0000"
        return f"{base_str}-R{self.revision_number}" if self.revision_number else base_str

    @property
    def subtotal(self):
        return (self.vehicle_price or 0) + (self.accessories or 0) - (self.discount or 0) + (self.other_charges or 0)

    @property
    def vat_amount(self):
        # Prices are always VAT-inclusive; never add VAT on top of the offered price.
        return 0

    @property
    def total(self):
        return float(self.subtotal)

    @property
    def resolved_customer_name(self):
        if self.customer:
            return self.customer.name
        return self.customer_name or "N/A"


class Activity(models.Model):
    class Type(models.TextChoices):
        CALL = "call", "Call"
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"
        MEETING = "meeting", "Meeting"
        NOTE = "note", "Note"
        TEST_DRIVE = "test_drive", "Test Drive"
        QUOTATION = "quotation", "Quotation"
        STATUS_CHANGE = "status_change", "Status Change"

    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    type = models.CharField(max_length=50, default=Type.NOTE, db_index=True)
    subject = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    datetime = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_activities",
    )
    user_name = models.CharField(max_length=150, blank=True, help_text="Display name if not linked to user")
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
        db_index=True,
        help_text="Dealership context for this activity.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_activities_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_activities_updated",
    )

    created_at = models.DateTimeField(auto_now_add=True)

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
        ordering = ["-datetime", "-id"]
        verbose_name = "Activity"
        verbose_name_plural = "Activities"

    def __str__(self):
        return f"{self.type}: {self.subject}"

    @property
    def resolved_user(self):
        if self.user:
            return self.user.get_full_name() or self.user.username
        if self.user_name and self.user_name.lower() != "system":
            return self.user_name
        if self.lead:
            lead_creator = self.lead.created_by_name or (
                self.lead.created_by.get_full_name() or self.lead.created_by.username
                if self.lead.created_by
                else None
            )
            if lead_creator:
                return lead_creator
        return self.user_name or "System"


class CompanyBranding(models.Model):
    """Company-wide document branding settings (singleton)."""

    letterhead_image = models.FileField(
        upload_to="branding/",
        blank=True,
        null=True,
        help_text="Company letterhead background image (PNG/JPG) or single-page PDF.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="document_brandings_created",
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="document_brandings",
    )

    class Meta:
        verbose_name = "Company Branding"
        verbose_name_plural = "Company Branding"

    def __str__(self):
        return "Company Branding"

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

    @classmethod
    def get_instance(cls):
        instance, _ = cls.objects.get_or_create(pk=1)
        return instance


def validate_document_file(file):
    """Validate document file size (<= 10MB) and format (PDF, JPEG, PNG, WebP)."""
    if not file:
        return
    max_size = 10 * 1024 * 1024  # 10 MB
    if hasattr(file, "size") and file.size and file.size > max_size:
        raise ValidationError("File size cannot exceed 10 MB.")

    content_type = getattr(file, "content_type", "")
    name = getattr(file, "name", "")
    import os

    ext = os.path.splitext(name)[1].lower() if name else ""
    allowed_exts = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
    if ext and ext not in allowed_exts:
        raise ValidationError("Only PDF and image files (JPEG, PNG, WebP) are allowed.")
    if content_type:
        allowed_types = {
            "application/pdf",
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        }
        if content_type.lower() not in allowed_types:
            raise ValidationError("Only PDF and image files are allowed.")


class DocumentTypeMaster(models.Model):
    """Admin-managed document types: Bill of Lading, Commercial Invoice, Packing List, etc."""

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    is_required_for_shipment = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Document(AuditTrackedModel):
    """Uploaded attachments and documents vault."""

    title = models.CharField(max_length=200)
    category = models.CharField(max_length=50, blank=True, default="OTHER")
    document_type_master = models.ForeignKey(
        DocumentTypeMaster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    document_type = models.CharField(max_length=50, blank=True, default="other")
    file = models.FileField(
        upload_to="documents/",
        validators=[validate_document_file],
        storage=private_storage,
    )
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)
    file_size = models.PositiveIntegerField(default=0)
    file_type = models.CharField(max_length=50, blank=True)
    expiry_date = models.DateField(null=True, blank=True, db_index=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_vault_documents",
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

    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    quotation = models.ForeignKey(
        "crm.Quotation",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="documents",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Document"
        verbose_name_plural = "Documents"

    def __str__(self):
        return self.title

    @property
    def name(self):
        return self.title

    def compute_file_hash(self):
        if not self.file:
            return ""
        import hashlib
        h = hashlib.sha256()
        try:
            self.file.seek(0)
            for chunk in self.file.chunks():
                h.update(chunk)
            self.file.seek(0)
            return h.hexdigest()
        except Exception:
            return ""

    def save(self, *args, **kwargs):
        if self.file and not self.file_hash:
            self.file_hash = self.compute_file_hash()
        if self.file and hasattr(self.file, "size") and self.file.size:
            self.file_size = self.file.size
        if not self.category and self.document_type:
            self.category = self.document_type.upper()
        super().save(*args, **kwargs)


class DocumentVersion(models.Model):
    """Archived previous version of a replaced document."""

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="versions"
    )
    version_no = models.PositiveIntegerField(default=1)
    file = models.FileField(
        upload_to="documents/versions/", storage=private_storage
    )
    file_hash = models.CharField(max_length=64, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    file_type = models.CharField(max_length=50, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    change_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-version_no", "-id"]

    def __str__(self):
        return f"{self.document.title} (v{self.version_no})"


class DocumentAttachment(models.Model):
    """Links one document to a shipment, unit, customer, or sale."""

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="attachments"
    )
    shipment = models.ForeignKey(
        "inventory.ImportBatch",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_attachments",
    )
    unit = models.ForeignKey(
        "inventory.VehicleUnit",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_attachments",
    )
    customer = models.ForeignKey(
        "crm.Customer",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_attachments",
    )
    sale = models.ForeignKey(
        "inventory.Sale",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_attachments",
    )
    employee = models.ForeignKey(
        "hrm.Employee",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="document_attachments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        target = self.shipment or self.unit or self.customer or self.sale or self.employee or "none"
        return f"{self.document.title} -> {target}"

