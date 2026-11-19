from django.contrib import admin
from .models import CmsPage


@admin.register(CmsPage)
class CmsPageAdmin(admin.ModelAdmin):
    list_display = ("page_label", "page", "updated_at", "updated_by")
    list_filter = ("page", "updated_at")
    search_fields = ("page",)
    readonly_fields = ("updated_at",)
    autocomplete_fields = ("updated_by",)

    @admin.display(description="Page", ordering="page")
    def page_label(self, obj):
        return obj.get_page_display()
