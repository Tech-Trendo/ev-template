from django.db import models
from django.utils.text import slugify
from common.models import AuditTrackedModel


class Vehicle(AuditTrackedModel):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    category = models.CharField(max_length=100)
    payload = models.CharField(max_length=50, blank=True)
    range_km = models.CharField(max_length=50, blank=True)
    battery = models.CharField(max_length=100, blank=True)
    image = models.ImageField(upload_to="vehicles/", blank=True, null=True)
    image_url = models.URLField(blank=True)
    tag = models.CharField(max_length=50, blank=True)
    alt_text = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    # New hero/marketing fields
    hero_heading = models.CharField(max_length=200, blank=True)
    hero_description = models.TextField(blank=True)
    primary_cta_label = models.CharField(max_length=100, blank=True, default="Request a Quote")
    secondary_cta_label = models.CharField(max_length=100, blank=True, default="Request a Quote")
    engineered_heading = models.CharField(max_length=200, blank=True, default="Engineered for the toughest routes")
    engineered_description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Catalog vehicle sold/registered through a dealer (optional; per-unit
    # chassis numbers live on servicing.ServiceRecord, not here, because a
    # catalog model row covers many physical units).
    dealer = models.ForeignKey(
        "dealers.Dealer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vehicles",
    )

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)
            slug = base
            n = 1
            while Vehicle.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f"{base}-{n}"
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def image_src(self):
        if self.image and hasattr(self.image, "url"):
            return self.image.url
        return self.image_url or ""


class VehicleStat(models.Model):
    vehicle = models.ForeignKey(Vehicle, related_name="stats", on_delete=models.CASCADE)
    label = models.CharField(max_length=100)
    value = models.CharField(max_length=100)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.vehicle.name} - {self.label}: {self.value}"


class VehicleFeature(models.Model):
    vehicle = models.ForeignKey(Vehicle, related_name="features", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    description = models.TextField()
    icon = models.CharField(max_length=50, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class VehicleGalleryImage(models.Model):
    vehicle = models.ForeignKey(Vehicle, related_name="gallery", on_delete=models.CASCADE)
    image = models.ImageField(upload_to="vehicles/gallery/", blank=True, null=True)
    image_url = models.URLField(blank=True)
    alt_text = models.CharField(max_length=200, blank=True)
    caption = models.CharField(max_length=300, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    @property
    def image_src(self):
        if self.image and hasattr(self.image, "url"):
            return self.image.url
        return self.image_url or ""


class SpecificationGroup(models.Model):
    vehicle = models.ForeignKey(Vehicle, related_name="specification_groups", on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class Specification(models.Model):
    group = models.ForeignKey(SpecificationGroup, related_name="specifications", on_delete=models.CASCADE)
    label = models.CharField(max_length=200)
    value = models.CharField(max_length=500)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
