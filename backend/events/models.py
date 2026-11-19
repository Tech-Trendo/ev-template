from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone


class InterestLevel(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "Interest Level"
        verbose_name_plural = "Interest Levels"

    def __str__(self):
        return self.name


class Event(models.Model):
    name = models.CharField(max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date", "-id"]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date cannot be before start date."})

    @property
    def status(self):
        today = timezone.localdate()
        if today < self.start_date:
            return "upcoming"
        if today > self.end_date:
            return "completed"
        return "ongoing"

    @property
    def visitor_count(self):
        # fallback if not annotated
        if hasattr(self, "_visitor_count"):
            return self._visitor_count
        return self.visitors.count()


class EventVisitor(models.Model):
    event = models.ForeignKey(Event, related_name="visitors", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    company = models.CharField(max_length=200, blank=True, default="")
    address = models.CharField(max_length=500, blank=True)
    notes = models.TextField(blank=True, default="")
    remarks = models.TextField(blank=True, default="")
    interest_level = models.ForeignKey(
        InterestLevel,
        on_delete=models.PROTECT,
        related_name="visitors",
        null=True,
        blank=True,
    )
    vehicle = models.ForeignKey(
        "vehicles.Vehicle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="event_visitors",
    )
    photo = models.ImageField(upload_to="events/visitors/", blank=True, null=True)
    visited_at = models.DateTimeField(null=True, blank=True, default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-visited_at", "-id"]
        verbose_name = "Event Visitor"
        verbose_name_plural = "Event Visitors"

    def __str__(self):
        return f"{self.name} ({self.event.name})"

    @property
    def photo_url(self):
        if self.photo and hasattr(self.photo, "url"):
            return self.photo.url
        return ""
