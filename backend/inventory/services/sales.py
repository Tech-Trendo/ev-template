"""
Service module for vehicle sales.
Single source of truth for recording sales, ensuring row-level locking,
transaction atomicity, stock movement audit, and CRM updates.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from inventory.models import PDIInspection, Sale, StockMovement, VehicleUnit

logger = logging.getLogger(__name__)


def record_sale(
    *,
    unit_id: int,
    customer_id: int,
    sold_price: Any,
    sold_date: Optional[date] = None,
    discount: Any = 0,
    payment_mode: str = "CASH",
    bank: str = "",
    down_payment: Any = None,
    loan_amount: Any = None,
    tenure: Any = None,
    interest: Any = None,
    emi: Any = None,
    finance_status: Optional[str] = None,
    tax_invoice_no: str = "",
    receipt_no: str = "",
    salesperson: Any = None,
    salesperson_name: str = "",
    dealer: Any = None,
    notes: str = "",
    warranty_end_date: Optional[date] = None,
    lead_id: Optional[int] = None,
    quotation_id: Optional[int] = None,
    user: Any = None,
    override_pdi: bool = False,
    override_reason: str = "",
) -> Sale:
    """
    Executes a complete vehicle sale in a single database transaction.
    Locks the VehicleUnit row with select_for_update to prevent race conditions.
    Rolls back all changes if any inner step fails.
    """
    if sold_price in (None, ""):
        raise ValidationError({"sold_price": "Sold price is required."})

    try:
        price_dec = Decimal(str(sold_price))
        if price_dec <= Decimal("0"):
            raise ValidationError({"sold_price": "Sold price must be positive."})
    except Exception as exc:
        raise ValidationError({"sold_price": f"Invalid sold price: {exc}"})

    with transaction.atomic():
        try:
            unit = VehicleUnit.objects.select_for_update().get(pk=unit_id)
        except VehicleUnit.DoesNotExist:
            raise ValidationError({"unit": "Vehicle unit not found."})

        # 1. State check: can only sell READY_FOR_SALE or RESERVED units
        if unit.status not in (
            VehicleUnit.Status.READY_FOR_SALE,
            VehicleUnit.Status.RESERVED,
        ):
            raise ValidationError(
                {"status": f"Cannot sell unit in status {unit.get_status_display()}."}
            )

        # 2. PDI check
        if getattr(settings, "INVENTORY_REQUIRE_PDI_FOR_SALE", True):
            has_pdi = unit.pdi_inspections.filter(
                inspection_type=PDIInspection.InspectionType.PDI,
                status__in=[
                    PDIInspection.InspectionStatus.SUBMITTED,
                    PDIInspection.InspectionStatus.APPROVED,
                    PDIInspection.InspectionStatus.COMPLETED,
                    PDIInspection.InspectionStatus.LOCKED,
                ],
            ).exists()
            if not has_pdi:
                if override_pdi:
                    from common.models import AuditLog
                    from django.contrib.contenttypes.models import ContentType
                    acting_user = user if (user and getattr(user, "is_authenticated", False)) else None
                    AuditLog.objects.create(
                        content_type=ContentType.objects.get_for_model(unit),
                        object_id=str(unit.id),
                        field_name="pdi_inspection",
                        old_value="REQUIRED",
                        new_value="OVERRIDDEN",
                        action=AuditLog.Action.UPDATE,
                        source="SALE_PDI_OVERRIDE",
                        summary=(
                            f"Sale recorded with PDI override for VIN {unit.vin_chassis_no}. "
                            f"Reason: {override_reason or 'No override reason provided'}"
                        ),
                        changed_by=acting_user,
                    )
                else:
                    has_vei = unit.pdi_inspections.filter(
                        inspection_type=PDIInspection.InspectionType.VEI
                    ).exists()
                    if has_vei:
                        raise ValidationError(
                            "Cannot sell: Pre-Delivery Inspection (PDI) is required before recording a sale. "
                            "Vehicle Entry Inspection (VEI) alone does not qualify for delivery."
                        )
                    raise ValidationError(
                        "Cannot sell: completed Pre-Delivery Inspection (PDI) is required before recording a sale."
                    )

        # 3. Customer resolution
        from crm.models import Activity, Customer, Lead, Quotation

        try:
            customer_obj = Customer.objects.get(pk=customer_id)
        except Customer.DoesNotExist:
            raise ValidationError(
                {"customer": "A valid customer is required to record a sale."}
            )

        lead_obj = None
        if lead_id:
            lead_obj = Lead.objects.filter(pk=lead_id).first()
        elif customer_obj.lead_id:
            lead_obj = customer_obj.lead

        quote_obj = None
        if quotation_id:
            quote_obj = Quotation.objects.filter(pk=quotation_id).first()

        sale_dt = sold_date or timezone.localdate()

        # 4. Update unit fields and status
        unit.status = VehicleUnit.Status.SOLD
        unit.current_customer = customer_obj
        unit.customer = customer_obj
        unit.customer_name = customer_obj.name
        unit.sold_date = sale_dt
        unit.sold_price = price_dec
        unit.payment_mode = payment_mode
        unit.finance_bank_name = bank or ""
        unit.down_payment = down_payment
        unit.loan_amount = loan_amount
        unit.loan_tenure_months = tenure
        unit.interest_rate = interest
        unit.monthly_emi = emi
        unit.finance_status = finance_status or (
            "APPROVED" if payment_mode != "CASH" else "NOT_APPLICABLE"
        )
        unit.tax_invoice_no = tax_invoice_no or ""
        unit.receipt_voucher_no = receipt_no or ""
        unit.delivery_notes = notes or ""
        if warranty_end_date:
            unit.warranty_end_date = warranty_end_date
        if lead_obj:
            unit.lead = lead_obj
        if quote_obj:
            unit.quotation = quote_obj

        unit.save()

        # 5. Stock movement log
        acting_user = user if (user and getattr(user, "is_authenticated", False)) else None
        StockMovement.objects.create(
            vehicle=unit,
            movement_type=StockMovement.MovementType.SOLD,
            quantity=1,
            reference_note=f"Sold for {price_dec} to {customer_obj.name}",
            created_by=acting_user,
        )

        # Auto-resolve dealer if not passed
        if user and not (user.is_superuser or user_is_super_admin(user)):
            from accounts.models import user_has_dealer_role, user_dealer_id
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise ValidationError("Dealer staff without a home dealership cannot record sales.")

        if not dealer:
            from accounts.models import user_dealer_id
            if user:
                d_id = user_dealer_id(user)
                if d_id:
                    from dealers.models import Dealer
                    dealer = Dealer.objects.filter(pk=d_id).first()
            if not dealer and getattr(unit, "dealer", None):
                dealer = unit.dealer
            elif not dealer and getattr(customer_obj, "dealer", None):
                dealer = customer_obj.dealer

        # 6. Mark previous sales for this unit as not current
        Sale.objects.filter(unit=unit).update(is_current=False)

        # 7. Create Sale record
        sale = Sale.objects.create(
            unit=unit,
            customer=customer_obj,
            quotation=quote_obj,
            lead=lead_obj,
            sale_date=sale_dt,
            selling_price=price_dec,
            discount=Decimal(str(discount or 0)),
            payment_mode=payment_mode,
            bank=bank or "",
            down_payment=down_payment,
            loan_amount=loan_amount,
            tenure=tenure,
            interest=interest,
            emi=emi,
            finance_status=unit.finance_status,
            tax_invoice_no=tax_invoice_no or "",
            receipt_no=receipt_no or "",
            dealer=dealer,
            salesperson=salesperson if (salesperson and getattr(salesperson, "is_authenticated", False)) else None,
            created_by=acting_user,
            notes=notes or "",
            warranty_end_date=warranty_end_date,
            is_current=True,
        )

        # 8. Update customer total purchases and vehicle history
        model_label = f"{str(unit.vehicle_model)} ({unit.vin_chassis_no})"
        if model_label not in customer_obj.vehicles:
            customer_obj.vehicles.append(model_label)
        customer_obj.total_purchases = Decimal(str(customer_obj.total_purchases or 0)) + price_dec
        customer_obj.last_activity = timezone.now()
        customer_obj.save(update_fields=["vehicles", "total_purchases", "last_activity", "updated_at"])

        # 9. CRM pipeline updates (quotation & lead)
        if quote_obj:
            quote_obj.converted_to_order = True
            quote_obj.save(update_fields=["converted_to_order", "updated_at"])

        if lead_obj and lead_obj.status != Lead.Status.CONVERTED:
            lead_obj.status = Lead.Status.CONVERTED
            lead_obj.last_activity = timezone.now()
            lead_obj.save(update_fields=["status", "last_activity", "updated_at"])

        # 10. Activity log
        u_name = salesperson_name or ""
        if not u_name and acting_user:
            u_name = acting_user.get_full_name() or acting_user.username
        if not u_name:
            u_name = "System"

        fin_info = f" via {bank}" if bank else ""
        inv_info = f" Invoice: {tax_invoice_no}" if tax_invoice_no else ""
        Activity.objects.create(
            customer=customer_obj,
            lead=lead_obj,
            type=Activity.Type.STATUS_CHANGE,
            subject=f"Vehicle sold: {unit.vin_chassis_no}",
            description=(
                f"Unit {unit.vin_chassis_no} ({unit.vehicle_model}) sold for "
                f"NPR {price_dec}{fin_info}.{inv_info}"
            ),
            user=acting_user,
            user_name=u_name,
        )

        return sale


def cancel_sale(
    *,
    sale_id: int,
    cancellation_reason: str,
    user: Any = None,
) -> Sale:
    """
    Cancels a vehicle sale, restoring unit status, clearing sold fields,
    reverting customer purchase ledger and vehicles list, resetting quotation
    order conversion flag, advancing lead back to previous stage, and recording
    both a StockMovement and generic AuditLog.
    Requires that the vehicle has not been delivered.
    """
    reason = str(cancellation_reason or "").strip()
    if not reason:
        raise ValidationError({"cancellation_reason": "A cancellation reason is required."})

    from common.models import log_audit_event
    from crm.models import Activity, Lead

    with transaction.atomic():
        try:
            sale = Sale.objects.select_for_update().get(pk=sale_id)
        except Sale.DoesNotExist:
            raise ValidationError({"sale": "Sale record not found."})

        if sale.status == Sale.Status.CANCELLED:
            raise ValidationError({"sale": "This sale is already cancelled."})

        unit = VehicleUnit.objects.select_for_update().get(pk=sale.unit_id)

        # Disallow cancellation if unit is already marked delivered
        if unit.condition_reports.filter(report_type="AT_DELIVERY").exists():
            raise ValidationError(
                {"unit": "Cannot cancel sale: vehicle has already been delivered. Use the return flow instead."}
            )

        acting_user = user if (user and getattr(user, "is_authenticated", False)) else None
        user_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"

        # 1. Update Sale record (marked to skip duplicate generic audit signal)
        sale._skip_audit_signal = True
        old_status = sale.status
        sale.status = Sale.Status.CANCELLED
        sale.is_current = False
        sale.cancelled_at = timezone.now()
        sale.cancellation_reason = reason
        sale.cancelled_by = acting_user
        sale.save(update_fields=[
            "status",
            "is_current",
            "cancelled_at",
            "cancellation_reason",
            "cancelled_by",
            "updated_at",
        ])

        # 2. Record specific AuditLog entry
        log_audit_event(
            instance=sale,
            field_name="status",
            old_value=old_status,
            new_value=Sale.Status.CANCELLED,
            changed_by=acting_user,
            source="SALE_CANCEL",
            action="UPDATE",
            summary=f"{user_name} cancelled Sale #{sale.id}",
        )

        # 3. Restore unit to its pre-sale status (default READY_FOR_SALE)
        target_status = VehicleUnit.Status.READY_FOR_SALE
        prior_mov = (
            StockMovement.objects.filter(vehicle=unit)
            .exclude(movement_type=StockMovement.MovementType.SOLD)
            .order_by("-created_at", "-id")
            .first()
        )
        if prior_mov:
            if prior_mov.movement_type == StockMovement.MovementType.RESERVED:
                target_status = VehicleUnit.Status.RESERVED
            elif prior_mov.movement_type in (
                StockMovement.MovementType.MOVED_TO_READY,
                StockMovement.MovementType.PDI_PASSED,
            ):
                target_status = VehicleUnit.Status.READY_FOR_SALE

        unit.status = target_status
        unit.current_customer = None
        unit.customer = None
        unit.customer_name = ""
        unit.sold_date = None
        unit.sold_price = None
        unit.down_payment = None
        unit.loan_amount = None
        unit.loan_tenure_months = None
        unit.interest_rate = None
        unit.monthly_emi = None
        unit.finance_bank_name = ""
        unit.tax_invoice_no = ""
        unit.receipt_voucher_no = ""
        unit.delivery_notes = ""
        unit.warranty_end_date = None
        unit._skip_audit_signal = True
        unit.save()

        # 4. Record StockMovement
        movement_type = (
            StockMovement.MovementType.RETURNED
            if target_status == VehicleUnit.Status.READY_FOR_SALE
            else StockMovement.MovementType.RELEASED
        )
        StockMovement.objects.create(
            vehicle=unit,
            movement_type=movement_type,
            quantity=1,
            reference_note=f"Sale cancelled: {reason}",
            created_by=acting_user,
        )

        # 5. Revert customer purchase balance and vehicles owned
        cust = sale.customer
        if cust:
            model_label = f"{str(unit.vehicle_model)} ({unit.vin_chassis_no})"
            if model_label in cust.vehicles:
                cust.vehicles.remove(model_label)
            current_total = Decimal(str(cust.total_purchases or 0))
            sale_price = Decimal(str(sale.selling_price or 0))
            cust.total_purchases = max(Decimal("0"), current_total - sale_price)
            cust.last_activity = timezone.now()
            cust.save(update_fields=["vehicles", "total_purchases", "last_activity", "updated_at"])

        # 6. Revert quotation conversion
        if sale.quotation:
            sale.quotation.converted_to_order = False
            sale.quotation.save(update_fields=["converted_to_order", "updated_at"])

        # 7. Revert lead status
        if sale.lead:
            from crm.services.pipeline import compute_lead_pipeline_stage
            stage = compute_lead_pipeline_stage(sale.lead)
            if stage in ("negotiation", "quotation"):
                sale.lead.status = Lead.Status.QUALIFIED
            elif stage == "test_drive":
                sale.lead.status = Lead.Status.CONTACTED
            else:
                sale.lead.status = Lead.Status.NEW
            sale.lead.last_activity = timezone.now()
            sale.lead.save(update_fields=["status", "last_activity", "updated_at"])

        # 8. CRM Activity
        u_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"
        Activity.objects.create(
            customer=sale.customer,
            lead=sale.lead,
            type=Activity.Type.STATUS_CHANGE,
            subject=f"Sale Cancelled: {unit.vin_chassis_no}",
            description=f"Sale cancelled for unit {unit.vin_chassis_no} ({unit.vehicle_model}). Reason: {reason}",
            user=acting_user,
            user_name=u_name,
        )

        return sale


def update_sale_fields(
    *,
    sale_id: int,
    data: dict[str, Any],
    user: Any = None,
) -> Sale:
    """
    Updates non-critical sale fields (tax invoice, receipt voucher, delivery notes,
    and finance terms), logging audit entries for every changed field.
    Syncs updated fields back to the linked VehicleUnit when sale is current.
    """
    from common.models import log_audit_event

    editable_fields = {
        "tax_invoice_no",
        "receipt_no",
        "notes",
        "bank",
        "down_payment",
        "loan_amount",
        "tenure",
        "interest",
        "emi",
        "finance_status",
        "warranty_end_date",
    }

    with transaction.atomic():
        try:
            sale = Sale.objects.select_for_update().get(pk=sale_id)
        except Sale.DoesNotExist:
            raise ValidationError({"sale": "Sale record not found."})

        if sale.status == Sale.Status.CANCELLED:
            raise ValidationError({"sale": "Cannot edit a cancelled sale."})

        acting_user = user if (user and getattr(user, "is_authenticated", False)) else None
        user_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"
        changed_fields = []
        sale._skip_audit_signal = True

        for field in editable_fields:
            if field in data:
                old_val = getattr(sale, field)
                new_val = data[field]
                # Compare string representation to avoid Decimal comparison false positives
                old_str = str(old_val or "")
                new_str = str(new_val or "")
                if old_str != new_str:
                    log_audit_event(
                        instance=sale,
                        field_name=field,
                        old_value=old_val,
                        new_value=new_val,
                        changed_by=acting_user,
                        source="SALE_EDIT",
                        action="UPDATE",
                        summary=f"{user_name} corrected {field} on Sale #{sale.id}",
                    )
                    setattr(sale, field, new_val)
                    changed_fields.append(field)

        if changed_fields:
            sale.save(update_fields=changed_fields + ["updated_at"])

            # Sync changes to current unit
            if sale.is_current and sale.unit:
                unit = sale.unit
                unit._skip_audit_signal = True
                unit_fields = []
                mapping = {
                    "tax_invoice_no": "tax_invoice_no",
                    "receipt_no": "receipt_voucher_no",
                    "notes": "delivery_notes",
                    "bank": "finance_bank_name",
                    "down_payment": "down_payment",
                    "loan_amount": "loan_amount",
                    "tenure": "loan_tenure_months",
                    "interest": "interest_rate",
                    "emi": "monthly_emi",
                    "finance_status": "finance_status",
                    "warranty_end_date": "warranty_end_date",
                }
                for sale_f, unit_f in mapping.items():
                    if sale_f in changed_fields:
                        setattr(unit, unit_f, getattr(sale, sale_f))
                        unit_fields.append(unit_f)
                if unit_fields:
                    unit.save(update_fields=unit_fields + ["updated_at"])

        return sale
