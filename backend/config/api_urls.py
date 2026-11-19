from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from leads.calculator import emi_calculator, savings_calculator
from dashboard.views import dashboard_stats
from common.search_views import global_search
from common.views import AuditLogViewSet, NotificationViewSet
from common.performance_views import (
    DailyPerformanceView,
    ExportPerformanceCsvView,
    MyActivityView,
    RangePerformanceView,
)
from leads.views import EnquiryViewSet
from stories.views import StoryViewSet
from vehicles.views import VehicleViewSet
from accounts.views import (
    PermissionViewSet,
    RoleViewSet,
    StaffTokenObtainPairView,
    UserViewSet,
    current_user,
    logout_view,
    me,
)
from attendance.views import AttendanceRecordViewSet
from hrm.views import BSYearOverrideViewSet, HRSettingsViewSet, calendar_data
from hrm.employee_views import DepartmentViewSet, EmployeeViewSet, EmploymentTypeViewSet, me as hrm_me
from dealers.views import DealerViewSet
from inventory.views import (
    BorderCrossingViewSet,
    ConditionReportViewSet,
    DestinationWarehouseViewSet,
    ImportBatchViewSet,
    ImportJobViewSet,
    PDIInspectionViewSet,
    PDITemplateViewSet,
    SaleViewSet,
    ShipmentCostTypeViewSet,
    ShipmentCostViewSet,
    StockMovementViewSet,
    StockViewSet,
    TransportStatusOptionViewSet,
    VehicleBodyTypeViewSet,
    VehicleModelSpecViewSet,
    VehicleModelViewSet,
    VehicleReceiveCheckListViewSet,
    VehicleUnitViewSet,
    VehicleVariantViewSet,
    inventory_meta,
)
from servicing.views import (
    ServiceRecordViewSet,
    TrackServiceView,
    ServicingPrefillView,
    ServiceDueListView,
)
from events.views import EventViewSet, InterestLevelViewSet, EventVisitorViewSet
from cms.views import CmsPageViewSet
from crm.views import (
    ActivityTypeViewSet,
    ActivityViewSet,
    BankBranchViewSet,
    BankViewSet,
    CompanyBrandingViewSet,
    CustomerViewSet,
    DocumentTypeMasterViewSet,
    DocumentViewSet,
    LeadSourceViewSet,
    LeadViewSet,
    OpportunityViewSet,
    QuotationViewSet,
    TestDriveViewSet,
    crm_meta,
)

router = DefaultRouter()
router.register(r"vehicles", VehicleViewSet, basename="vehicle")
router.register(r"stories", StoryViewSet, basename="story")
router.register(r"enquiries", EnquiryViewSet, basename="enquiry")
router.register(r"events", EventViewSet, basename="event")
router.register(r"interest-levels", InterestLevelViewSet, basename="interest-level")
router.register(r"users", UserViewSet, basename="user")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"permissions", PermissionViewSet, basename="permission")
router.register(r"dealers", DealerViewSet, basename="dealer")
router.register(r"inventory/models", VehicleModelViewSet, basename="inventory-model")
router.register(r"inventory/body-types", VehicleBodyTypeViewSet, basename="inventory-body-type")
router.register(r"inventory/model-specs", VehicleModelSpecViewSet, basename="inventory-model-spec")
router.register(r"inventory/variants", VehicleVariantViewSet, basename="inventory-variant")
router.register(r"inventory/shipments", ImportBatchViewSet, basename="inventory-shipment")
router.register(r"inventory/batches", ImportBatchViewSet, basename="inventory-batch")
router.register(r"inventory/import-jobs", ImportJobViewSet, basename="inventory-import-job")
router.register(r"inventory/cost-types", ShipmentCostTypeViewSet, basename="inventory-cost-type")
router.register(r"inventory/shipment-costs", ShipmentCostViewSet, basename="inventory-shipment-cost")
router.register(r"inventory/transport-statuses", TransportStatusOptionViewSet, basename="inventory-transport-status")
router.register(r"inventory/border-crossings", BorderCrossingViewSet, basename="inventory-border-crossing")
router.register(r"inventory/destination-warehouses", DestinationWarehouseViewSet, basename="inventory-destination-warehouse")
router.register(r"inventory/units", VehicleUnitViewSet, basename="inventory-unit")
router.register(r"inventory/pdi", PDIInspectionViewSet, basename="inventory-pdi")
router.register(
    r"inventory/condition-reports", ConditionReportViewSet, basename="inventory-condition"
)
router.register(r"inventory/checklist", PDITemplateViewSet, basename="inventory-checklist")
router.register(r"inventory/templates", PDITemplateViewSet, basename="inventory-template")
router.register(r"inventory/receive-checklists", VehicleReceiveCheckListViewSet, basename="inventory-receive-checklist")
router.register(r"inventory/movements", StockMovementViewSet, basename="inventory-movement")
router.register(r"inventory/stock", StockViewSet, basename="inventory-stock")
router.register(r"servicing/records", ServiceRecordViewSet, basename="service-record")
router.register(r"attendance/records", AttendanceRecordViewSet, basename="attendance-record")
router.register(r"hrm/settings", HRSettingsViewSet, basename="hrm-settings")
router.register(r"hrm/calendar-years", BSYearOverrideViewSet, basename="hrm-calendar-years")
router.register(r"hrm/employees", EmployeeViewSet, basename="hrm-employees")
router.register(r"hrm/departments", DepartmentViewSet, basename="hrm-departments")
router.register(r"hrm/employment-types", EmploymentTypeViewSet, basename="hrm-employment-types")
router.register(r"cms/pages", CmsPageViewSet, basename="cms-page")
router.register(r"crm/leads", LeadViewSet, basename="crm-lead")
router.register(r"crm/lead-sources", LeadSourceViewSet, basename="crm-lead-source")
router.register(r"crm/customers", CustomerViewSet, basename="crm-customer")
router.register(r"crm/opportunities", OpportunityViewSet, basename="crm-opportunity")
router.register(r"crm/test-drives", TestDriveViewSet, basename="crm-test-drive")
router.register(r"crm/quotations", QuotationViewSet, basename="crm-quotation")
router.register(r"crm/activities", ActivityViewSet, basename="crm-activity")
router.register(r"crm/activity-types", ActivityTypeViewSet, basename="crm-activity-type")
router.register(r"crm/banks", BankViewSet, basename="crm-bank")
router.register(r"crm/bank-branches", BankBranchViewSet, basename="crm-bank-branch")
router.register(r"crm/branding", CompanyBrandingViewSet, basename="crm-branding")
router.register(r"crm/document-types", DocumentTypeMasterViewSet, basename="crm-document-type")
router.register(r"crm/documents", DocumentViewSet, basename="crm-document")
router.register(r"documents", DocumentViewSet, basename="vault-document")
router.register(r"inventory/sales", SaleViewSet, basename="inventory-sale")
router.register(r"crm/sales", SaleViewSet, basename="crm-sale")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"audit-logs", AuditLogViewSet, basename="audit-log")

# Nested visitor views
event_visitor_list = EventVisitorViewSet.as_view({"get": "list", "post": "create"})
event_visitor_detail = EventVisitorViewSet.as_view(
    {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
)
event_visitor_bulk_import = EventVisitorViewSet.as_view({"post": "bulk_import"})
event_visitor_bulk_template = EventVisitorViewSet.as_view({"get": "bulk_template"})

urlpatterns = [
    path("api/", include(router.urls)),
    path("api/me/", me, name="me"),
    path("api/me", me),
    path("api/servicing/due/", ServiceDueListView.as_view(), name="service-due"),
    path("api/servicing/prefill/", ServicingPrefillView.as_view(), name="service-prefill"),
    path("api/servicing/track/", TrackServiceView.as_view(), name="service-track"),
    path("api/hrm/calendar-data/", calendar_data, name="hrm-calendar-data"),
    path("api/hrm/me/", hrm_me, name="hrm-me"),
    path("api/crm/meta/", crm_meta, name="crm-meta"),
    path("api/inventory/meta/", inventory_meta, name="inventory-meta"),
    path("api/events/<int:event_pk>/visitors/", event_visitor_list, name="event-visitors-list"),
    path("api/events/<int:event_pk>/visitors/bulk-import/", event_visitor_bulk_import, name="event-visitors-bulk-import"),
    path("api/events/<int:event_pk>/visitors/bulk-template/", event_visitor_bulk_template, name="event-visitors-bulk-template"),
    path("api/events/<int:event_pk>/visitors/<int:pk>/", event_visitor_detail, name="event-visitors-detail"),
    path("api/dashboard/stats/", dashboard_stats, name="dashboard-stats"),
    path("api/search/", global_search, name="global-search"),
    path("api/calculator/savings/", savings_calculator, name="savings-calculator"),
    path("api/calculator/emi/", emi_calculator, name="emi-calculator"),
    path("api/auth/user/", current_user, name="auth-user"),
    path("api/auth/user", current_user),
    path("api/auth/token/", StaffTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("api/auth/token", StaffTokenObtainPairView.as_view()),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("api/auth/token/refresh", TokenRefreshView.as_view()),
    path("api/auth/logout/", logout_view, name="auth-logout"),
    path("api/auth/logout", logout_view),

    path("api/performance/daily/", DailyPerformanceView.as_view(), name="performance-daily"),
    path("api/performance/range/", RangePerformanceView.as_view(), name="performance-range"),
    path("api/performance/export-csv/", ExportPerformanceCsvView.as_view(), name="performance-export-csv"),
    path("api/performance/my-activity/", MyActivityView.as_view(), name="performance-my-activity"),

    # OpenAPI schema + docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/schema/swagger-ui/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/schema/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
