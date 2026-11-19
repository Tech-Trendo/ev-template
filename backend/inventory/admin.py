from django.contrib import admin

from .models import (
    BorderCrossing,
    ConditionPhoto,
    ConditionReport,
    ConditionResult,
    DestinationWarehouse,
    ImportBatch,
    PDIInspection,
    PDIResult,
    PDIChecklistItem,
    PDISequence,
    PDITemplate,
    Sale,
    StockMovement,
    TransportStatusOption,
    VehicleBodyType,
    VehicleModel,
    VehicleUnit,
    VehicleVariant,
)


@admin.register(VehicleBodyType)
class VehicleBodyTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("name",)
    list_editable = ("is_active", "sort_order")


class VehicleVariantInline(admin.TabularInline):
    model = VehicleVariant
    extra = 0
    fields = ("name", "body_type", "spec_text", "price_override", "is_active")
    show_change_link = True


@admin.register(VehicleVariant)
class VehicleVariantAdmin(admin.ModelAdmin):
    list_display = ("vehicle_model", "name", "body_type", "price_override", "is_active")
    list_filter = ("is_active", "vehicle_model", "body_type")
    search_fields = ("name", "vehicle_model__model_name", "vehicle_model__brand")
    autocomplete_fields = ("vehicle_model", "body_type")


@admin.register(VehicleModel)
class VehicleModelAdmin(admin.ModelAdmin):
    list_display = (
        "brand",
        "model_name",
        "vehicle_warranty_months",
        "battery_warranty_months",
        "motor_warranty_months",
        "battery_power_kw",
        "motor_power_kw",
        "seating_capacity",
        "charger_type",
        "low_stock_threshold",
        "is_active",
    )
    list_filter = ("is_active", "charger_type", "brand")
    search_fields = ("brand", "model_name")
    list_editable = ("low_stock_threshold", "is_active")
    inlines = [VehicleVariantInline]
    fieldsets = (
        (None, {
            "fields": ("brand", "model_name", "is_active", "low_stock_threshold")
        }),
        ("Specifications", {
            "fields": ("battery_power_kw", "motor_power_kw", "seating_capacity", "charger_type", "default_color_options")
        }),
        ("Warranty Terms", {
            "description": "Configured warranty periods. If not configured, units show 'Warranty not configured'.",
            "fields": (
                ("vehicle_warranty_months", "vehicle_warranty_km"),
                ("battery_warranty_months", "battery_warranty_km"),
                ("motor_warranty_months",),
            ),
        }),
        ("Routine Service Intervals", {
            "description": "Routine service schedule interval by duration (months) and mileage (km).",
            "fields": (
                ("service_interval_months", "service_interval_km"),
            ),
        }),
    )


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = (
        "batch_no",
        "origin",
        "shipped_date",
        "arrived_date",
        "invoice_no",
        "total_units",
        "created_at",
    )
    search_fields = ("batch_no", "invoice_no", "origin")
    date_hierarchy = "created_at"


class StockMovementInline(admin.TabularInline):
    model = StockMovement
    extra = 0
    readonly_fields = ("movement_type", "quantity", "reference_note", "created_by", "created_at")
    can_delete = False


@admin.register(VehicleUnit)
class VehicleUnitAdmin(admin.ModelAdmin):
    list_display = (
        "vin_chassis_no",
        "vehicle_model",
        "color",
        "status",
        "odometer_km",
        "selling_price",
        "sold_date",
    )
    list_filter = ("status", "color", "vehicle_model", "import_batch")
    search_fields = ("vin_chassis_no", "motor_no", "customer_name")
    inlines = [StockMovementInline]


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("vehicle", "movement_type", "quantity", "created_by", "created_at")
    list_filter = ("movement_type",)
    search_fields = ("vehicle__vin_chassis_no", "reference_note")
    date_hierarchy = "created_at"


class PDIChecklistItemInline(admin.TabularInline):
    model = PDIChecklistItem
    extra = 0


@admin.register(PDITemplate)
class PDITemplateAdmin(admin.ModelAdmin):
    list_display = ("version_no", "is_active", "created_at")
    list_editable = ("is_active",)
    inlines = [PDIChecklistItemInline]


@admin.register(PDIChecklistItem)
class PDIChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("template", "section", "sub_section", "label", "sort_order")
    list_filter = ("template", "section", "sub_section")


@admin.register(PDISequence)
class PDISequenceAdmin(admin.ModelAdmin):
    list_display = ("year", "last_seq")


class PDIResultInline(admin.TabularInline):
    model = PDIResult
    extra = 0
    readonly_fields = ("item", "label_snapshot", "result", "remark", "photo")


@admin.register(PDIInspection)
class PDIInspectionAdmin(admin.ModelAdmin):
    list_display = (
        "pdi_no",
        "vehicle",
        "inspection_date",
        "overall_rating",
        "checked_by",
        "status",
    )
    list_filter = ("status", "overall_rating", "inspection_date")
    search_fields = ("pdi_no", "vehicle__vin_chassis_no", "checked_by")
    date_hierarchy = "inspection_date"
    inlines = [PDIResultInline]


class ConditionResultInline(admin.TabularInline):
    model = ConditionResult
    extra = 0
    readonly_fields = ("item", "label_snapshot", "result", "remark", "photo")


class ConditionPhotoInline(admin.TabularInline):
    model = ConditionPhoto
    extra = 0


@admin.register(ConditionReport)
class ConditionReportAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicle",
        "report_type",
        "report_date",
        "overall_rating",
        "inspected_by",
    )
    list_filter = ("report_type", "overall_rating", "report_date")
    search_fields = ("vehicle__vin_chassis_no", "inspected_by")
    date_hierarchy = "report_date"
    inlines = [ConditionResultInline, ConditionPhotoInline]


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "unit",
        "customer",
        "sale_date",
        "selling_price",
        "payment_mode",
        "status",
        "is_current",
    )
    list_filter = ("status", "payment_mode", "is_current", "sale_date")
    search_fields = ("unit__vin_chassis_no", "customer__name", "tax_invoice_no", "receipt_no")
    readonly_fields = ("created_at", "updated_at", "cancelled_at", "cancelled_by")

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TransportStatusOption)
class TransportStatusOptionAdmin(admin.ModelAdmin):
    list_display = ("name", "label", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "label")


@admin.register(BorderCrossing)
class BorderCrossingAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(DestinationWarehouse)
class DestinationWarehouseAdmin(admin.ModelAdmin):
    list_display = ("name", "location", "contact_person", "phone", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "location", "contact_person")
