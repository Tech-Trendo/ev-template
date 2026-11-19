from django.contrib import admin

from .models import Enquiry


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "company",
        "phone",
        "email",
        "vehicle",
        "enquiry_type",
        "status",
        "created_at",
    )
    list_filter = ("enquiry_type", "status", "created_at")
    search_fields = ("name", "company", "email", "phone")
    readonly_fields = ("created_at",)
