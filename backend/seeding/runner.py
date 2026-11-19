"""Orchestration for the complete EV OS demo seed."""

from __future__ import annotations

import traceback

from django.apps import apps

from .helpers import cleanup_legacy_data, log

SEED_STEPS = (
    ("Legacy cleanup", "cleanup", None),
    ("Organisation", "org", None),
    ("Catalogue", "catalog", None),
    ("CRM contacts", "crm_contacts", None),
    ("Inventory and sales", "stock", None),
    ("Inspections", "inspections", None),
    ("CRM pipeline", "crm_pipeline", None),
    ("Servicing and events", "service_ops", None),
    ("HRM and attendance", "hrm", None),
    ("Content and notifications", "content", None),
)

VERIFY_MODELS = (
    "auth.User",
    "accounts.UserProfile",
    "dealers.Dealer",
    "inventory.VehicleModel",
    "inventory.VehicleVariant",
    "inventory.VehicleModelSpec",
    "inventory.ImportBatch",
    "inventory.ShipmentCostType",
    "inventory.ShipmentCost",
    "inventory.VehicleUnit",
    "inventory.StockMovement",
    "inventory.PDITemplate",
    "inventory.PDIInspection",
    "inventory.PDIResult",
    "inventory.ConditionReport",
    "inventory.ConditionResult",
    "inventory.VehicleReceiveCheckList",
    "inventory.Sale",
    "inventory.ImportJob",
    "vehicles.Vehicle",
    "vehicles.VehicleStat",
    "vehicles.VehicleFeature",
    "vehicles.VehicleGalleryImage",
    "vehicles.SpecificationGroup",
    "vehicles.Specification",
    "crm.LeadSource",
    "crm.ActivityType",
    "crm.Bank",
    "crm.BankBranch",
    "crm.Lead",
    "crm.Customer",
    "crm.Opportunity",
    "crm.TestDrive",
    "crm.Quotation",
    "crm.Activity",
    "crm.DocumentTypeMaster",
    "crm.Document",
    "crm.DocumentVersion",
    "crm.DocumentAttachment",
    "crm.CompanyBranding",
    "leads.Enquiry",
    "servicing.ServiceRecord",
    "servicing.ServiceRecordPart",
    "servicing.ServiceEntryImage",
    "events.Event",
    "events.EventVisitor",
    "stories.Tag",
    "stories.Story",
    "cms.CmsPage",
    "hrm.Department",
    "hrm.EmploymentType",
    "hrm.Employee",
    "hrm.EmployeeStatusHistory",
    "hrm.EmployeeChangeLog",
    "hrm.BSYearOverride",
    "attendance.AttendanceRecord",
    "common.Notification",
    "common.AuditLog",
    "common.DailyActivityRollup",
)


def _verify() -> list[str]:
    empty = []
    for label in VERIFY_MODELS:
        try:
            model = apps.get_model(label)
        except LookupError:
            continue
        if model.objects.count() == 0:
            empty.append(label)
    return empty


def run_seed() -> dict[str, object]:
    log("Seeding complete EV OS demo data...")
    state: dict[str, object] = {}
    failures: list[tuple[str, BaseException]] = []

    def attempt(name: str, fn, *args):
        try:
            result = fn(*args)
            log(f"{name}: OK")
            if isinstance(result, dict):
                state.update(result)
            return result
        except Exception as exc:  # pragma: no cover - printed for diagnosis
            failures.append((name, exc))
            log(f"{name}: FAILED — {type(exc).__name__}: {exc}")
            traceback.print_exc()
            return None

    # The seed is intentionally sequential: every section consumes the
    # natural-key dictionaries produced by the previous section.
    from . import catalog as catalog_module
    from . import content_ops, crm_contacts, crm_pipeline, hrm_ops
    from . import inspections as inspection_module
    from . import org, service_ops, stock as stock_module

    attempt("Legacy cleanup", cleanup_legacy_data)
    dealers = state.get("dealers") or {}
    attempt("Organisation", org.seed_organization, dealers)
    users = state.get("users") or {}

    attempt("Catalogue", catalog_module.seed_catalog, dealers)
    catalog = {
        "models": state.get("models") or {},
        "body_types": state.get("body_types") or {},
        "vehicles": state.get("vehicles") or {},
    }

    attempt("CRM contacts", crm_contacts.seed_crm_contacts, catalog)
    crm = {
        "leads": state.get("leads") or {},
        "customers": state.get("customers") or {},
        "banks": state.get("banks") or {},
    }

    attempt("Inventory and sales", stock_module.seed_stock, catalog, crm, users, dealers)
    stock = {
        "batches": state.get("batches") or {},
        "units": state.get("units") or {},
        "cost_types": state.get("cost_types") or {},
    }

    attempt("Inspections", inspection_module.seed_inspections, stock, users)
    attempt("CRM pipeline", crm_pipeline.seed_crm_pipeline, catalog, crm, stock, users, dealers)
    attempt("Servicing and events", service_ops.seed_service_ops, catalog, crm, stock, users, dealers)
    attempt("HRM", hrm_ops.seed_hrm, crm, users, dealers)
    attempt("Content", content_ops.seed_content, stock, crm, catalog, users, dealers)

    empty = _verify()
    if empty:
        log("Modules still empty after seeding: " + ", ".join(empty))
    else:
        log("Every seeded module now has data.")

    log("Seed complete.")
    if failures:
        summary = ", ".join(name for name, _ in failures)
        raise RuntimeError(f"Seed finished with {len(failures)} failed section(s): {summary}")

    return {"state": state, "empty": empty}
