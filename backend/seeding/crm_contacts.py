"""CRM foundations: lead sources, activity types, banks, leads and customers."""

from __future__ import annotations

from crm.models import (
    ActivityType,
    Bank,
    BankBranch,
    Customer,
    Lead,
    LeadSource,
)
from events.models import InterestLevel

from .helpers import day, email, log, phone, stamp

LEAD_SOURCES = (
    "Website",
    "Book Test Drive",
    "Request Quote",
    "Vehicle Enquiry",
    "Facebook",
    "Instagram",
    "Google",
    "Phone",
    "Walk-in",
    "Referral",
    "Dealer",
    "Event",
    "Other",
    "Showroom",
)

ACTIVITY_TYPES = (
    ("call", "Call"),
    ("email", "Email"),
    ("whatsapp", "WhatsApp"),
    ("meeting", "Meeting"),
    ("note", "Note"),
    ("test_drive", "Test Drive"),
    ("quotation", "Quotation"),
    ("status_change", "Status Change"),
)

BANKS = (
    {
        "name": "Nabil Bank",
        "code": "NABIL",
        "category": "Commercial Bank",
        "branches": (
            ("Durbar Marg Branch", "NABIL-DM", "Durbar Marg", "Kathmandu"),
            ("Lakeside Branch", "NABIL-LS", "Lakeside Road", "Pokhara"),
        ),
    },
    {
        "name": "Global IME Bank",
        "code": "GIBL",
        "category": "Commercial Bank",
        "branches": (
            ("Kuleshwor Branch", "GIBL-KUL", "Kuleshwor", "Kathmandu"),
            ("Butwal Branch", "GIBL-BTL", "Traffic Chowk", "Rupandehi"),
        ),
    },
    {
        "name": "Nepal Investment Mega Bank",
        "code": "NIMB",
        "category": "Commercial Bank",
        "branches": (
            ("New Baneshwor Branch", "NIMB-NB", "New Baneshwor", "Kathmandu"),
            ("Bharatpur Branch", "NIMB-BHP", "Narayanghat Road", "Chitwan"),
        ),
    },
    {
        "name": "Standard Chartered Bank",
        "code": "SCB",
        "category": "Commercial Bank",
        "branches": (
            ("Naxal Branch", "SCB-NAX", "Naxal", "Kathmandu"),
            ("Pulchowk Branch", "SCB-PUL", "Pulchowk", "Lalitpur"),
        ),
    },
)

LEADS = (
    {
        "key": "sunrise",
        "first_name": "Anisha",
        "last_name": "Sharma",
        "company": "Sunrise Logistics",
        "phone_index": 11,
        "district": "Kathmandu",
        "model": "Cargo 10T",
        "variant": "Closed Container",
        "source": "WEBSITE",
        "interest": "Hot",
        "status": "converted",
        "budget": "6500000",
        "notes": "Replacing three diesel trucks on the Kathmandu–Biratnagar corridor.",
    },
    {
        "key": "coldchain",
        "first_name": "Ramesh",
        "last_name": "Adhikari",
        "company": "Himalayan Cold Chain",
        "phone_index": 12,
        "district": "Lalitpur",
        "model": "Hauler 6T",
        "variant": "Refrigerated Container",
        "source": "FACEBOOK",
        "interest": "Warm",
        "status": "qualified",
        "budget": "4200000",
        "notes": "Needs a refrigerated body for dairy distribution.",
    },
    {
        "key": "citymart",
        "first_name": "Sunita",
        "last_name": "Maharjan",
        "company": "CityMart Retail",
        "phone_index": 13,
        "district": "Kathmandu",
        "model": "CityVan 3T",
        "variant": "Closed Container",
        "source": "WALK_IN",
        "interest": "Hot",
        "status": "converted",
        "budget": "2800000",
        "notes": "Last-mile delivery fleet for 12 retail outlets.",
    },
    {
        "key": "greenvalley",
        "first_name": "Bishal",
        "last_name": "Thapa",
        "company": "Green Valley Farms",
        "phone_index": 14,
        "district": "Chitwan",
        "model": "Hauler 6T",
        "variant": "Flat Body",
        "source": "REFERRAL",
        "interest": "Normal Inquiry",
        "status": "new",
        "budget": "4500000",
        "notes": "Interested in a flatbed for produce collection.",
    },
    {
        "key": "beverage",
        "first_name": "Prakash",
        "last_name": "Basnet",
        "company": "Nepal Beverage Distributors",
        "phone_index": 15,
        "district": "Parsa",
        "model": "Cargo 10T",
        "variant": "Hi-Deck Container",
        "source": "EVENT",
        "interest": "Hot",
        "status": "converted",
        "budget": "7000000",
        "notes": "Fleet expansion after the sustainable mobility expo.",
    },
    {
        "key": "mero",
        "first_name": "Deepa",
        "last_name": "Rana",
        "company": "Mero Hardware",
        "phone_index": 16,
        "district": "Lalitpur",
        "model": "Hauler 6T",
        "variant": "Flat Body",
        "source": "PHONE",
        "interest": "Warm",
        "status": "converted",
        "budget": "3900000",
        "notes": "Weekly building-material runs inside the valley.",
    },
    {
        "key": "waste",
        "first_name": "Sabin",
        "last_name": "Shrestha",
        "company": "Kathmandu Waste Management",
        "phone_index": 17,
        "district": "Kathmandu",
        "model": "CityVan 3T",
        "variant": "Chassis",
        "source": "GOOGLE",
        "interest": "Warm",
        "status": "contacted",
        "budget": "2500000",
        "notes": "Municipal pilot for segregated waste collection.",
    },
    {
        "key": "resorts",
        "first_name": "Mina",
        "last_name": "Lama",
        "company": "Himalayan Resorts",
        "phone_index": 18,
        "district": "Kaski",
        "model": "CityVan 3T",
        "variant": "Insulated Body",
        "source": "INSTAGRAM",
        "interest": "Cold",
        "status": "lost",
        "budget": "2200000",
        "notes": "Deferred the purchase to the next fiscal year.",
    },
)

CUSTOMERS = (
    {
        "key": "sunrise",
        "name": "Anisha Sharma",
        "company": "Sunrise Logistics",
        "type": "Fleet",
        "lead": "sunrise",
        "contact_person": "Anisha Sharma",
        "phone_index": 11,
        "district": "Kathmandu",
        "province": "Bagmati",
        "pan": "601234567",
        "vehicles": ["VT Cargo 10T"],
        "notes": "Key fleet account with national distribution routes.",
    },
    {
        "key": "citymart",
        "name": "Sunita Maharjan",
        "company": "CityMart Retail",
        "type": "Business",
        "lead": "citymart",
        "contact_person": "Sunita Maharjan",
        "phone_index": 13,
        "district": "Kathmandu",
        "province": "Bagmati",
        "pan": "602345678",
        "vehicles": ["VT CityVan 3T"],
        "notes": "Retail chain with a growing last-mile fleet.",
    },
    {
        "key": "beverage",
        "name": "Prakash Basnet",
        "company": "Nepal Beverage Distributors",
        "type": "Fleet",
        "lead": "beverage",
        "contact_person": "Prakash Basnet",
        "phone_index": 15,
        "district": "Parsa",
        "province": "Madhesh",
        "pan": "603456789",
        "vehicles": ["VT Cargo 10T", "VT Hauler 6T"],
        "notes": "Beverage distribution fleet across central and eastern Nepal.",
    },
    {
        "key": "mero",
        "name": "Deepa Rana",
        "company": "Mero Hardware",
        "type": "Business",
        "lead": "mero",
        "contact_person": "Deepa Rana",
        "phone_index": 16,
        "district": "Lalitpur",
        "province": "Bagmati",
        "pan": "604567890",
        "vehicles": ["VT Hauler 6T"],
        "notes": "Building materials supplier operating inside the Kathmandu Valley.",
    },
    {
        "key": "everest",
        "name": "Everest Distribution Network",
        "company": "Everest Distribution Network",
        "type": "Fleet",
        "lead": None,
        "contact_person": "Nabin Koirala",
        "phone_index": 19,
        "district": "Morang",
        "province": "Koshi",
        "pan": "605678901",
        "vehicles": ["VT Cargo 10T"],
        "notes": "Regional FMCG distributor evaluating electric haulage.",
    },
)


def seed_crm_contacts(catalog: dict) -> dict[str, object]:
    log("CRM foundations")
    for name in LEAD_SOURCES:
        LeadSource.objects.get_or_create(name=name)

    for name, label in ACTIVITY_TYPES:
        ActivityType.objects.update_or_create(
            name=name, defaults={"label": label, "is_active": True}
        )

    banks = {}
    for bank_spec in BANKS:
        bank, _ = Bank.objects.update_or_create(
            name=bank_spec["name"],
            defaults={
                "code": bank_spec["code"],
                "category": bank_spec["category"],
                "is_active": True,
            },
        )
        banks[bank_spec["code"]] = bank
        for branch_name, code, address, district in bank_spec["branches"]:
            BankBranch.objects.update_or_create(
                bank=bank,
                name=branch_name,
                defaults={
                    "code": code,
                    "address": address,
                    "district": district,
                    "is_active": True,
                },
            )
    log(f"  banks: {len(banks)}")

    models = catalog["models"]
    interest_levels = {level.name: level for level in InterestLevel.objects.all()}
    leads: dict[str, Lead] = {}
    for spec in LEADS:
        model = models[spec["model"]]
        variant = model.variants.filter(name=spec["variant"]).first()
        lead, _ = Lead.objects.update_or_create(
            phone=phone(spec["phone_index"]),
            defaults={
                "first_name": spec["first_name"],
                "last_name": spec["last_name"],
                "name": f"{spec['first_name']} {spec['last_name']}",
                "company": spec["company"],
                "email": email(spec["key"]),
                "district": spec["district"],
                "province": "Bagmati",
                "vehicle": model.model_name,
                "vehicle_model": model,
                "variant": variant,
                "interest_level": interest_levels.get(spec["interest"]),
                "source": getattr(Lead.Source, spec["source"]),
                "status": spec["status"],
                "budget": spec["budget"],
                "notes": spec["notes"],
                "dealer": catalog_dealer(spec),
                "created_by_name": "Demo Sales Team",
                "last_activity": stamp(-2),
            },
        )
        leads[spec["key"]] = lead

    customers: dict[str, Customer] = {}
    for spec in CUSTOMERS:
        lead = leads.get(spec["lead"]) if spec["lead"] else None
        customer, _ = Customer.objects.update_or_create(
            phone=phone(spec["phone_index"]),
            defaults={
                "lead": lead,
                "name": spec["name"],
                "company": spec["company"],
                "type": spec["type"],
                "phone_normalized": phone(spec["phone_index"]).replace("-", ""),
                "pan_vat_number": spec["pan"],
                "contact_person": spec["contact_person"],
                "email": email(spec["key"]),
                "location": spec["district"],
                "address": f"{spec['district']}, Nepal",
                "district": spec["district"],
                "province": spec["province"],
                "vehicles": spec["vehicles"],
                "notes": spec["notes"],
                "status": "active",
                "source": "seed",
                "last_activity": stamp(-1),
            },
        )
        customers[spec["key"]] = customer
        if lead and lead.status != "converted":
            lead.status = "converted"
            lead.save(update_fields=["status"])

    log(f"  leads: {len(leads)}, customers: {len(customers)}")
    return {"leads": leads, "customers": customers, "banks": banks}


def catalog_dealer(spec):
    from dealers.models import Dealer

    return Dealer.objects.filter(name__startswith="VT Central").first()
