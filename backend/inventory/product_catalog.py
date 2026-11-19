"""Canonical product variants, battery capacities, and cargo lengths."""

from __future__ import annotations

import re

from django.db import transaction

from .models import VehicleModel, VehicleModelSpec, VehicleVariant

PRODUCT_VARIANTS = (
    ("Chassis", "CHA"),
    ("Hi-Deck Container", "HDC"),
    ("Closed Container", "COT"),
    ("Refrigerated Container", "REF"),
    ("Flat Body", "FLT"),
    ("Milk Tanker", "MLK"),
    ("Insulated Body", "INS"),
)

BATTERY_BY_TONNAGE = {
    "6T": ("100.27 kWh", "100.07 kWh"),
    "10T": ("164.86 kWh",),
}

CARGO_BY_TONNAGE = {
    "6T": ("16 FT", "20 FT"),
    "10T": ("20 FT",),
}


def tonnage_code_from_model(model: VehicleModel | None) -> str:
    if model is None:
        return ""
    text = f"{model.brand} {model.model_name}"
    match = re.search(r"(\d+)\s*T(?:ON)?\b", text, re.IGNORECASE)
    if not match:
        match = re.search(r"(\d+)\s*T", text, re.IGNORECASE)
    return f"{match.group(1)}T" if match else ""


def battery_code_from_label(label: str) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)", label or "")
    if not match:
        return ""
    return re.sub(r"\D", "", match.group(1))


def cargo_code_from_label(label: str) -> str:
    match = re.search(r"(\d+)\s*(?:ft|feet|f)\b", label or "", re.IGNORECASE)
    if match:
        return f"{match.group(1)}F"
    digits = re.search(r"(\d+)", label or "")
    return f"{digits.group(1)}F" if digits else ""


@transaction.atomic
def seed_product_catalog() -> dict:
    """Ensure every model has the shared product variants and tonnage specs."""
    models = list(VehicleModel.objects.all())
    variants_created = 0
    variants_updated = 0
    specs_created = 0
    specs_updated = 0

    wanted_names = {name for name, _code in PRODUCT_VARIANTS}

    for model in models:
        for name, code in PRODUCT_VARIANTS:
            variant, created = VehicleVariant.objects.get_or_create(
                vehicle_model=model,
                name=name,
                defaults={
                    "product_code": code,
                    "is_active": True,
                    "spec_text": f"{name} ({code})",
                },
            )
            if created:
                variants_created += 1
            else:
                changed = False
                if variant.product_code != code:
                    variant.product_code = code
                    changed = True
                if not variant.is_active:
                    variant.is_active = True
                    changed = True
                if changed:
                    variant.save(update_fields=["product_code", "is_active", "updated_at"])
                    variants_updated += 1

        deactivated_variants = (
            VehicleVariant.objects.filter(vehicle_model=model, is_active=True)
            .exclude(name__in=wanted_names)
            .update(is_active=False)
        )
        variants_updated += deactivated_variants

        tonnage = tonnage_code_from_model(model)
        battery_labels = BATTERY_BY_TONNAGE.get(tonnage, ())
        cargo_labels = CARGO_BY_TONNAGE.get(tonnage, ())

        for kind, labels in (
            (VehicleModelSpec.Kind.BATTERY, battery_labels),
            (VehicleModelSpec.Kind.CARGO_LENGTH, cargo_labels),
        ):
            wanted = set(labels)
            for order, label in enumerate(labels):
                spec, created = VehicleModelSpec.objects.get_or_create(
                    vehicle_model=model,
                    kind=kind,
                    label=label,
                    defaults={"is_active": True, "sort_order": order},
                )
                if created:
                    specs_created += 1
                else:
                    updates = []
                    if not spec.is_active:
                        spec.is_active = True
                        updates.append("is_active")
                    if spec.sort_order != order:
                        spec.sort_order = order
                        updates.append("sort_order")
                    if updates:
                        updates.append("updated_at")
                        spec.save(update_fields=updates)
                        specs_updated += 1
            if wanted:
                deactivated = (
                    VehicleModelSpec.objects.filter(vehicle_model=model, kind=kind, is_active=True)
                    .exclude(label__in=wanted)
                    .update(is_active=False)
                )
                specs_updated += deactivated

    return {
        "models": len(models),
        "variants_created": variants_created,
        "variants_updated": variants_updated,
        "specs_created": specs_created,
        "specs_updated": specs_updated,
    }
