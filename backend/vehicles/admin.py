from django.contrib import admin

from .models import Vehicle, VehicleStat, VehicleFeature, VehicleGalleryImage, SpecificationGroup, Specification


class VehicleStatInline(admin.TabularInline):
    model = VehicleStat
    extra = 0


class VehicleFeatureInline(admin.TabularInline):
    model = VehicleFeature
    extra = 0


class VehicleGalleryInline(admin.TabularInline):
    model = VehicleGalleryImage
    extra = 0


class SpecificationInline(admin.TabularInline):
    model = Specification
    extra = 0


class SpecificationGroupInline(admin.TabularInline):
    model = SpecificationGroup
    extra = 0


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "category", "payload", "range_km", "tag", "is_active", "sort_order")
    list_editable = ("is_active", "sort_order")
    search_fields = ("name", "category", "slug")
    list_filter = ("is_active",)
    prepopulated_fields = {"slug": ("name",)}
    inlines = [VehicleStatInline, VehicleFeatureInline, VehicleGalleryInline, SpecificationGroupInline]


@admin.register(SpecificationGroup)
class SpecGroupAdmin(admin.ModelAdmin):
    list_display = ("title", "vehicle", "sort_order")
    inlines = [SpecificationInline]
