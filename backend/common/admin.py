from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "source",
        "content_type",
        "object_id",
        "field_name",
        "old_value",
        "new_value",
        "changed_by",
        "timestamp",
    )
    list_filter = ("source", "content_type", "timestamp")
    search_fields = ("object_id", "field_name", "old_value", "new_value")
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False
