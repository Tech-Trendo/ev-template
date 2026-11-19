from django.contrib import admin

from .models import AttendanceRecord


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "timestamp", "confidence_score", "device")
    list_filter = ("type", "timestamp")
    search_fields = ("user__username", "user__first_name", "user__last_name", "device")
    date_hierarchy = "timestamp"
