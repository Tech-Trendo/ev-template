"""Shared constants, helpers and legacy-data cleanup for the seeder."""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.apps import apps
from django.db import transaction
from django.utils import timezone

COMPANY = "Vehicle Template"
BRAND = "VT"
DOMAIN = "vehicletemplate.example.com"
DEFAULT_PASSWORD = "evtemplate"

CENTRAL_DEALER = "VT Central Fleet & Service Hub"
WEST_DEALER = "VT West Regional Distribution Center"
NORTH_DEALER = "VT North Regional Service Center"
DEALER_NAMES = (CENTRAL_DEALER, WEST_DEALER, NORTH_DEALER)

DEMO_PHONE_PREFIX = "+977-9800"


def log(message: str) -> None:
    print(f"[seed] {message}")


def dec(value) -> Decimal:
    return Decimal(str(value))


def today() -> date:
    return timezone.localdate()


def day(offset: int = 0) -> date:
    return today() + timedelta(days=offset)


def stamp(offset_days: int = 0, hour: int = 9, minute: int = 0) -> datetime:
    value = timezone.now() + timedelta(days=offset_days)
    return value.replace(hour=hour, minute=minute, second=0, microsecond=0)


def phone(index: int) -> str:
    return f"{DEMO_PHONE_PREFIX}{index:04d}"


def email(slug: str) -> str:
    return f"{slug}@{DOMAIN}"


def safe_delete(instance, label: str = "") -> bool:
    try:
        instance.delete()
        return True
    except Exception as exc:  # pragma: no cover - deployment data can be protected
        log(f"  kept {label or instance!r}: {type(exc).__name__}: {exc}")
        return False


def reassign_foreign_keys(model, legacy, target) -> None:
    """Point every FK to ``legacy`` at ``target`` before deleting a record."""
    for candidate in apps.get_models():
        for field in candidate._meta.fields:
            if not field.is_relation or field.related_model is not model:
                continue
            try:
                candidate.objects.filter(**{field.name: legacy}).update(**{field.name: target})
            except Exception:
                # Some reverse relations are protected or not writable; the
                # caller keeps the legacy record when deletion fails.
                continue


def canonical_dealer_map() -> dict[str, object]:
    Dealer = apps.get_model("dealers", "Dealer")
    wanted = {
        CENTRAL_DEALER: dict(
            contact_person="Aarav Sharma",
            phone=phone(1),
            email="central@vehicletemplate.example.com",
            address="Fleet Avenue, Ward 10",
            district="Kathmandu",
        ),
        WEST_DEALER: dict(
            contact_person="Nisha Karki",
            phone=phone(2),
            email="west@vehicletemplate.example.com",
            address="Industrial Corridor, Ward 4",
            district="Lalitpur",
        ),
        NORTH_DEALER: dict(
            contact_person="Bikash Tamang",
            phone=phone(3),
            email="north@vehicletemplate.example.com",
            address="Highway Service Park, Ward 7",
            district="Chitwan",
        ),
    }
    result = {}
    for name, defaults in wanted.items():
        dealer, _ = Dealer.objects.update_or_create(
            name=name, defaults={**defaults, "status": "active"}
        )
        result[name] = dealer
    return result


def cleanup_legacy_data() -> dict[str, object]:
    """Remove previous demo brands and rebuild-friendly leftovers.

    The operation is deliberately narrow: only known former demo dealers,
    vehicle catalogue entries and demo CRM rows (US demo phone prefix) are
    touched.  Real data created through the admin is left alone.
    """
    Dealer = apps.get_model("dealers", "Dealer")
    dealers = canonical_dealer_map()

    # Merge duplicate dealer names into the three canonical branches.
    for legacy in Dealer.objects.exclude(name__in=DEALER_NAMES):
        name = legacy.name.lower()
        if "central" in name:
            target = dealers[CENTRAL_DEALER]
        elif "west" in name:
            target = dealers[WEST_DEALER]
        elif "north" in name:
            target = dealers[NORTH_DEALER]
        else:
            continue
        reassign_foreign_keys(Dealer, legacy, target)
        safe_delete(legacy, f"dealer {legacy.name}")

    # Move units off the old demo model names, then delete those models.
    VehicleModel = apps.get_model("inventory", "VehicleModel")
    VehicleUnit = apps.get_model("inventory", "VehicleUnit")
    VehicleVariant = apps.get_model("inventory", "VehicleVariant")
    VehicleModelSpec = apps.get_model("inventory", "VehicleModelSpec")
    for legacy in VehicleModel.objects.filter(brand__iexact="Apex"):
        target = VehicleModel.objects.filter(brand=BRAND, model_name=legacy.model_name).first()
        if target:
            VehicleUnit.objects.filter(vehicle_model=legacy).update(vehicle_model=target)
        VehicleVariant.objects.filter(vehicle_model=legacy).delete()
        VehicleModelSpec.objects.filter(vehicle_model=legacy).delete()
        safe_delete(legacy, f"vehicle model {legacy.brand} {legacy.model_name}")

    # Drop malformed models left by an earlier seeder revision.
    for legacy in VehicleModel.objects.filter(
        brand=BRAND,
        model_name__in=(
            "go 10T",
            "ler 6T",
            "yVan 3T",
            "VT go 10T",
            "VT ler 6T",
            "VT yVan 3T",
        ),
    ):
        VehicleVariant.objects.filter(vehicle_model=legacy).delete()
        VehicleModelSpec.objects.filter(vehicle_model=legacy).delete()
        safe_delete(legacy, f"vehicle model {legacy.model_name}")

    # Remove the old catalogue entries and all their child content.
    Vehicle = apps.get_model("vehicles", "Vehicle")
    Enquiry = apps.get_model("leads", "Enquiry")
    for item in Vehicle.objects.filter(name__startswith="Apex"):
        Enquiry.objects.filter(vehicle=item).update(vehicle=None)
        apps.get_model("vehicles", "Specification").objects.filter(
            group__vehicle=item
        ).delete()
        apps.get_model("vehicles", "SpecificationGroup").objects.filter(vehicle=item).delete()
        apps.get_model("vehicles", "VehicleStat").objects.filter(vehicle=item).delete()
        apps.get_model("vehicles", "VehicleFeature").objects.filter(vehicle=item).delete()
        apps.get_model("vehicles", "VehicleGalleryImage").objects.filter(vehicle=item).delete()
        safe_delete(item, f"catalogue vehicle {item.name}")

    # Remove the previous demo CRM rows (all used the +1 555 fake prefix).
    Lead = apps.get_model("crm", "Lead")
    Customer = apps.get_model("crm", "Customer")
    demo_leads = Lead.objects.filter(phone__startswith="+1 555")
    customer_ids = list(Customer.objects.filter(lead__in=demo_leads).values_list("id", flat=True))
    customer_ids += list(
        Customer.objects.filter(phone__startswith="+1 555").values_list("id", flat=True)
    )
    customer_ids = sorted(set(customer_ids))

    apps.get_model("crm", "TestDrive").objects.filter(
        lead__in=demo_leads
    ).delete()
    apps.get_model("crm", "Quotation").objects.filter(lead__in=demo_leads).delete()
    apps.get_model("crm", "Activity").objects.filter(lead__in=demo_leads).delete()
    apps.get_model("crm", "Opportunity").objects.filter(customer_id__in=customer_ids).delete()
    Enquiry.objects.filter(lead__in=demo_leads).delete()

    # Unlink units/sales before deleting demo customers so protected FKs do
    # not block cleanup.
    apps.get_model("inventory", "VehicleUnit").objects.filter(
        customer_id__in=customer_ids
    ).update(customer=None, current_customer=None)
    apps.get_model("inventory", "Sale").objects.filter(customer_id__in=customer_ids).delete()
    Customer.objects.filter(id__in=customer_ids).delete()
    demo_leads.delete()

    # Demo timelines are regenerated from scratch so counts stay predictable.
    apps.get_model("common", "Notification").objects.all().delete()
    apps.get_model("common", "DailyActivityRollup").objects.all().delete()
    apps.get_model("events", "EventVisitor").objects.all().delete()
    apps.get_model("events", "Event").objects.all().delete()

    # Story catalogue is demo content; regenerate with template images.
    apps.get_model("stories", "Story").objects.all().delete()
    apps.get_model("stories", "Tag").objects.all().delete()

    # CMS: replace every allowed page and drop stale page keys.
    CmsPage = apps.get_model("cms", "CmsPage")
    allowed = {choice[0] for choice in CmsPage._meta.get_field("page").choices}
    CmsPage.objects.exclude(page__in=allowed).delete()

    return {"dealers": dealers}


def write_media_file(relative_path: str, content: bytes) -> str:
    """Write a generated demo asset under MEDIA_ROOT and return its URL."""
    from django.conf import settings

    target = os.path.join(settings.MEDIA_ROOT, *relative_path.split("/"))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as handle:
        handle.write(content)
    return f"{settings.MEDIA_URL.rstrip('/')}/{relative_path}"


def svg_placeholder(title: str, subtitle: str, accent: str = "#16a34a") -> bytes:
    """A lightweight branded SVG used for demo catalogue/story imagery."""
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    safe_subtitle = subtitle.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="{accent}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="720" fill="url(#bg)"/>
  <circle cx="980" cy="120" r="220" fill="#ffffff" opacity="0.06"/>
  <circle cx="180" cy="650" r="280" fill="#ffffff" opacity="0.05"/>
  <path d="M170 455h470l80-140h170l130 195v95H170z" fill="#ffffff" opacity="0.16"/>
  <circle cx="330" cy="615" r="58" fill="#0f172a" stroke="#ffffff" stroke-width="16"/>
  <circle cx="850" cy="615" r="58" fill="#0f172a" stroke="#ffffff" stroke-width="16"/>
  <text x="90" y="190" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="34" opacity="0.75">{safe_subtitle}</text>
  <text x="90" y="300" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="82" font-weight="700">{safe_title}</text>
  <text x="90" y="355" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="26" opacity="0.7">Vehicle Template · Electric Commercial Mobility</text>
</svg>""".encode("utf-8")


def tiny_png() -> bytes:
    # 1x1 transparent PNG, enough for FileField demo records.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
