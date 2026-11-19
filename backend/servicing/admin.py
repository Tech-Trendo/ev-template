from django.contrib import admin

from .models import ServiceRecord, ServiceRecordPart


class ServiceRecordPartInline(admin.TabularInline):
    model = ServiceRecordPart
    extra = 0


@admin.register(ServiceRecord)
class ServiceRecordAdmin(admin.ModelAdmin):
    list_display = (
        "chassis_number",
        "vehicle",
        "dealer",
        "status",
        "technician",
        "date_received",
        "date_completed",
    )
    list_filter = ("status", "dealer", "date_received")
    search_fields = ("chassis_number", "service_notes")
    date_hierarchy = "date_received"
    inlines = [ServiceRecordPartInline]
