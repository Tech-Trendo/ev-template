"""Sales pipeline, quotations, activities and the document vault."""

from __future__ import annotations

from datetime import time

from django.core.files.base import ContentFile

from crm.models import (
    Activity,
    CompanyBranding,
    Document,
    DocumentAttachment,
    DocumentTypeMaster,
    DocumentVersion,
    Opportunity,
    Quotation,
    TestDrive,
)
from crm.quotation_reference import ensure_modern_quotation_reference
from inventory.models import Sale, VehicleUnit

from .helpers import day, dec, log, stamp

OPPORTUNITIES = (
    ("sunrise", "Sunrise Logistics", "Cargo 10T", "won", "5800000", 100, 10),
    ("citymart", "CityMart Retail", "CityVan 3T", "won", "2750000", 100, 7),
    ("beverage", "Nepal Beverage Distributors", "Cargo 10T", "negotiation", "11700000", 80, 20),
    ("mero", "Mero Hardware", "Hauler 6T", "quotation", "4450000", 65, 18),
    ("coldchain", "Himalayan Cold Chain", "Hauler 6T", "qualified", "4450000", 45, 30),
    ("greenvalley", "Green Valley Farms", "Hauler 6T", "contacted", "4450000", 25, 45),
    ("waste", "Kathmandu Waste Management", "CityVan 3T", "new_lead", "2750000", 10, 60),
)

TEST_DRIVES = (
    {
        "key": "coldchain",
        "lead": "coldchain",
        "customer": None,
        "unit": "hauler_ready",
        "date": 3,
        "time": time(10, 30),
        "status": "scheduled",
        "location": "Central Fleet Yard",
        "notes": "Refrigerated body demonstration requested.",
    },
    {
        "key": "greenvalley",
        "lead": "greenvalley",
        "customer": None,
        "unit": "hauler_warehouse",
        "date": 6,
        "time": time(14, 0),
        "status": "requested",
        "location": "Chitwan dealer yard",
        "notes": "Customer asked for a flatbed unit.",
    },
    {
        "key": "waste",
        "lead": "waste",
        "customer": None,
        "unit": "cityvan_warehouse",
        "date": -5,
        "time": time(9, 30),
        "status": "completed",
        "location": "Kathmandu city route",
        "notes": "Route trial completed with the operations team.",
    },
    {
        "key": "resorts",
        "lead": "resorts",
        "customer": None,
        "unit": None,
        "date": -12,
        "time": time(11, 0),
        "status": "cancelled",
        "location": "Pokhara showroom",
        "notes": "Customer postponed the evaluation.",
    },
)

QUOTATIONS = (
    {
        "reference": "QT-2026-0001",
        "customer": "sunrise",
        "lead": "sunrise",
        "model": "Cargo 10T",
        "variant": "Closed Container",
        "unit": "cargo_sold_overdue",
        "status": "accepted",
        "price": "5850000",
        "created": -260,
        "valid": -240,
        "converted": True,
        "notes": "Fleet replacement quotation for two cargo units.",
    },
    {
        "reference": "QT-2026-0002",
        "customer": "beverage",
        "lead": "beverage",
        "model": "Cargo 10T",
        "variant": "Hi-Deck Container",
        "unit": None,
        "status": "sent",
        "price": "5850000",
        "created": -20,
        "valid": 10,
        "converted": False,
        "notes": "Two additional cargo units for the eastern distribution route.",
    },
    {
        "reference": "QT-2026-0003",
        "customer": "coldchain",
        "lead": "coldchain",
        "model": "Hauler 6T",
        "variant": "Refrigerated Container",
        "unit": None,
        "status": "viewed",
        "price": "4450000",
        "created": -12,
        "valid": 18,
        "converted": False,
        "notes": "Refrigerated body quotation with telematics package.",
    },
    {
        "reference": "QT-2026-0004",
        "customer": "mero",
        "lead": "mero",
        "model": "Hauler 6T",
        "variant": "Flat Body",
        "unit": "hauler_sold_new",
        "status": "accepted",
        "price": "4450000",
        "created": -30,
        "valid": -15,
        "converted": True,
        "notes": "Flatbed hauler for building-material deliveries.",
    },
    {
        "reference": "QT-2026-0005",
        "customer": "greenvalley",
        "lead": "greenvalley",
        "model": "Hauler 6T",
        "variant": "Flat Body",
        "unit": None,
        "status": "draft",
        "price": "4450000",
        "created": -2,
        "valid": 28,
        "converted": False,
        "notes": "Draft quotation prepared after the initial site visit.",
    },
)

ACTIVITIES = (
    ("Initial discovery call", "call", "sunrise", "Discussed route profile, charging access and delivery timeline."),
    ("Quotation accepted", "status_change", "sunrise", "Customer accepted QT-2026-0001 and moved to order."),
    ("Cold-chain requirements", "meeting", "coldchain", "Reviewed temperature zones, body insulation and daily kilometres."),
    ("Site charging assessment", "note", "citymart", "Three-phase power available at the main warehouse."),
    ("Follow-up WhatsApp", "whatsapp", "greenvalley", "Shared payload and flatbed configuration details."),
    ("Expansion quotation sent", "quotation", "beverage", "Sent QT-2026-0002 for two additional Cargo 10T units."),
    ("Finance documents", "email", "mero", "Received PAN, company registration and bank reference letter."),
    ("Municipal pilot review", "meeting", "waste", "Reviewed route data and proposed a three-month pilot."),
    ("Deferred purchase", "status_change", "resorts", "Customer deferred the EV purchase to the next fiscal year."),
)

DOCUMENT_TYPES = (
    ("Company Registration", "REG", "Company registration certificate."),
    ("PAN / VAT Certificate", "PAN", "Tax registration certificate."),
    ("Quotation", "QUOTE", "Customer quotation document."),
    ("Sales Agreement", "SALE", "Signed vehicle sales agreement."),
    ("Warranty Certificate", "WARRANTY", "Vehicle and battery warranty certificate."),
    ("Shipping Document", "SHIP", "Bill of lading and customs documents."),
)


def _file(name: str, text: str) -> ContentFile:
    return ContentFile(text.encode("utf-8"), name=name)


def seed_crm_pipeline(catalog: dict, crm: dict, stock: dict, users: dict, dealers: dict) -> dict[str, object]:
    log("CRM pipeline and quotations")
    models = catalog["models"]
    customers = crm["customers"]
    leads = crm["leads"]
    units = stock["units"]
    central = dealers.get("VT Central Fleet & Service Hub")
    salesperson = users.get("sales.exec")
    manager = users.get("sales.manager")

    opportunities = {}
    for key, company, model_name, stage, value, probability, close_in in OPPORTUNITIES:
        customer = customers.get(key)
        lead = leads.get(key)
        customer_name = customer.name if customer else (lead.name if lead else company)
        opportunity, _ = Opportunity.objects.update_or_create(
            title=f"{company} — {model_name} fleet",
            defaults={
                "customer": customer,
                "customer_name": customer_name,
                "company": company,
                "vehicle": model_name,
                "stage": stage,
                "value": dec(value),
                "probability": probability,
                "close_date": day(close_in),
                "assigned_to": salesperson,
                "assigned_to_name": "Rohan Gurung",
                "dealer": central,
                "created_by": manager,
                "last_activity": stamp(-2),
            },
        )
        opportunities[key] = opportunity

    test_drives = {}
    for spec in TEST_DRIVES:
        unit = units.get(spec["unit"]) if spec["unit"] else None
        lead = leads.get(spec["lead"])
        test_drive, _ = TestDrive.objects.update_or_create(
            lead=lead,
            date=day(spec["date"]),
            defaults={
                "customer": customers.get(spec["customer"]) if spec["customer"] else None,
                "unit": unit,
                "customer_name": lead.name if lead else "",
                "vehicle": unit.vehicle_model.model_name if unit else spec["key"].title(),
                "time": spec["time"],
                "salesperson": "Rohan Gurung",
                "dealer": central,
                "created_by": salesperson,
                "location": spec["location"],
                "status": spec["status"],
                "notes": spec["notes"],
            },
        )
        test_drives[spec["key"]] = test_drive

    quotations = {}
    for spec in QUOTATIONS:
        model = models[spec["model"]]
        variant = model.variants.filter(name=spec["variant"]).first()
        unit = units.get(spec["unit"]) if spec["unit"] else None
        customer = customers.get(spec["customer"])
        lead = leads.get(spec["lead"])
        defaults = {
            "lead": lead,
            "customer": customer,
            "customer_name": customer.name if customer else (lead.name if lead else ""),
            "company": customer.company if customer else (lead.company if lead else ""),
            "vehicle_model": model,
            "variant": variant,
            "unit": unit,
            "vehicle": f"{model.brand} {model.model_name}",
            "salesperson": "Rohan Gurung",
            "salesperson_email": "rohan.gurung@vehicletemplate.example.com",
            "salesperson_phone": "+977-9800000020",
            "vehicle_price": dec(spec["price"]),
            "accessories": dec("25000"),
            "discount": dec("50000"),
            "vat_rate": dec("13"),
            "other_charges": dec("15000"),
            "valid_until": day(spec["valid"]),
            "battery_capacity": str(model.battery_power_kw or ""),
            "vehicle_length": "20 FT" if spec["model"] == "Cargo 10T" else "16 FT",
            "bank_name": "Global IME Bank",
            "bank_address": "Kuleshwor Branch",
            "pan_number": customer.pan_vat_number if customer else "",
            "customer_phone": customer.phone if customer else (lead.phone if lead else ""),
            "customer_address": customer.address if customer else "",
            "vehicle_description": f"{model.brand} {model.model_name} {spec['variant']}",
            "range_km": "300" if spec["model"] == "Cargo 10T" else "240",
            "quantity": 1,
            "notes": spec["notes"],
            "dealer": central,
            "created_by": salesperson,
            "status": spec["status"],
            "converted_to_order": spec["converted"],
            "is_latest": True,
        }

        # ``reference_no`` is rewritten to the modern format whenever a
        # quotation is read through the API, so it cannot be used as a stable
        # seed key.  Match on the demo notes instead and collapse duplicates
        # left by earlier seeder runs.
        existing = list(Quotation.objects.filter(notes=spec["notes"]).order_by("id"))
        if existing:
            quotation = existing[0]
            for field, value in defaults.items():
                setattr(quotation, field, value)
            quotation.save()
            duplicates = existing[1:]
            if duplicates:
                Sale.objects.filter(quotation__in=duplicates).update(quotation=quotation)
                VehicleUnit.objects.filter(quotation__in=duplicates).update(quotation=quotation)
                Document.objects.filter(quotation__in=duplicates).update(quotation=quotation)
                for duplicate in duplicates:
                    duplicate.delete()
        else:
            quotation = Quotation.objects.create(
                reference_no=spec["reference"], **defaults
            )

        ensure_modern_quotation_reference(quotation)
        quotations[spec["reference"]] = quotation

        if spec["converted"] and unit:
            Sale.objects.filter(unit=unit).update(quotation=quotation)
            if unit.quotation_id != quotation.id:
                unit.quotation = quotation
                unit.save(update_fields=["quotation"])

    activities = {}
    for subject, activity_type, lead_key, description in ACTIVITIES:
        lead = leads.get(lead_key)
        for key, quotation in quotations.items():
            description = description.replace(key, quotation.reference_no)
        activity, _ = Activity.objects.update_or_create(
            subject=subject,
            lead=lead,
            defaults={
                "type": activity_type,
                "description": description,
                "datetime": stamp(-3, 11),
                "user": salesperson,
                "user_name": "Rohan Gurung",
                "dealer": central,
                "created_by": salesperson,
            },
        )
        activities[subject] = activity

    document_types = {}
    for name, code, description in DOCUMENT_TYPES:
        document_type, _ = DocumentTypeMaster.objects.update_or_create(
            code=code,
            defaults={
                "name": name,
                "description": description,
                "is_required_for_shipment": code in ("REG", "PAN", "SHIP"),
                "is_active": True,
            },
        )
        document_types[code] = document_type

    documents = {}
    document_specs = (
        (
            "Sunrise Logistics — Sales Agreement",
            "SALE",
            "sales-agreement-sunrise.txt",
            "Sales agreement for one VT Cargo 10T.\nCustomer: Sunrise Logistics\n",
            customers.get("sunrise"),
            leads.get("sunrise"),
            quotations.get("QT-2026-0001"),
        ),
        (
            "Nepal Beverage Distributors — PAN Certificate",
            "PAN",
            "pan-nepal-beverage.txt",
            "PAN certificate (demo).\nCompany: Nepal Beverage Distributors\n",
            customers.get("beverage"),
            leads.get("beverage"),
            None,
        ),
        (
            "Himalayan Cold Chain — Quotation",
            "QUOTE",
            "quotation-coldchain.txt",
            f"Quotation {quotations['QT-2026-0003'].reference_no} for one refrigerated VT Hauler 6T.\n",
            customers.get("coldchain"),
            leads.get("coldchain"),
            quotations.get("QT-2026-0003"),
        ),
    )
    for title, code, filename, body, customer, lead, quotation in document_specs:
        document, created = Document.objects.update_or_create(
            title=title,
            defaults={
                "category": "LEGAL" if code in ("REG", "PAN") else "SALES",
                "document_type_master": document_types.get(code),
                "document_type": code.lower(),
                "file_hash": f"demo-{code.lower()}-hash",
                "file_size": len(body),
                "file_type": "text/plain",
                "uploaded_by": manager,
                "customer": customer,
                "lead": lead,
                "quotation": quotation,
                "notes": "Demo document created by the template seeder.",
            },
        )
        # Always refresh the demo file contents.
        document.file.save(filename, _file(filename, body), save=True)
        documents[title] = document

    first_document = next(iter(documents.values()), None)
    if first_document:
        DocumentVersion.objects.update_or_create(
            document=first_document,
            version_no=1,
            defaults={
                "file": _file("sales-agreement-sunrise-v1.txt", "Initial signed copy.\n"),
                "file_hash": "demo-version-1",
                "file_size": 22,
                "file_type": "text/plain",
                "uploaded_by": manager,
                "change_note": "Initial uploaded copy.",
            },
        )
        DocumentAttachment.objects.get_or_create(
            document=first_document,
            customer=customers.get("sunrise"),
            defaults={"created_by": manager},
        )
        DocumentAttachment.objects.get_or_create(
            document=first_document,
            unit=units.get("cargo_sold_overdue"),
            defaults={"created_by": manager},
        )

    branding = CompanyBranding.objects.first()
    if branding is None:
        branding = CompanyBranding.objects.create(created_by=users.get("template"))
    else:
        branding.created_by = users.get("template")
        branding.save(update_fields=["created_by"])

    log(
        f"  opportunities: {len(opportunities)}, quotations: {len(quotations)}, "
        f"documents: {len(documents)}"
    )
    return {
        "opportunities": opportunities,
        "test_drives": test_drives,
        "quotations": quotations,
        "activities": activities,
        "documents": documents,
        "document_types": document_types,
    }
