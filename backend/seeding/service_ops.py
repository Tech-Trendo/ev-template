"""Servicing, website enquiries, events and event visitors."""

from __future__ import annotations

from django.core.files.base import ContentFile

from events.models import Event, EventVisitor, InterestLevel
from leads.models import Enquiry
from servicing.models import ServiceEntryImage, ServiceRecord, ServiceRecordPart

from .helpers import day, dec, log, stamp, tiny_png

VEHICLE_SLUGS = {
    "Cargo 10T": "vt-cargo-10t",
    "Hauler 6T": "vt-hauler-6t",
    "CityVan 3T": "vt-cityvan-3t",
}


def seed_service_ops(catalog: dict, crm: dict, stock: dict, users: dict, dealers: dict) -> dict[str, object]:
    log("Servicing, enquiries and events")
    units = stock["units"]
    customers = crm["customers"]
    leads = crm["leads"]
    catalogue = catalog["vehicles"]
    central = dealers.get("VT Central Fleet & Service Hub")
    service_manager = users.get("service.manager")
    technician = users.get("technician")

    def vehicle_for(unit):
        slug = VEHICLE_SLUGS.get(unit.vehicle_model.model_name)
        return catalogue.get(slug) if slug else None

    service_specs = (
        {
            "vro_no": "SR-2026-0001",
            "unit": "hauler_sold",
            "status": "completed",
            "date_received": -13,
            "date_completed": -11,
            "actual_delivered": -11,
            "odometer": 3150,
            "job_type": "Periodic service",
            "job": "First periodic service and software update.",
            "action": "Inspected battery, brakes and cooling system; updated BMS software.",
            "notes": "Vehicle delivered after road test. Customer updated by phone.",
            "labour": "3500",
            "parts": "7200",
            "estimated": "12000",
            "technician": "Manoj Yadav",
            "advisor": "Suman Thapa",
        },
        {
            "vro_no": "SR-2026-0002",
            "unit": "cityvan_sold",
            "status": "in_progress",
            "date_received": -1,
            "date_completed": None,
            "actual_delivered": None,
            "odometer": 950,
            "job_type": "Customer complaint",
            "job": "Check intermittent infotainment restart.",
            "action": "Diagnostic scan in progress; checking 12V auxiliary system.",
            "notes": "Customer asked for same-day update.",
            "labour": "0",
            "parts": "0",
            "estimated": "5000",
            "technician": "Manoj Yadav",
            "advisor": "Suman Thapa",
        },
        {
            "vro_no": "SR-2026-0003",
            "unit": "cargo_sold_overdue",
            "status": "waiting_for_parts",
            "date_received": -3,
            "date_completed": None,
            "actual_delivered": None,
            "odometer": 6850,
            "job_type": "Overdue service",
            "job": "6-month/5,000 km service plus brake inspection.",
            "action": "Service started; waiting for front brake pads.",
            "notes": "Parts expected within two working days.",
            "labour": "4500",
            "parts": "18500",
            "estimated": "24000",
            "technician": "Manoj Yadav",
            "advisor": "Suman Thapa",
        },
        {
            "vro_no": "SR-2026-0004",
            "unit": "cargo_sold_new",
            "status": "delivered",
            "date_received": -6,
            "date_completed": -4,
            "actual_delivered": -4,
            "odometer": 280,
            "job_type": "PDI follow-up",
            "job": "Delivery follow-up check and accessory fitting.",
            "action": "Fitted mud flaps and verified charging cable operation.",
            "notes": "Vehicle returned to customer.",
            "labour": "1500",
            "parts": "3200",
            "estimated": "5000",
            "technician": "Manoj Yadav",
            "advisor": "Suman Thapa",
        },
    )
    service_records = {}
    for spec in service_specs:
        unit = units[spec["unit"]]
        customer = unit.current_customer or unit.customer
        record, _ = ServiceRecord.objects.update_or_create(
            vro_no=spec["vro_no"],
            defaults={
                "chassis_number": unit.vin_chassis_no,
                "vehicle_unit": unit,
                "vehicle": vehicle_for(unit),
                "customer": customer,
                "lead": customer.lead if customer else None,
                "dealer": unit.dealer or central,
                "dealer_name": unit.dealer.name if unit.dealer else central.name,
                "status": spec["status"],
                "technician": technician,
                "date_received": day(spec["date_received"]),
                "time_received": "09:30",
                "date_completed": day(spec["date_completed"]) if spec["date_completed"] else None,
                "actual_delivered_at": stamp(spec["actual_delivered"], 16)
                if spec["actual_delivered"]
                else None,
                "v_reg_no": f"BA-{unit.id}-PA" if unit.status == "SOLD" else "",
                "battery_kw": unit.battery_power_kw,
                "motor_no": unit.motor_no,
                "date_of_sale": unit.sold_date,
                "ev_company": "EV OS",
                "customer_name": customer.name if customer else unit.customer_name,
                "customer_address": customer.address if customer else "",
                "customer_mobile": customer.phone if customer else "",
                "estimated_cost": dec(spec["estimated"]),
                "labour_cost": dec(spec["labour"]),
                "parts_cost": dec(spec["parts"]),
                "job_description": spec["job"],
                "action_taken": spec["action"],
                "service_notes": spec["notes"],
                "odometer_reading": spec["odometer"],
                "entry_inventory": {
                    "charging_cable": True,
                    "toolkit": True,
                    "documents": True,
                },
                "service_advisor": spec["advisor"],
                "work_forwarded_to": "Workshop bay 2",
                "customer_undertaking_agreed": True,
                "customer_signature": customer.name if customer else "Customer",
                "job_type": spec["job_type"],
                "technician_name": spec["technician"],
                "source": "seed",
                "created_by": service_manager,
            },
        )
        ServiceRecordPart.objects.filter(record=record).delete()
        if spec["status"] in ("completed", "delivered", "in_progress", "waiting_for_parts"):
            ServiceRecordPart.objects.bulk_create(
                [
                    ServiceRecordPart(
                        record=record,
                        part_name="Front brake pad set" if spec["status"] == "waiting_for_parts" else "EV service kit",
                        part_number="VT-BRK-001" if spec["status"] == "waiting_for_parts" else "VT-SVC-100",
                        quantity=1,
                        labour_cost=dec(spec["labour"]),
                        cost=dec(spec["parts"]),
                        created_by=service_manager,
                    ),
                    ServiceRecordPart(
                        record=record,
                        part_name="Cabin air filter",
                        part_number="VT-FLT-014",
                        quantity=2,
                        labour_cost=dec("0"),
                        cost=dec("1800"),
                        created_by=service_manager,
                    ),
                ]
            )
        ServiceEntryImage.objects.filter(record=record).exclude(item_key="vehicle_front").delete()
        if spec["status"] in ("completed", "delivered"):
            if not ServiceEntryImage.objects.filter(record=record, item_key="vehicle_front").exists():
                ServiceEntryImage.objects.create(
                    record=record,
                    item_key="vehicle_front",
                    image=ContentFile(tiny_png(), name=f"{spec['vro_no'].lower()}-front.png"),
                )
        else:
            ServiceEntryImage.objects.filter(record=record, item_key="vehicle_front").delete()
        service_records[spec["vro_no"]] = record

    # External / walk-in workshop order without a registered unit.
    external, _ = ServiceRecord.objects.update_or_create(
        vro_no="SR-2026-0005",
        defaults={
            "is_external": True,
            "chassis_number": "EXT-VT-2026-0001",
            "vehicle": None,
            "vehicle_unit": None,
            "customer": None,
            "dealer": central,
            "dealer_name": central.name,
            "status": "received",
            "technician": technician,
            "date_received": day(-1),
            "time_received": "11:15",
            "ev_company": "Independent Fleet Operator",
            "customer_name": "Walk-in EV Owner",
            "customer_address": "Kathmandu",
            "customer_mobile": "+977-9800000098",
            "estimated_cost": dec("8000"),
            "job_description": "Inspect high-voltage charging fault reported by owner.",
            "action_taken": "Initial safety check completed; diagnosis queued.",
            "service_notes": "External vehicle; service history unavailable.",
            "odometer_reading": 12400,
            "service_advisor": "Suman Thapa",
            "job_type": "Diagnostic",
            "technician_name": "Manoj Yadav",
            "source": "seed",
            "created_by": service_manager,
        },
    )
    service_records["external"] = external

    enquiry_specs = (
        ("sunrise", "quote", "new", "Requesting a fleet quotation for two Cargo 10T units."),
        ("coldchain", "test_drive", "in_progress", "Would like a refrigerated demo unit for one day."),
        ("citymart", "quote", "closed", "Quotation for three CityVan 3T units."),
        ("greenvalley", "contact", "new", "Question about flatbed payload and finance options."),
        ("waste", "test_drive", "in_progress", "Requesting a route trial for waste collection."),
        ("resorts", "contact", "closed", "General information about charging requirements."),
    )
    enquiries = {}
    for lead_key, enquiry_type, status, message in enquiry_specs:
        lead = leads[lead_key]
        model = lead.vehicle_model
        vehicle = catalogue.get(VEHICLE_SLUGS.get(model.model_name)) if model else None
        enquiry, _ = Enquiry.objects.update_or_create(
            email=lead.email,
            name=lead.name,
            defaults={
                "company": lead.company,
                "phone": lead.phone,
                "vehicle": vehicle,
                "enquiry_type": enquiry_type,
                "message": message,
                "status": status,
                "lead": lead,
            },
        )
        enquiries[lead_key] = enquiry

    events = {}
    event_specs = (
        (
            "Green Fleet Expo 2026",
            -22,
            -20,
            (
                ("Sujata Koirala", "Himalayan Retail Group", "Hot"),
                ("Nabin Bhandari", "Nepal Courier Service", "Warm"),
                ("Rachana Shrestha", "Green Energy Nepal", "Normal Inquiry"),
                ("Dipesh Khadka", "Kathmandu Metropolitan City", "Warm"),
            ),
        ),
        (
            "Electric Logistics Open Day",
            12,
            13,
            (
                ("Pratima Gurung", "Pokhara Fresh Foods", "Hot"),
                ("Arjun Neupane", "Lumbini Distributors", "Warm"),
                ("Sneha Basnet", "Chitwan Dairy", "Normal Inquiry"),
                ("Kiran Bhattarai", "Janakpur Logistics", "Cold"),
            ),
        ),
    )
    interest_levels = {level.name: level for level in InterestLevel.objects.all()}
    visitors = {}
    for event_index, (name, start, end, rows) in enumerate(event_specs, start=1):
        event, _ = Event.objects.update_or_create(
            name=name,
            defaults={"start_date": day(start), "end_date": day(end)},
        )
        events[name] = event
        for row_index, (visitor_name, company, interest) in enumerate(rows, start=1):
            phone = f"+977-981100{event_index}{row_index:02d}"
            visitor, _ = EventVisitor.objects.update_or_create(
                event=event,
                phone=phone,
                defaults={
                    "name": visitor_name,
                    "email": f"visitor{event_index}{row_index}@evos.example.com",
                    "company": company,
                    "address": "Kathmandu, Nepal",
                    "notes": "Captured at the EV OS demo event.",
                    "remarks": "Interested in fleet electrification.",
                    "interest_level": interest_levels.get(interest),
                    "vehicle": catalogue.get("vt-cargo-10t" if row_index % 2 else "vt-cityvan-3t"),
                    "visited_at": stamp(start + row_index, 11),
                },
            )
            visitors[f"{event_index}-{row_index}"] = visitor

    log(f"  service records: {len(service_records)}, enquiries: {len(enquiries)}")
    return {
        "service_records": service_records,
        "enquiries": enquiries,
        "events": events,
        "event_visitors": visitors,
    }
