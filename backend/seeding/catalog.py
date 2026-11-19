"""EV catalogue: body types, models, variants, specs and public vehicle pages."""

from __future__ import annotations

from inventory.models import (
    VehicleBodyType,
    VehicleModel,
    VehicleModelSpec,
    VehicleVariant,
)
from inventory.product_catalog import seed_product_catalog
from vehicles.models import (
    Specification,
    SpecificationGroup,
    Vehicle,
    VehicleFeature,
    VehicleGalleryImage,
    VehicleStat,
)

from .helpers import BRAND, log, svg_placeholder, write_media_file

MODEL_SPECS = (
    {
        "model_name": "Cargo 10T",
        "battery_power_kw": "164.86",
        "motor_power_kw": "350",
        "seating_capacity": 2,
        "charger_type": "DC_FAST",
        "colors": ["Pearl White", "Graphite Grey", "Ocean Blue"],
        "vehicle_warranty_months": 36,
        "vehicle_warranty_km": 100000,
        "battery_warranty_months": 60,
        "battery_warranty_km": 200000,
        "motor_warranty_months": 48,
        "service_interval_months": 6,
        "service_interval_km": 5000,
        "low_stock_threshold": 3,
    },
    {
        "model_name": "Hauler 6T",
        "battery_power_kw": "100.27",
        "motor_power_kw": "280",
        "seating_capacity": 2,
        "charger_type": "DC_FAST",
        "colors": ["Pearl White", "Silver", "Forest Green"],
        "vehicle_warranty_months": 36,
        "vehicle_warranty_km": 100000,
        "battery_warranty_months": 60,
        "battery_warranty_km": 200000,
        "motor_warranty_months": 48,
        "service_interval_months": 6,
        "service_interval_km": 5000,
        "low_stock_threshold": 3,
    },
    {
        "model_name": "CityVan 3T",
        "battery_power_kw": "60",
        "motor_power_kw": "150",
        "seating_capacity": 2,
        "charger_type": "AC_7",
        "colors": ["Pearl White", "Sky Blue", "Sunset Orange"],
        "vehicle_warranty_months": 36,
        "vehicle_warranty_km": 100000,
        "battery_warranty_months": 60,
        "battery_warranty_km": 160000,
        "motor_warranty_months": 48,
        "service_interval_months": 12,
        "service_interval_km": 10000,
        "low_stock_threshold": 4,
    },
)

CATALOG = (
    {
        "slug": "vt-cargo-10t",
        "name": "VT Cargo 10T",
        "model_name": "Cargo 10T",
        "category": "Heavy Commercial",
        "payload": "10,000 kg",
        "range_km": "300 km",
        "battery": "164.86 kWh",
        "tag": "Heavy Duty",
        "accent": "#0f766e",
        "description": (
            "A 10-tonne electric cargo truck built for regional distribution, "
            "industrial supply chains and long-haul commercial routes."
        ),
        "hero_heading": "CARRY MORE. GO FURTHER.",
        "hero_description": (
            "Zero-emission heavy haulage with a 300 km range, fast DC charging "
            "and a reinforced cargo platform."
        ),
        "engineered_heading": "ENGINEERED FOR HEAVY LOADS",
        "engineered_description": (
            "A strengthened chassis, regenerative braking and thermal-managed "
            "battery pack keep every route productive."
        ),
        "stats": (
            ("Payload", "10,000 kg"),
            ("Range", "300 km"),
            ("Battery", "164.86 kWh"),
            ("DC Charge", "45 min"),
            ("Motor", "350 kW"),
            ("Warranty", "5 years"),
        ),
        "features": (
            ("Heavy-duty platform", "Reinforced cargo deck rated for 10-tonne duty cycles."),
            ("Fast DC charging", "10-80% charge in around 45 minutes on a 120 kW charger."),
            ("Smart energy recovery", "Regenerative braking extends range on hilly routes."),
            ("Fleet telematics", "Live battery, range and utilisation data for fleet managers."),
        ),
        "groups": (
            (
                "Performance",
                (
                    ("Motor power", "350 kW"),
                    ("Torque", "1,200 Nm"),
                    ("Top speed", "90 km/h"),
                    ("Drivetrain", "Rear-wheel drive"),
                ),
            ),
            (
                "Battery & Charging",
                (
                    ("Battery capacity", "164.86 kWh"),
                    ("Battery chemistry", "LFP"),
                    ("DC fast charging", "120 kW"),
                    ("AC charging", "22 kW"),
                ),
            ),
            (
                "Dimensions & Capacity",
                (
                    ("Payload", "10,000 kg"),
                    ("Cargo length", "20 FT"),
                    ("GVW", "18,000 kg"),
                    ("Wheelbase", "5,300 mm"),
                ),
            ),
            (
                "Safety & Comfort",
                (
                    ("Braking", "ABS + EBD, air brake"),
                    ("Driver aids", "Reverse camera and radar"),
                    ("Cabin", "Air-conditioned day cab"),
                    ("Seating", "2 adults"),
                ),
            ),
        ),
    },
    {
        "slug": "vt-hauler-6t",
        "name": "VT Hauler 6T",
        "model_name": "Hauler 6T",
        "category": "Medium Commercial",
        "payload": "6,000 kg",
        "range_km": "240 km",
        "battery": "100.27 kWh",
        "tag": "Most Popular",
        "accent": "#1d4ed8",
        "description": (
            "A versatile 6-tonne electric hauler for city-to-district logistics, "
            "wholesale delivery and fleet replacement programmes."
        ),
        "hero_heading": "BUILT FOR EVERY ROUTE.",
        "hero_description": (
            "The flexible middleweight EV truck that balances payload, range "
            "and operating cost."
        ),
        "engineered_heading": "THE BACKBONE OF YOUR FLEET",
        "engineered_description": (
            "A compact turning circle, multiple body options and low maintenance "
            "make the Hauler 6T ready for daily commercial work."
        ),
        "stats": (
            ("Payload", "6,000 kg"),
            ("Range", "240 km"),
            ("Battery", "100.27 kWh"),
            ("DC Charge", "40 min"),
            ("Motor", "280 kW"),
            ("Warranty", "5 years"),
        ),
        "features": (
            ("Body-flexible chassis", "Configure as a container, flatbed or insulated body."),
            ("Proven battery pack", "LFP chemistry with active thermal management."),
            ("Low running cost", "Up to 70% lower energy cost than a diesel equivalent."),
            ("Connected fleet", "Remote diagnostics and service reminders included."),
        ),
        "groups": (
            (
                "Performance",
                (
                    ("Motor power", "280 kW"),
                    ("Torque", "1,000 Nm"),
                    ("Top speed", "90 km/h"),
                    ("Drivetrain", "Rear-wheel drive"),
                ),
            ),
            (
                "Battery & Charging",
                (
                    ("Battery capacity", "100.27 kWh"),
                    ("Battery chemistry", "LFP"),
                    ("DC fast charging", "100 kW"),
                    ("AC charging", "22 kW"),
                ),
            ),
            (
                "Dimensions & Capacity",
                (
                    ("Payload", "6,000 kg"),
                    ("Cargo length", "16 FT / 20 FT"),
                    ("GVW", "12,500 kg"),
                    ("Wheelbase", "4,500 mm"),
                ),
            ),
            (
                "Safety & Comfort",
                (
                    ("Braking", "ABS + EBD"),
                    ("Driver aids", "Reverse camera"),
                    ("Cabin", "Air-conditioned"),
                    ("Seating", "2 adults"),
                ),
            ),
        ),
    },
    {
        "slug": "vt-cityvan-3t",
        "name": "VT CityVan 3T",
        "model_name": "CityVan 3T",
        "category": "Urban Logistics",
        "payload": "3,000 kg",
        "range_km": "220 km",
        "battery": "60 kWh",
        "tag": "Urban Agile",
        "accent": "#b45309",
        "description": (
            "A compact zero-emission van for last-mile delivery, service fleets "
            "and narrow urban streets."
        ),
        "hero_heading": "CLEAN. QUIET. EFFICIENT.",
        "hero_description": (
            "Right-sized electric logistics for dense city routes and "
            "low-emission zones."
        ),
        "engineered_heading": "MADE FOR THE LAST MILE",
        "engineered_description": (
            "A tight turning radius, car-like cabin and fast AC charging make "
            "the CityVan 3T easy to live with every day."
        ),
        "stats": (
            ("Payload", "3,000 kg"),
            ("Range", "220 km"),
            ("Battery", "60 kWh"),
            ("AC Charge", "7 kW"),
            ("Motor", "150 kW"),
            ("Warranty", "5 years"),
        ),
        "features": (
            ("Compact footprint", "Designed for narrow lanes, markets and loading bays."),
            ("Fast AC charging", "Overnight charging with a standard 7 kW wallbox."),
            ("Low floor cargo bay", "Easy loading for parcels and service equipment."),
            ("Quiet operation", "Ideal for early-morning and residential deliveries."),
        ),
        "groups": (
            (
                "Performance",
                (
                    ("Motor power", "150 kW"),
                    ("Torque", "600 Nm"),
                    ("Top speed", "90 km/h"),
                    ("Drivetrain", "Front-wheel drive"),
                ),
            ),
            (
                "Battery & Charging",
                (
                    ("Battery capacity", "60 kWh"),
                    ("Battery chemistry", "LFP"),
                    ("DC fast charging", "60 kW"),
                    ("AC charging", "7 kW"),
                ),
            ),
            (
                "Dimensions & Capacity",
                (
                    ("Payload", "3,000 kg"),
                    ("Cargo volume", "12 m³"),
                    ("GVW", "5,500 kg"),
                    ("Wheelbase", "3,200 mm"),
                ),
            ),
            (
                "Safety & Comfort",
                (
                    ("Braking", "ABS + EBD"),
                    ("Driver aids", "Reverse camera and sensors"),
                    ("Cabin", "Air-conditioned"),
                    ("Seating", "2 adults"),
                ),
            ),
        ),
    },
)

BODY_TYPES = (
    ("Cargo Truck", "Standard cargo body for general freight."),
    ("Delivery Van", "Enclosed van body for parcel and last-mile delivery."),
    ("Refrigerated Truck", "Temperature-controlled body for cold-chain cargo."),
    ("Flatbed", "Open flat platform for oversized or building materials."),
    ("Tipper", "Hydraulic dump body for construction and aggregates."),
    ("Tanker", "Tank body for liquids, milk and industrial fluids."),
    ("Passenger Shuttle", "Seated passenger body for staff and shuttle routes."),
)

BODY_BY_VARIANT = {
    "Chassis": "Flatbed",
    "Hi-Deck Container": "Cargo Truck",
    "Closed Container": "Cargo Truck",
    "Refrigerated Container": "Refrigerated Truck",
    "Flat Body": "Flatbed",
    "Milk Tanker": "Tanker",
    "Insulated Body": "Refrigerated Truck",
}


def seed_catalog(dealers: dict) -> dict[str, object]:
    log("Vehicle catalogue")
    body_types = {}
    for index, (name, description) in enumerate(BODY_TYPES):
        body, _ = VehicleBodyType.objects.update_or_create(
            name=name,
            defaults={
                "description": description,
                "is_active": True,
                "sort_order": index,
            },
        )
        body_types[name] = body

    models = {}
    for spec in MODEL_SPECS:
        model, _ = VehicleModel.objects.update_or_create(
            brand=BRAND,
            model_name=spec["model_name"],
            defaults={
                "battery_power_kw": spec["battery_power_kw"],
                "motor_power_kw": spec["motor_power_kw"],
                "seating_capacity": spec["seating_capacity"],
                "charger_type": spec["charger_type"],
                "default_color_options": spec["colors"],
                "low_stock_threshold": spec["low_stock_threshold"],
                "vehicle_warranty_months": spec["vehicle_warranty_months"],
                "vehicle_warranty_km": spec["vehicle_warranty_km"],
                "battery_warranty_months": spec["battery_warranty_months"],
                "battery_warranty_km": spec["battery_warranty_km"],
                "motor_warranty_months": spec["motor_warranty_months"],
                "service_interval_months": spec["service_interval_months"],
                "service_interval_km": spec["service_interval_km"],
                "is_active": True,
            },
        )
        models[spec["model_name"]] = model

    catalog_stats = seed_product_catalog()
    log(f"  product catalogue variants/specs: {catalog_stats}")

    for model in models.values():
        for variant in VehicleVariant.objects.filter(vehicle_model=model):
            body_name = BODY_BY_VARIANT.get(variant.name)
            body = body_types.get(body_name)
            if body and variant.body_type_id != body.id:
                variant.body_type = body
                variant.save(update_fields=["body_type"])

    dealer = dealers.get("VT Central Fleet & Service Hub")
    for item in CATALOG:
        hero_url = write_media_file(
            f"vehicles/{item['slug']}.svg",
            svg_placeholder(item["name"], item["category"], item["accent"]),
        )
        gallery_url = write_media_file(
            f"vehicles/{item['slug']}-detail.svg",
            svg_placeholder(item["name"], "Built for commercial duty", item["accent"]),
        )
        vehicle, _ = Vehicle.objects.update_or_create(
            slug=item["slug"],
            defaults={
                "name": item["name"],
                "category": item["category"],
                "payload": item["payload"],
                "range_km": item["range_km"],
                "battery": item["battery"],
                "tag": item["tag"],
                "alt_text": f"{item['name']} electric commercial vehicle",
                "description": item["description"],
                "hero_heading": item["hero_heading"],
                "hero_description": item["hero_description"],
                "engineered_heading": item["engineered_heading"],
                "engineered_description": item["engineered_description"],
                "image_url": hero_url,
                "is_active": True,
                "dealer": dealer,
            },
        )
        VehicleStat.objects.filter(vehicle=vehicle).delete()
        VehicleStat.objects.bulk_create(
            [
                VehicleStat(vehicle=vehicle, label=label, value=value, sort_order=index)
                for index, (label, value) in enumerate(item["stats"])
            ]
        )
        VehicleFeature.objects.filter(vehicle=vehicle).delete()
        VehicleFeature.objects.bulk_create(
            [
                VehicleFeature(
                    vehicle=vehicle,
                    title=title,
                    description=description,
                    icon="zap" if index == 0 else "shield",
                    sort_order=index,
                )
                for index, (title, description) in enumerate(item["features"])
            ]
        )
        SpecificationGroup.objects.filter(vehicle=vehicle).delete()
        for group_index, (title, rows) in enumerate(item["groups"]):
            group = SpecificationGroup.objects.create(
                vehicle=vehicle, title=title, sort_order=group_index
            )
            Specification.objects.bulk_create(
                [
                    Specification(
                        group=group,
                        label=label,
                        value=value,
                        sort_order=index,
                    )
                    for index, (label, value) in enumerate(rows)
                ]
            )
        VehicleGalleryImage.objects.filter(vehicle=vehicle).delete()
        VehicleGalleryImage.objects.bulk_create(
            [
                VehicleGalleryImage(
                    vehicle=vehicle,
                    image_url=hero_url,
                    alt_text=f"{item['name']} front view",
                    caption="Exterior",
                    sort_order=0,
                ),
                VehicleGalleryImage(
                    vehicle=vehicle,
                    image_url=gallery_url,
                    alt_text=f"{item['name']} in commercial service",
                    caption="In service",
                    sort_order=1,
                ),
            ]
        )
        log(f"  catalogue page {item['name']}")

    return {
        "models": models,
        "body_types": body_types,
        "vehicles": {item["slug"]: Vehicle.objects.get(slug=item["slug"]) for item in CATALOG},
    }
