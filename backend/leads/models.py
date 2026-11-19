from django.db import models


class Enquiry(models.Model):
    class EnquiryType(models.TextChoices):
        CONTACT = "contact", "Contact"
        TEST_DRIVE = "test_drive", "Test Drive"
        QUOTE = "quote", "Quote Request"

    class Status(models.TextChoices):
        NEW = "new", "New"
        IN_PROGRESS = "in_progress", "In Progress"
        CLOSED = "closed", "Closed"

    name = models.CharField(max_length=150)
    company = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=30)
    email = models.EmailField()
    vehicle = models.ForeignKey(
        "vehicles.Vehicle",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="enquiries",
    )
    enquiry_type = models.CharField(
        max_length=20,
        choices=EnquiryType.choices,
        default=EnquiryType.CONTACT,
    )
    message = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
    )
    lead = models.ForeignKey(
        "crm.Lead",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="enquiries",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Enquiry"
        verbose_name_plural = "Enquiries"

    def __str__(self):
        return f"{self.name} ({self.enquiry_type})"

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None
        if not is_new:
            old_inst = Enquiry.objects.filter(pk=self.pk).first()
            if old_inst:
                old_status = old_inst.status

        # If lead is not set, auto-create or match CRM Lead
        if not self.lead_id:
            try:
                self.lead = self.sync_to_crm_lead()
            except Exception:
                pass

        super().save(*args, **kwargs)

        # If status updated to in_progress or closed, reflect on the lead
        if not is_new and self.lead and old_status != self.status:
            try:
                from crm.models import Lead, Activity

                if self.status == self.Status.IN_PROGRESS and self.lead.status == Lead.Status.NEW:
                    self.lead.status = Lead.Status.CONTACTED
                    self.lead.save(update_fields=["status", "updated_at"])
                Activity.objects.create(
                    lead=self.lead,
                    type=Activity.Type.STATUS_CHANGE,
                    subject=f"Enquiry marked {self.get_status_display()}",
                    description=f"{self.get_enquiry_type_display()} enquiry was updated to {self.get_status_display()}.",
                    user_name="Staff",
                )
            except Exception:
                pass

    def sync_to_crm_lead(self):
        """Auto-synchronize this enquiry into CRM Lead & Activity."""
        from django.utils import timezone
        from crm.models import Lead, Activity

        v_name = self.vehicle.name if self.vehicle else ""
        phone = (self.phone or "").strip()
        email = (self.email or "").strip()
        from common.phone import normalize_nepal_phone
        norm_phone = normalize_nepal_phone(phone)

        # Deduplicate or find existing lead by normalized phone or email
        lead_obj = None
        if norm_phone:
            for l in Lead.objects.all():
                if normalize_nepal_phone(l.phone) == norm_phone:
                    lead_obj = l
                    break
        if not lead_obj and phone:
            lead_obj = Lead.objects.filter(phone__iexact=phone).first()
        if not lead_obj and email:
            lead_obj = Lead.objects.filter(email__iexact=email).first()

        source_map = {
            self.EnquiryType.QUOTE: Lead.Source.REQUEST_QUOTE,
            self.EnquiryType.TEST_DRIVE: Lead.Source.BOOK_TEST_DRIVE,
            self.EnquiryType.CONTACT: Lead.Source.WEBSITE,
        }
        lead_source = source_map.get(self.enquiry_type, Lead.Source.WEBSITE)

        if lead_obj:
            if not lead_obj.vehicle and v_name:
                lead_obj.vehicle = v_name
            if not lead_obj.company and self.company:
                lead_obj.company = self.company
            lead_obj.last_activity = timezone.now()
            lead_obj.save(update_fields=["vehicle", "company", "last_activity", "updated_at"])
        else:
            lead_obj = Lead.objects.create(
                name=self.name.strip(),
                company=(self.company or "").strip(),
                phone=phone,
                email=email,
                vehicle=v_name,
                source=lead_source,
                status=Lead.Status.NEW,
                notes=f"Inbound website {self.get_enquiry_type_display()} request:\n{self.message}".strip(),
            )

        act_type = (
            Activity.Type.QUOTATION
            if self.enquiry_type == self.EnquiryType.QUOTE
            else Activity.Type.TEST_DRIVE
            if self.enquiry_type == self.EnquiryType.TEST_DRIVE
            else Activity.Type.NOTE
        )
        Activity.objects.create(
            lead=lead_obj,
            type=act_type,
            subject=f"Website {self.get_enquiry_type_display()} received",
            description=(
                f"Inbound {self.get_enquiry_type_display()} for vehicle: {v_name or 'General'}.\n"
                f"Customer message: {self.message or 'No message'}"
            ),
            user_name="Website Inbound",
        )

        return lead_obj
