from django.contrib import admin
from .models import Activity, ActivityType, Bank, BankBranch, CompanyBranding, Customer, Lead, LeadSource, Quotation, TestDrive


@admin.register(Bank)
class BankAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "category", "is_active")
    list_filter = ("is_active", "category")
    search_fields = ("name", "code")


@admin.register(BankBranch)
class BankBranchAdmin(admin.ModelAdmin):
    list_display = ("name", "bank", "district", "code", "is_active")
    list_filter = ("is_active", "district")
    search_fields = ("name", "code", "address", "bank__name")
    autocomplete_fields = ("bank",)


@admin.register(LeadSource)
class LeadSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_editable = ("is_active",)
    search_fields = ("name",)
    list_filter = ("is_active",)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("full_name", "company", "phone", "email", "vehicle", "interest_level", "source", "status", "created_by_display", "created_at", "last_activity")
    list_filter = ("status", "source", "vehicle", "interest_level", "created_at")
    search_fields = ("name", "company", "phone", "email", "vehicle", "created_by__username")
    autocomplete_fields = ("created_by", "interest_level")
    readonly_fields = ("created_at", "updated_at")
    list_editable = ("status",)
    date_hierarchy = "created_at"
    fieldsets = (
        ("Identity", {"fields": ("name", "company", "phone", "email")}),
        ("Interest", {"fields": ("address", "vehicle", "interest_level", "source", "budget")}),
        ("Sales", {"fields": ("status", "created_by", "created_by_name", "notes")}),
        ("Meta", {"fields": ("created_at", "updated_at", "last_activity")}),
    )

    @admin.display(description="Created By")
    def created_by_display(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return obj.created_by_name or "—"

    def delete_model(self, request, obj):
        # Mirror the API cascade: deleting a lead also deletes its converted
        # customer plus every test drive / quotation / opportunity / activity
        # attached to either — including records attributed to the lead
        # directly (created before conversion).
        obj.delete_cascade()

    def delete_queryset(self, request, queryset):
        for lead in queryset:
            lead.delete_cascade()


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("display_id_col", "name", "company", "type", "phone", "email", "status", "total_purchases", "last_activity", "created_at")
    list_filter = ("type", "status", "created_at")
    search_fields = ("name", "company", "phone", "email", "location")
    readonly_fields = ("created_at", "updated_at", "display_id_col")
    list_editable = ("status",)
    date_hierarchy = "created_at"
    fieldsets = (
        ("Identity", {"fields": ("name", "company", "type", "phone", "email", "location")}),
        ("Business", {"fields": ("vehicles", "notes", "total_purchases", "status")}),
        ("Meta", {"fields": ("display_id_col", "created_at", "updated_at", "last_activity")}),
    )

    @admin.display(description="Customer ID", ordering="id")
    def display_id_col(self, obj):
        return obj.display_id


@admin.register(TestDrive)
class TestDriveAdmin(admin.ModelAdmin):
    list_display = ("display_id_col", "resolved_customer_name", "vehicle", "date", "time", "salesperson", "status", "location", "created_at")
    list_filter = ("status", "vehicle", "date")
    search_fields = ("customer__name", "customer_name", "vehicle", "salesperson", "location")
    autocomplete_fields = ("customer",)
    readonly_fields = ("created_at", "updated_at", "display_id_col")
    list_editable = ("status",)
    date_hierarchy = "date"

    @admin.display(description="Test Drive ID", ordering="id")
    def display_id_col(self, obj):
        return obj.display_id

    @admin.display(description="Customer")
    def resolved_customer_name(self, obj):
        return obj.resolved_customer_name


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = ("display_id_col", "revision_number", "is_latest", "reference_no", "resolved_customer_name", "company", "vehicle", "salesperson", "subtotal_col", "vat_col", "total_col", "status", "valid_until", "converted_to_order", "created_at")
    list_filter = ("is_latest", "status", "vehicle", "valid_until", "converted_to_order")
    search_fields = ("customer__name", "customer_name", "company", "vehicle", "salesperson", "reference_no")
    autocomplete_fields = ("customer",)
    readonly_fields = ("parent", "root", "revision_number", "is_latest", "created_at", "updated_at", "display_id_col", "subtotal_col", "vat_col", "total_col")
    list_editable = ("status", "converted_to_order")
    date_hierarchy = "valid_until"
    fieldsets = (
        ("Identity", {"fields": ("customer", "customer_name", "company", "vehicle", "salesperson")}),
        ("Pricing", {"fields": ("vehicle_price", "accessories", "discount", "other_charges", "vat_rate", "subtotal_col", "vat_col", "total_col")}),
        ("Status", {"fields": ("status", "reference_no", "valid_until", "notes", "converted_to_order")}),
        ("Revisions", {"fields": ("parent", "root", "revision_number", "is_latest")}),
        ("Meta", {"fields": ("display_id_col", "created_at", "updated_at")}),
    )

    @admin.display(description="Quotation ID", ordering="id")
    def display_id_col(self, obj):
        return obj.display_id

    @admin.display(description="Customer")
    def resolved_customer_name(self, obj):
        return obj.resolved_customer_name

    @admin.display(description="Subtotal")
    def subtotal_col(self, obj):
        return f"NPR {obj.subtotal:,.0f}"

    @admin.display(description="VAT")
    def vat_col(self, obj):
        return f"NPR {obj.vat_amount:,.0f}"

    @admin.display(description="Total")
    def total_col(self, obj):
        return f"NPR {obj.total:,.0f}"


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "subject", "lead", "customer", "datetime", "user_display", "created_at")
    list_filter = ("type", "datetime", "created_at")
    search_fields = ("subject", "description", "lead__name", "lead__first_name", "lead__last_name", "customer__name", "user__username", "user_name")
    autocomplete_fields = ("lead", "customer", "user")
    readonly_fields = ("created_at",)
    date_hierarchy = "datetime"

    @admin.display(description="User")
    def user_display(self, obj):
        return obj.resolved_user


@admin.register(ActivityType)
class ActivityTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "label", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "label")


@admin.register(CompanyBranding)
class CompanyBrandingAdmin(admin.ModelAdmin):
    list_display = ("__str__", "letterhead_image", "updated_at", "updated_by")
    readonly_fields = ("updated_at",)
