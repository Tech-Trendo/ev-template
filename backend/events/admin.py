from django.contrib import admin
from .models import Event, EventVisitor, InterestLevel


@admin.register(InterestLevel)
class InterestLevelAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_editable = ("is_active",)
    search_fields = ("name",)
    list_filter = ("is_active",)


class EventVisitorInline(admin.TabularInline):
    model = EventVisitor
    extra = 0
    fields = ("name", "phone", "email", "company", "interest_level", "vehicle", "visited_at", "notes", "remarks")
    autocomplete_fields = ("interest_level", "vehicle")


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("name", "start_date", "end_date", "visitor_count_display", "created_at")
    search_fields = ("name",)
    inlines = [EventVisitorInline]

    def visitor_count_display(self, obj):
        return obj.visitors.count()
    visitor_count_display.short_description = "Visitors"


@admin.register(EventVisitor)
class EventVisitorAdmin(admin.ModelAdmin):
    list_display = ("name", "event", "phone", "company", "interest_level", "vehicle", "visited_at")
    search_fields = ("name", "phone", "email", "company", "remarks", "notes")
    list_filter = ("interest_level", "vehicle", "event")
    autocomplete_fields = ("event", "interest_level", "vehicle")
