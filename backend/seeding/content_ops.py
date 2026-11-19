"""CMS pages, stories, notifications and audit history."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType

from cms.models import CmsPage
from common.models import AuditLog, Notification
from inventory.models import Sale, VehicleUnit
from crm.models import Lead, Quotation
from servicing.models import ServiceRecord
from stories.models import Story, Tag

from .helpers import COMPANY, day, log, stamp, svg_placeholder, write_media_file

TAGS = (
    ("Fleet Operations", "fleet-operations"),
    ("Charging", "charging"),
    ("Maintenance", "maintenance"),
    ("Case Study", "case-study"),
)

STORIES = (
    {
        "title": "How electric fleets cut operating costs in Nepal",
        "slug": "ev-fleet-operating-costs-nepal",
        "category": "Fleet Operations",
        "excerpt": "A practical look at energy, maintenance and uptime savings when a commercial fleet goes electric.",
        "published": -18,
        "tags": ("Fleet Operations", "Case Study"),
        "featured": True,
        "accent": "#15803d",
    },
    {
        "title": "Sizing charging infrastructure for commercial EV fleets",
        "slug": "sizing-commercial-ev-charging",
        "category": "Charging",
        "excerpt": "How to match depot charging, route length and dwell time to the real duty cycle of your vehicles.",
        "published": -10,
        "tags": ("Charging", "Fleet Operations"),
        "featured": True,
        "accent": "#1d4ed8",
    },
    {
        "title": "Preventive maintenance schedule for heavy-duty electric trucks",
        "slug": "preventive-maintenance-heavy-duty-ev",
        "category": "Maintenance",
        "excerpt": "The checks that keep battery, brake and thermal systems healthy across demanding routes.",
        "published": -5,
        "tags": ("Maintenance",),
        "featured": False,
        "accent": "#b45309",
    },
    {
        "title": "Inside the first 10,000 electric kilometres",
        "slug": "first-10000-electric-kilometres",
        "category": "Case Study",
        "excerpt": "What one distribution fleet learned after three months of electric cargo operations.",
        "published": -2,
        "tags": ("Case Study", "Fleet Operations"),
        "featured": False,
        "accent": "#7c3aed",
    },
)


def _logo_svg(white: bool = False) -> bytes:
    foreground = "#ffffff" if white else "#0f172a"
    accent = "#22c55e"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="260" height="72" viewBox="0 0 260 72">
  <rect width="260" height="72" rx="12" fill="{'transparent' if white else '#f8fafc'}"/>
  <rect x="10" y="12" width="48" height="48" rx="10" fill="{accent}"/>
  <text x="34" y="46" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">VT</text>
  <text x="72" y="34" fill="{foreground}" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700">VEHICLE</text>
  <text x="72" y="55" fill="{foreground}" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700">TEMPLATE</text>
</svg>""".encode("utf-8")


def _cms_pages(catalog: dict) -> dict[str, dict]:
    cargo_image = catalog["vehicles"]["vt-cargo-10t"].image_url
    hauler_image = catalog["vehicles"]["vt-hauler-6t"].image_url
    cityvan_image = catalog["vehicles"]["vt-cityvan-3t"].image_url
    return {
        "home": {
            "hero": {
                "badge": "Commercial Electric Vehicles",
                "line1": "ELECTRIC",
                "line2": "FLEET.",
                "line3": "REAL WORK.",
                "subtext": (
                    "Purpose-built electric trucks and vans with up to 10-tonne payload, "
                    "fast charging and lower cost per kilometre."
                ),
                "primary_label": "Explore Vehicles",
                "primary_href": "/vehicles",
                "secondary_label": "Request a Quote",
                "secondary_href": "/quote",
                "background_image": cargo_image,
                "background_alt": "VT electric cargo truck on a mountain highway",
                "stats": [
                    {"value": "10 T", "label": "Max Payload"},
                    {"value": "300 km", "label": "Max Range"},
                    {"value": "0 CO₂", "label": "Tailpipe Emissions"},
                ],
            },
            "brand": {
                "badge": "The VT Promise",
                "line1": "ELECTRIC TRUCKS",
                "line2": "BUILT FOR",
                "line3": "COMMERCIAL WORK.",
                "description": (
                    "VT combines electric power, thermal-managed batteries and "
                    "commercial vehicle engineering for demanding routes."
                ),
                "pillars": [
                    {"word": "POWER", "sub": "Instant commercial torque"},
                    {"word": "RANGE", "sub": "Built for long duty cycles"},
                    {"word": "SAVINGS", "sub": "Lower cost per kilometre"},
                    {"word": "CLEAN", "sub": "Zero tailpipe emissions"},
                ],
            },
            "stats": {
                "items": [
                    {
                        "value": 300,
                        "suffix": " KM",
                        "label": "Max Range",
                        "note": "220 to 300 km depending on model",
                    },
                    {
                        "value": 10,
                        "suffix": " TON",
                        "label": "Max Payload",
                        "note": "3 to 10 tonne range",
                    },
                ],
                "extra_value": "LFP",
                "extra_label": "Battery Technology",
                "extra_note": "Thermal-managed lithium iron phosphate packs",
            },
            "performance": {
                "badge": "Performance",
                "line1": "BUILT FOR",
                "line2": "THE CLIMB.",
                "subtext": (
                    "High torque, regenerative braking and battery thermal "
                    "management keep fleets moving on steep routes."
                ),
                "background_image": hauler_image,
                "features": [
                    {
                        "title": "HIGH TORQUE",
                        "desc": "Instant torque for gradients and fully loaded starts.",
                        "icon": "↑",
                    },
                    {
                        "title": "LONG RANGE",
                        "desc": "Routes planned around real commercial duty cycles.",
                        "icon": "◎",
                    },
                    {
                        "title": "HEAVY PAYLOAD",
                        "desc": "Reinforced chassis and cargo platforms up to 10 tonnes.",
                        "icon": "▣",
                    },
                    {
                        "title": "ELECTRIC POWER",
                        "desc": "Quiet, efficient and zero-emission at the tailpipe.",
                        "icon": "E",
                    },
                ],
            },
            "king": {
                "line1": "ELECTRIC",
                "line2": "FLEET.",
                "line3": "",
                "footer": "Vehicle Template · Electric Commercial Vehicles",
                "background_image": cityvan_image,
            },
            "technology": {
                "badge": "Technology",
                "line1": "ENGINEERED WITH",
                "line2": "SMART EV SYSTEMS.",
                "features": [
                    {
                        "title": "LFP BATTERY PACKS",
                        "desc": "Long-cycle battery chemistry with active thermal management.",
                    },
                    {
                        "title": "ELECTRIC POWERTRAIN",
                        "desc": "Instant torque and smooth delivery for heavy commercial loads.",
                    },
                    {
                        "title": "ENERGY RECOVERY",
                        "desc": "Regenerative braking recovers energy on descents and stop-start routes.",
                    },
                    {
                        "title": "FLEET TELEMATICS",
                        "desc": "Battery, range and utilisation data for fleet managers.",
                    },
                ],
            },
            "built_for_road": {
                "badge": "Built for the Road",
                "line1": "MADE FOR",
                "line2": "REAL ROUTES.",
                "subtext": (
                    "From city delivery to regional distribution and high-altitude "
                    "supply routes, the fleet is engineered for commercial work."
                ),
                "routes": [
                    {"label": "Kathmandu Valley", "note": "Urban distribution hub"},
                    {"label": "Kathmandu to Pokhara", "note": "210 km mountain corridor"},
                    {"label": "Mountain Logistics", "note": "High-altitude supply routes"},
                    {"label": "Construction Routes", "note": "Infrastructure projects"},
                    {"label": "Urban Delivery", "note": "Last-mile efficiency"},
                    {"label": "Rural Distribution", "note": "Remote area coverage"},
                ],
            },
            "calculator": {
                "badge": "Savings Calculator",
                "line1": "WHAT DOES DIESEL",
                "line2": "REALLY COST YOU?",
                "subtext": "Compare diesel operating costs with an electric fleet.",
                "cta_label": "Request a Fleet Analysis",
                "defaults": {
                    "monthly_km": 6500,
                    "diesel_price": 195,
                    "fuel_consumption": 20,
                    "work_days": 26,
                },
                "footnote": "Estimates only. Contact us for a route-specific analysis.",
            },
        },
        "vehicles": {
            "label": "Vehicle Range",
            "line1": "VT COMMERCIAL",
            "line2": "VEHICLE FLEET.",
            "subhead": "Electric cargo trucks and vans engineered for commercial duty cycles.",
        },
        "industries": {
            "hero": {
                "label": "Applications",
                "line1": "ACROSS EVERY",
                "line2": "INDUSTRY.",
                "subhead": "One electric platform, configured for the work your fleet actually does.",
            },
            "section": {
                "badge": "Industries",
                "heading_line1": "ONE FLEET.",
                "heading_line2": "MANY MISSIONS.",
                "side_note": "Body options and payloads cover distribution, cold chain, construction and municipal work.",
            },
            "tiles": [
                {
                    "name": "Distribution",
                    "desc": "Regional and last-mile distribution with predictable energy costs.",
                    "image": cityvan_image,
                    "alt": "VT electric delivery van for urban distribution",
                },
                {
                    "name": "Cold Chain",
                    "desc": "Refrigerated and insulated bodies for temperature-sensitive cargo.",
                    "image": hauler_image,
                    "alt": "VT refrigerated electric truck",
                },
                {
                    "name": "Construction",
                    "desc": "Flatbed, tipper and cargo configurations for building materials.",
                    "image": cargo_image,
                    "alt": "VT electric cargo truck for construction logistics",
                },
                {
                    "name": "Municipal Services",
                    "desc": "Quiet, zero-emission vehicles for civic and waste operations.",
                    "image": cityvan_image,
                    "alt": "VT electric van for municipal services",
                },
            ],
        },
        "roi": {
            "header": {
                "badge": "ROI Calculator",
                "line1": "ELECTRIC FLEET",
                "line2": "COST CALCULATOR.",
                "subtext": "Model energy, maintenance and financing costs for your routes.",
            },
            "inputs_heading": "Your Operating Numbers",
            "cta_label": "Request a Fleet Analysis",
            "footnote": "Indicative estimates based on demo operating assumptions.",
            "tab_roi_label": "ROI Calculator",
            "tab_emi_label": "EMI Calculator",
            "emi_heading": "Loan Details",
            "emi_subtext": "Adjust down payment, interest and tenure to see the monthly EMI.",
            "emi_cta_label": "Request a Detailed Quote",
            "defaults": {
                "fleet_size": 1,
                "vehicle_price": 5500000,
                "monthly_km": 6500,
                "diesel_price": 195,
                "fuel_consumption": 20,
                "elec_cost_per_km": 4.03,
                "ownership_years": 8,
                "daily_km": 250,
                "operational_days": 26,
                "km_per_liter": 5,
                "range_per_charge": 275,
                "battery_capacity": 100.27,
                "electricity_tariff": 10.44,
                "maintenance_lubrication": 114400,
                "maintenance_servicing": 52000,
            },
            "emi_defaults": {
                "vehicle_price": 5500000,
                "down_payment_percent": 20,
                "interest_rate": 11,
                "tenure_years": 5,
            },
        },
        "about": {
            "hero": {
                "label": "About",
                "line1": "MADE FOR",
                "line2": "REAL WORK.",
                "subhead": "Electric commercial vehicles engineered for cost, uptime and demanding routes.",
            },
            "highlights": {
                "badge": "Why VT Stands Out",
                "line1": "BUILT FOR THE ROAD.",
                "line2": "BUILT FOR BIG WORK.",
                "subtext": "Lower cost, higher payload and engineering made for commercial duty.",
                "items": [
                    {
                        "title": "Built for big savings.",
                        "accent": "big savings",
                        "desc": "Cut fuel and maintenance costs with efficient electric operation.",
                    },
                    {
                        "title": "Up to 10 Ton payload.",
                        "accent": "10 Ton",
                        "desc": "Commercial-grade chassis and cargo platforms for heavy loads.",
                    },
                    {
                        "title": "A new era of electric cargo.",
                        "accent": "electric cargo",
                        "desc": "Thermal-managed batteries, instant torque and zero emissions.",
                    },
                    {
                        "title": "Built for demanding routes.",
                        "accent": "demanding routes",
                        "desc": "Tested on gradients and high-altitude supply corridors.",
                    },
                ],
            },
            "why_choose_us": {
                "badge": "The Advantage",
                "heading": "WHY VT?",
                "side_note": "Built differently. Performs differently. Costs less to run.",
                "reasons": [
                    {
                        "title": "BUILT FOR COMMERCIAL WORK",
                        "desc": "Designed around payload, range, durability and driver experience.",
                    },
                    {
                        "title": "ELECTRIC PERFORMANCE",
                        "desc": "Instant torque that performs on gradients and heavy loads.",
                    },
                    {
                        "title": "LOWER OPERATING COST",
                        "desc": "Fewer service points and lower energy cost per kilometre.",
                    },
                    {
                        "title": "READY FOR THE ROAD",
                        "desc": "Engineered for real commercial routes and working conditions.",
                    },
                ],
            },
        },
        "stories": {
            "label": "Stories",
            "line1": "FROM THE",
            "line2": "FIELD.",
            "subhead": "Field reports, customer wins and engineering notes from the electric fleet journey.",
        },
        "contact": {
            "hero": {
                "label": "Get in Touch",
                "line1": "Talk to our",
                "line2": "fleet team.",
                "subhead": "Questions about vehicles, after-sales and general enquiries are answered within one business day.",
            },
            "info": {
                "company_name": COMPANY,
                "address_primary": "VT Central Fleet & Service Hub, Kathmandu",
                "address_secondary": "VT West Regional Distribution Center, Lalitpur",
                "maps_link": "https://maps.google.com/",
                "phone_label": "Sales & Service",
                "phone": "+977-9800000001",
                "email_label": "Email",
                "email": "info@vehicletemplate.example.com",
            },
            "map": {
                "badge": "Visit Us",
                "heading": "Find us in Kathmandu.",
                "subtext": "Walk in for a closer look at the electric fleet and workshop.",
                "embed_url": "",
                "caption": "Vehicle Template showroom and service centre, Kathmandu",
            },
        },
        "quote": {
            "hero": {
                "label": "Request a Quote",
                "line1": "BUILD YOUR",
                "line2": "FLEET QUOTE.",
                "subhead": "Tell us about your routes, payload and fleet size for a detailed proposal.",
            },
        },
        "global": {
            "brand": {
                "logo_url": "/media/branding/vt-logo.svg",
                "logo_white_url": "/media/branding/vt-logo-white.svg",
                "logo_alt": COMPANY,
            },
            "cta": {
                "badge": "Experience VT",
                "line1": "READY TO",
                "line2": "GO ELECTRIC?",
                "subtext": "Request a quote and plan your fleet transition with our team.",
                "primary_label": "Request a Quote",
                "primary_href": "/quote",
                "secondary_label": "View Vehicles",
                "secondary_href": "/vehicles",
                "background_image": cargo_image,
            },
            "footer": {
                "tagline_line1": "Electric",
                "tagline_line2": "Fleet.",
                "description": "Electric commercial vehicles engineered for demanding routes and lower operating costs.",
                "contact_heading": "Contact",
                "contact_subtext": "Questions about vehicles, test drives or service? Get in touch with our team.",
                "bottom_brand_text": "VEHICLE TEMPLATE",
                "created_by_label": "Built with",
                "created_by_name": "Vehicle Template",
                "created_by_url": "",
            },
        },
    }


def seed_content(stock: dict, crm: dict, catalog: dict, users: dict, dealers: dict) -> dict[str, object]:
    log("Stories, CMS, notifications and audit log")
    logo_url = write_media_file("branding/vt-logo.svg", _logo_svg(False))
    white_logo_url = write_media_file("branding/vt-logo-white.svg", _logo_svg(True))
    assert logo_url and white_logo_url

    tags = {}
    for name, slug in TAGS:
        tag, _ = Tag.objects.update_or_create(name=name, defaults={"slug": slug})
        tags[name] = tag

    default_author = users.get("template")
    stories = {}
    for index, spec in enumerate(STORIES, start=1):
        image_url = write_media_file(
            f"stories/{spec['slug']}.svg",
            svg_placeholder(spec["title"], spec["category"], spec["accent"]),
        )
        story, _ = Story.objects.update_or_create(
            slug=spec["slug"],
            defaults={
                "title": spec["title"],
                "excerpt": spec["excerpt"],
                "content": (
                    f"<p>{spec['excerpt']}</p>"
                    "<h2>What we measured</h2>"
                    "<p>Energy use, service intervals, uptime and cost per kilometre "
                    "were tracked across a representative commercial duty cycle.</p>"
                    "<h2>What it means for fleets</h2>"
                    "<p>Electric operation shifts cost from fuel and maintenance to "
                    "energy planning and driver training. Route planning and depot "
                    "charging are the two biggest levers.</p>"
                    "<p>Vehicle Template provides the vehicle, service and reporting "
                    "tools needed to run a measurable pilot.</p>"
                ),
                "category": spec["category"],
                "image_url": image_url,
                "alt_text": spec["title"],
                "author": default_author,
                "author_role": "Fleet Insights Team",
                "author_bio": "Notes from the Vehicle Template operations and engineering team.",
                "published_date": day(spec["published"]),
                "status": "published",
                "is_featured": spec["featured"],
                "sort_order": index,
                "seo_title": spec["title"],
                "seo_description": spec["excerpt"],
            },
        )
        story.tags.set([tags[name] for name in spec["tags"] if name in tags])
        stories[spec["slug"]] = story

    pages = {}
    for page_key, data in _cms_pages(catalog).items():
        page, _ = CmsPage.objects.update_or_create(
            page=page_key,
            defaults={"data": data, "updated_by": default_author},
        )
        pages[page_key] = page

    notifications = {}
    notification_specs = (
        (
            "SERVICE_OVERDUE",
            "Service overdue: VTVIN2026000001",
            "The 6-month / 5,000 km service is overdue by more than 60 days.",
            "/dashboard/service-records",
            True,
        ),
        (
            "WARRANTY_EXPIRING",
            "Battery warranty expiring soon",
            "A sold unit reaches the end of its battery warranty in the next 60 days.",
            "/dashboard/units",
            False,
        ),
        (
            "RESERVATION_EXPIRING",
            "Reservation expires in 7 days",
            "The reserved CityVan unit will be released if the deposit is not confirmed.",
            "/dashboard/units",
            False,
        ),
        (
            "DOCUMENT_EXPIRING",
            "Document expiring this month",
            "A customer compliance document is due for renewal.",
            "/dashboard/documents",
            False,
        ),
    )
    for index, (kind, title, message, link, read) in enumerate(notification_specs, start=1):
        notification, _ = Notification.objects.update_or_create(
            recipient=default_author,
            dedup_key=f"demo-{kind.lower()}-{index}",
            defaults={
                "notification_type": kind,
                "title": title,
                "message": message,
                "link": link,
                "is_read": read,
            },
        )
        notifications[title] = notification

    AuditLog.objects.filter(source="seed").delete()
    audit_specs = (
        ("LOGIN", users.get("template"), None, "", "Signed in to the admin console."),
        ("CREATE", users.get("sales.exec"), Lead, str(crm["leads"]["sunrise"].id), "Created a new fleet lead."),
        ("UPDATE", users.get("sales.manager"), Quotation, "", "Accepted the fleet quotation."),
        ("CREATE", users.get("sales.exec"), Sale, "", "Recorded a vehicle sale."),
        ("CREATE", users.get("service.manager"), ServiceRecord, "", "Opened a workshop service order."),
        ("UPDATE", users.get("employee"), VehicleUnit, "", "Moved a unit to ready for sale."),
        ("CREATE", users.get("hr.admin"), None, "", "Added an employee record."),
        ("UPDATE", users.get("template"), None, "", "Updated the home page content."),
    )
    for index, (action, user, model, object_id, summary) in enumerate(audit_specs, start=1):
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(model) if model else None,
            object_id=object_id,
            action=action,
            summary=summary,
            changed_by=user,
            source="seed",
            timestamp=stamp(-index, 10 + index),
        )

    log(f"  stories: {len(stories)}, CMS pages: {len(pages)}, notifications: {len(notifications)}")
    return {"stories": stories, "tags": tags, "cms_pages": pages, "notifications": notifications}
