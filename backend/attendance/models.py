"""HR attendance clock-in/out records."""

from django.conf import settings
from django.db import models
from django.utils import timezone


class AttendanceRecord(models.Model):
    class Type(models.TextChoices):
        CHECK_IN = "check_in", "Check In"
        CHECK_OUT = "check_out", "Check Out"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance_records"
    )
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.CHECK_IN)
    confidence_score = models.FloatField(null=True, blank=True)
    device = models.CharField(max_length=200, blank=True)
    location = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp", "-id"]
        permissions = [
            ("view_own_attendance", "Can view own attendance records"),
            (
                "manage_attendance",
                "Can manage all attendance (enroll others, corrections, export)",
            ),
        ]

    def __str__(self):
        return f"{self.user} {self.get_type_display()} @ {self.timestamp:%Y-%m-%d %H:%M}"
