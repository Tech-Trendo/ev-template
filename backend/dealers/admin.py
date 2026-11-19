from django.contrib import admin

from .models import Dealer


@admin.register(Dealer)
class DealerAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_person", "phone", "district", "status", "updated_at")
    list_filter = ("status", "district")
    search_fields = ("name", "contact_person", "phone", "email", "district")
