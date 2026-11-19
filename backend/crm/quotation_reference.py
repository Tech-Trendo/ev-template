"""Build quotation / reference numbers from model, variant, battery, and cargo length."""

from __future__ import annotations

import re

from inventory.product_catalog import (
    battery_code_from_label,
    cargo_code_from_label,
    tonnage_code_from_model,
)


def quotation_reference_stem(
    *,
    vehicle_model=None,
    variant=None,
    battery_capacity: str = "",
    vehicle_length: str = "",
) -> str:
    tonnage = tonnage_code_from_model(vehicle_model)
    product = (getattr(variant, "product_code", "") or "").strip().upper()
    if not product and variant is not None:
        product = re.sub(r"[^A-Z0-9]", "", (variant.name or "").upper())[:3]
    battery = battery_code_from_label(battery_capacity or "")
    cargo = cargo_code_from_label(vehicle_length or "")
    parts = [p for p in (tonnage, product, battery, cargo) if p]
    if not parts:
        return "QT"
    return "QT-" + "-".join(parts)


def next_quotation_sequence(stem: str, *, exclude_id=None) -> int:
    from .models import Quotation

    if not stem:
        stem = "QT"
    pattern = re.compile(rf"^{re.escape(stem)}-(\d+)$", re.IGNORECASE)
    qs = Quotation.objects.filter(reference_no__istartswith=f"{stem}-")
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    highest = 0
    for value in qs.values_list("reference_no", flat=True):
        match = pattern.match((value or "").strip())
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def build_quotation_reference(
    *,
    vehicle_model=None,
    variant=None,
    battery_capacity: str = "",
    vehicle_length: str = "",
    exclude_id=None,
) -> str:
    stem = quotation_reference_stem(
        vehicle_model=vehicle_model,
        variant=variant,
        battery_capacity=battery_capacity,
        vehicle_length=vehicle_length,
    )
    seq = next_quotation_sequence(stem, exclude_id=exclude_id)
    return f"{stem}-{seq:03d}"


def reference_matches_stem(reference_no: str, stem: str) -> bool:
    current = (reference_no or "").strip()
    if not current or not stem:
        return False
    return bool(re.match(rf"^{re.escape(stem)}-\d+$", current, re.IGNORECASE))


def ensure_modern_quotation_reference(quotation) -> bool:
    """Upgrade legacy/mismatched reference_no to QT-{tonnage}-{product}-{battery}-{cargo}-{seq}.

    Returns True if the quotation was updated.
    """
    vm = getattr(quotation, "vehicle_model", None)
    variant = getattr(quotation, "variant", None)
    battery = getattr(quotation, "battery_capacity", "") or ""
    length = getattr(quotation, "vehicle_length", "") or ""
    if not (vm and variant and battery and length):
        return False

    stem = quotation_reference_stem(
        vehicle_model=vm,
        variant=variant,
        battery_capacity=battery,
        vehicle_length=length,
    )
    current = (getattr(quotation, "reference_no", "") or "").strip()
    if reference_matches_stem(current, stem):
        return False

    quotation.reference_no = build_quotation_reference(
        vehicle_model=vm,
        variant=variant,
        battery_capacity=battery,
        vehicle_length=length,
        exclude_id=quotation.pk,
    )
    quotation.save(update_fields=["reference_no", "updated_at"])
    return True
