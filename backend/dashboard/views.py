from datetime import timedelta
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import (
    user_dealer_id,
    user_has_dealer_role,
    user_has_perm,
    user_is_super_admin,
)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Aggregated stats for the admin dashboard.
    Returns only sections the requesting user has access to.
    """
    user = request.user
    is_admin = user.is_superuser or user_is_super_admin(user)

    def can(perm):
        return is_admin or user_has_perm(user, perm)

    data = {}
    today = timezone.localdate()
    thirty_days_ago = today - timedelta(days=30)
    seven_days_ago = today - timedelta(days=7)

    home_dealer = user_dealer_id(user) if not is_admin else None
    is_dealer_scoped_user = not is_admin and user_has_dealer_role(user)

    # ── Vehicles ─────────────────────────────────────────────────────────────
    if can("vehicles.view_vehicle"):
        from vehicles.models import Vehicle
        vqs = Vehicle.objects.all()
        data["vehicles"] = {
            "total": vqs.count(),
            "active": vqs.filter(is_active=True).count(),
        }

    # ── Inventory / Units ────────────────────────────────────────────────────
    if can("inventory.view_vehicleunit"):
        from inventory.models import VehicleUnit, VehicleModel, VehicleReceiveCheckList
        qs = VehicleUnit.objects.all()
        if home_dealer:
            qs = qs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            qs = qs.none()
        data["inventory"] = {
            "total": qs.count(),
            "in_transit": qs.filter(status=VehicleUnit.Status.IN_TRANSIT).count(),
            "in_warehouse": qs.filter(status=VehicleUnit.Status.IN_WAREHOUSE).count(),
            "pdi_pending": qs.filter(status=VehicleUnit.Status.PDI_PENDING).count(),
            "pdi_passed": qs.filter(status=VehicleUnit.Status.PDI_PASSED).count(),
            "ready_for_sale": qs.filter(status=VehicleUnit.Status.READY_FOR_SALE).count(),
            "reserved": qs.filter(status=VehicleUnit.Status.RESERVED).count(),
            "sold": qs.filter(status=VehicleUnit.Status.SOLD).count(),
        }

        # Sales & Finance metrics — sourced from the Sale model (single source of truth).
        from inventory.models import Sale
        from django.db.models import Sum
        sale_qs = Sale.objects.filter(is_current=True)
        if home_dealer:
            sale_qs = sale_qs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            sale_qs = sale_qs.none()
        total_rev = sale_qs.aggregate(total=Sum("selling_price"))["total"] or 0

        data["sales_finance"] = {
            "total_revenue": float(total_rev),
            "units_sold": sale_qs.count(),
            "sold_this_month": sale_qs.filter(sale_date__gte=thirty_days_ago).count(),
            "cash_count": sale_qs.filter(payment_mode="CASH").count(),
            "finance_count": sale_qs.filter(
                payment_mode__in=["BANK_FINANCE", "PARTIAL_FINANCE"]
            ).count(),
            "pending_finance": sale_qs.filter(
                finance_status="PENDING_APPROVAL"
            ).count(),
        }


        # Model stock breakdown
        from inventory.models import sync_catalog_vehicles_to_models
        try:
            sync_catalog_vehicles_to_models()
        except Exception:
            pass

        models_list = []
        for vm in VehicleModel.objects.filter(is_active=True).order_by("brand", "model_name"):
            m_units = qs.filter(vehicle_model=vm)
            u_count = m_units.count()
            models_list.append({
                "id": vm.id,
                "brand": vm.brand,
                "model_name": vm.model_name,
                "total": u_count,
                "in_transit": m_units.filter(status=VehicleUnit.Status.IN_TRANSIT).count(),
                "in_warehouse": m_units.filter(status=VehicleUnit.Status.IN_WAREHOUSE).count(),
                "ready_for_sale": m_units.filter(status=VehicleUnit.Status.READY_FOR_SALE).count(),
                "reserved": m_units.filter(status=VehicleUnit.Status.RESERVED).count(),
                "sold": m_units.filter(status=VehicleUnit.Status.SOLD).count(),
                "low_threshold": vm.low_stock_threshold,
            })
        data["inventory"]["models_breakdown"] = models_list

        # Transporter arrival checklists
        rcv_qs = VehicleReceiveCheckList.objects.select_related("vehicle", "vehicle__vehicle_model").order_by("-receive_date", "-id")
        data["transporter_inspections"] = {
            "total": rcv_qs.count(),
            "recent": [
                {
                    "id": r.id,
                    "receive_no": r.receive_no,
                    "vin": r.vehicle.vin_chassis_no if r.vehicle else "—",
                    "model": (
                        r.vehicle.vehicle_model.model_name
                        if r.vehicle and r.vehicle.vehicle_model
                        else "—"
                    ),
                    "receive_date": str(r.receive_date),
                    "driver_name": r.driver_name,
                    "run_km": r.vehicle_run_km,
                    "status": r.overall_status,
                    "yard": r.vehicle_parked_yard,
                }
                for r in rcv_qs[:5]
            ],
        }

    # ── Servicing ────────────────────────────────────────────────────────────
    if can("servicing.view_servicerecord"):
        from servicing.models import ServiceRecord
        sqs = ServiceRecord.objects.all()
        if home_dealer:
            sqs = sqs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            sqs = sqs.none()
        active_count = sqs.filter(
            status__in=[
                ServiceRecord.Status.RECEIVED,
                ServiceRecord.Status.IN_PROGRESS,
                ServiceRecord.Status.WAITING_FOR_PARTS,
            ]
        ).count()
        data["servicing"] = {
            "total": sqs.count(),
            "active": active_count,
            "received": sqs.filter(status=ServiceRecord.Status.RECEIVED).count(),
            "in_progress": sqs.filter(status=ServiceRecord.Status.IN_PROGRESS).count(),
            "waiting_for_parts": sqs.filter(status=ServiceRecord.Status.WAITING_FOR_PARTS).count(),
            "completed": sqs.filter(status=ServiceRecord.Status.COMPLETED).count(),
            "delivered": sqs.filter(status=ServiceRecord.Status.DELIVERED).count(),
            "this_month": sqs.filter(date_received__gte=thirty_days_ago).count(),
            "recent": list(
                sqs.order_by("-created_at")[:5]
                .values(
                    "id",
                    "vro_no",
                    "chassis_number",
                    "status",
                    "customer_name",
                    "date_received",
                    "job_description",
                    "estimated_cost",
                )
            ),
        }

        from inventory.models import VehicleUnit
        u_qs = (
            VehicleUnit.objects.select_related("vehicle_model")
            .prefetch_related("service_records", "sales")
            .filter(
                status__in=[
                    VehicleUnit.Status.SOLD,
                    VehicleUnit.Status.READY_FOR_SALE,
                    VehicleUnit.Status.RESERVED,
                ]
            )
        )
        if home_dealer:
            u_qs = u_qs.filter(sales__dealer_id=home_dealer, sales__is_current=True).distinct()
        elif is_dealer_scoped_user:
            u_qs = u_qs.none()

        overdue_cnt = 0
        due_soon_cnt = 0
        for u in u_qs:
            s_stat = u.service_due_status
            if s_stat == "overdue":
                overdue_cnt += 1
            elif s_stat == "due_soon":
                due_soon_cnt += 1

        data["servicing"]["service_due"] = {
            "overdue": overdue_cnt,
            "due_soon": due_soon_cnt,
            "total_due": overdue_cnt + due_soon_cnt,
        }

    # ── CRM ──────────────────────────────────────────────────────────────────
    if can("crm.view_lead"):
        from crm.models import Lead
        from crm.services.pipeline import get_pipeline_summary
        lqs = Lead.objects.all()
        if home_dealer:
            lqs = lqs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            lqs = lqs.none()
        data["crm"] = data.get("crm", {})
        data["crm"]["leads"] = {
            "total": lqs.count(),
            "new": lqs.filter(status=Lead.Status.NEW).count(),
            "contacted": lqs.filter(status=Lead.Status.CONTACTED).count(),
            "qualified": lqs.filter(status=Lead.Status.QUALIFIED).count(),
            "converted": lqs.filter(status=Lead.Status.CONVERTED).count(),
            "lost": lqs.filter(status=Lead.Status.LOST).count(),
            "pipeline": get_pipeline_summary(lqs),
            "this_week": lqs.filter(created_at__date__gte=seven_days_ago).count(),
            "recent": list(
                lqs.order_by("-created_at")[:5]
                .values("id", "name", "phone", "email", "vehicle", "status", "source", "created_at")
            ),
        }

    if can("crm.view_customer"):
        from crm.models import Customer
        data["crm"] = data.get("crm", {})
        cqs = Customer.objects.all()
        if home_dealer:
            cqs = cqs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            cqs = cqs.none()
        data["crm"]["customers"] = cqs.count()

    if can("crm.view_quotation"):
        from crm.models import Quotation
        data["crm"] = data.get("crm", {})
        qqs = Quotation.objects.filter(is_latest=True)
        if home_dealer:
            qqs = qqs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            qqs = qqs.none()
        data["crm"]["quotations"] = {
            "total": qqs.count(),
            "draft": qqs.filter(status="draft").count(),
            "sent": qqs.filter(status="sent").count(),
            "accepted": qqs.filter(status="accepted").count(),
            "rejected": qqs.filter(status="rejected").count(),
            "recent": [
                {
                    "id": q.id,
                    "display_id": q.display_id,
                    "customer_name": q.customer.name if q.customer else q.customer_name or "—",
                    "vehicle": q.vehicle or "—",
                    "subtotal": float(q.subtotal),
                    "status": q.status,
                    "created_at": q.created_at.isoformat(),
                }
                for q in qqs.order_by("-created_at")[:5]
            ],
        }

    if can("crm.view_testdrive"):
        from crm.models import TestDrive
        data["crm"] = data.get("crm", {})
        tdqs = TestDrive.objects.all()
        if home_dealer:
            tdqs = tdqs.filter(dealer_id=home_dealer)
        elif is_dealer_scoped_user:
            tdqs = tdqs.none()
        data["crm"]["test_drives"] = {
            "total": tdqs.count(),
            "upcoming": tdqs.filter(date__gte=today).count(),
            "recent": [
                {
                    "id": td.id,
                    "display_id": td.display_id,
                    "customer_name": td.resolved_customer_name,
                    "vehicle": td.vehicle or "—",
                    "date": str(td.date) if td.date else "—",
                    "status": td.status,
                }
                for td in tdqs.order_by("-created_at")[:5]
            ],
        }

    # ── Quote Requests & Enquiries ───────────────────────────────────────────
    if can("leads.view_enquiry"):
        from leads.models import Enquiry
        # 1. Dedicated Quote Requests
        quote_qs = Enquiry.objects.filter(enquiry_type=Enquiry.EnquiryType.QUOTE)
        data["quote_requests"] = {
            "total": quote_qs.count(),
            "new": quote_qs.filter(status=Enquiry.Status.NEW).count(),
            "in_progress": quote_qs.filter(status=Enquiry.Status.IN_PROGRESS).count(),
            "closed": quote_qs.filter(status=Enquiry.Status.CLOSED).count(),
            "this_week": quote_qs.filter(created_at__date__gte=seven_days_ago).count(),
            "recent": [
                {
                    "id": e.id,
                    "name": e.name,
                    "company": e.company,
                    "phone": e.phone,
                    "email": e.email,
                    "vehicle": e.vehicle.name if e.vehicle else "—",
                    "status": e.status,
                    "created_at": e.created_at.isoformat(),
                    "message": (e.message[:120] + "...") if len(e.message) > 120 else e.message,
                }
                for e in quote_qs.select_related("vehicle")[:5]
            ],
        }

        # 2. General Enquiries (Contact & other)
        contact_qs = Enquiry.objects.exclude(enquiry_type=Enquiry.EnquiryType.QUOTE)
        data["enquiries"] = {
            "total": contact_qs.count(),
            "new": contact_qs.filter(status=Enquiry.Status.NEW).count(),
            "in_progress": contact_qs.filter(status=Enquiry.Status.IN_PROGRESS).count(),
            "closed": contact_qs.filter(status=Enquiry.Status.CLOSED).count(),
            "this_week": contact_qs.filter(created_at__date__gte=seven_days_ago).count(),
            "recent": [
                {
                    "id": e.id,
                    "name": e.name,
                    "company": e.company,
                    "phone": e.phone,
                    "email": e.email,
                    "vehicle": e.vehicle.name if e.vehicle else "—",
                    "status": e.status,
                    "created_at": e.created_at.isoformat(),
                    "message": (e.message[:120] + "...") if len(e.message) > 120 else e.message,
                }
                for e in contact_qs.select_related("vehicle")[:5]
            ],
        }

    # ── Stories ──────────────────────────────────────────────────────────────
    if can("stories.view_story"):
        from stories.models import Story
        data["stories"] = {
            "total": Story.objects.count(),
            "published": Story.objects.filter(status=Story.STATUS_PUBLISHED).count(),
        }

    # ── Events ───────────────────────────────────────────────────────────────
    if can("events.view_event"):
        from events.models import Event
        data["events"] = {
            "total": Event.objects.count(),
            "upcoming": Event.objects.filter(end_date__gte=today).count(),
        }

    # ── Dealers ──────────────────────────────────────────────────────────────
    if can("dealers.view_dealer"):
        from dealers.models import Dealer
        data["dealers"] = Dealer.objects.filter(status=Dealer.Status.ACTIVE).count()

    # ── China Shipments / Batches ────────────────────────────────────────────
    if can("inventory.view_importbatch"):
        from inventory.models import ImportBatch
        bqs = ImportBatch.objects.all().order_by("-created_at")
        data["batches"] = {
            "total": bqs.count(),
            "in_transit": bqs.filter(transport_status=ImportBatch.TransportStatus.IN_TRANSIT).count(),
            "border_customs": bqs.filter(transport_status=ImportBatch.TransportStatus.BORDER_CUSTOMS).count(),
            "arrived": bqs.filter(transport_status=ImportBatch.TransportStatus.ARRIVED).count(),
            "recent": [
                {
                    "id": b.id,
                    "batch_no": b.batch_no,
                    "origin": b.origin or "China",
                    "status": b.transport_status,
                    "status_label": b.get_transport_status_display(),
                    "total_units": b.total_units,
                    "border_crossing": b.border_crossing,
                    "eta_date": str(b.eta_date) if b.eta_date else None,
                    "destination": b.destination_warehouse,
                }
                for b in bqs[:4]
            ],
        }

    return Response(data)
