from django.conf import settings
from django.db import models

PAGE_CHOICES = [
    ("home", "Home Page"),
    ("vehicles", "Vehicles Page"),
    ("industries", "Industries Page"),
    ("roi", "ROI Calculator Page"),
    ("about", "About Page"),
    ("stories", "Stories Page"),
    ("contact", "Contact Page"),
    ("quote", "Quote Page"),
    ("global", "Global Sections (CTA)"),
]


class CmsPage(models.Model):
    page = models.CharField(max_length=50, unique=True, choices=PAGE_CHOICES)
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cms_pages",
    )

    class Meta:
        ordering = ["page"]
        verbose_name = "Page content"
        verbose_name_plural = "Page content"

    def __str__(self):
        return self.get_page_display()
