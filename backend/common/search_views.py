import re
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import scope_to_user_dealer, user_is_super_admin, user_permission_labels
from common.phone import normalize_nepal_phone


def _parse_id(query_str, prefix=""):
    """Extract an integer ID from a query if it matches a prefix or pure digits."""
    s = query_str.strip()
    if prefix:
        pattern = rf"^{re.escape(prefix)}[-_]?(\d+)$"
        m = re.match(pattern, s, re.IGNORECASE)
        if m:
            return int(m.group(1))
    if s.isdigit():
        return int(s)
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def global_search(request):
    """Global search across Customers, Units, Service Records, Leads, Quotations, Dealers, and Events.

    Respects RBAC permissions per type.
    Limits each type to at most 5 results, with an overall cap of 20 results.
    """
    user = request.user
    is_admin = user.is_superuser or user_is_super_admin(user)
    user_perms = set() if is_admin else user_permission_labels(user)

    def can(perm):
        return is_admin or perm in user_perms

    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response({
            "query": query,
            "total": 0,
            "results": [],
            "groups": {
                "customers": [],
                "units": [],
                "service_records": [],
                "leads": [],
                "quotations": [],
                "dealers": [],
                "events": [],
            },
        })

    digits = re.sub(r"\D", "", query)
    phone_norm = normalize_nepal_phone(query)
    results = []
    groups = {
        "customers": [],
        "units": [],
        "service_records": [],
        "leads": [],
        "quotations": [],
        "dealers": [],
        "events": [],
    }
    TYPE_LIMIT = 5
    TOTAL_LIMIT = 20

    # 1. Customers
    if can("crm.view_customer") and len(results) < TOTAL_LIMIT:
        from crm.models import Customer
        c_filters = Q(name__icontains=query) | Q(company__icontains=query) | Q(pan_vat_number__icontains=query)
        if digits and len(digits) >= 3:
            c_filters |= Q(phone__icontains=digits)
        if phone_norm:
            c_filters |= Q(phone_normalized__icontains=phone_norm)
        cid = _parse_id(query, "CU")
        if cid:
            c_filters |= Q(pk=cid)

        for c in scope_to_user_dealer(Customer.objects.filter(c_filters), user).order_by("-last_activity", "-id")[:TYPE_LIMIT]:
            sub_parts = [p for p in [c.phone or c.email, c.company or c.location] if p]
            item = {
                "id": c.id,
                "type": "customer",
                "title": c.name,
                "subtitle": " · ".join(sub_parts) if sub_parts else c.display_id,
                "badge": c.type,
                "target": f"crm-customers/{c.id}",
            }
            groups["customers"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 2. Vehicle Units
    if can("inventory.view_vehicleunit") and len(results) < TOTAL_LIMIT:
        from inventory.models import VehicleUnit
        u_filters = (
            Q(vin_chassis_no__icontains=query)
            | Q(motor_no__icontains=query)
            | Q(registration_no__icontains=query)
        )
        for u in (
            scope_to_user_dealer(VehicleUnit.objects.filter(u_filters), user)
            .select_related("vehicle_model")
            .order_by("-id")[:TYPE_LIMIT]
        ):
            model_name = (
                f"{u.vehicle_model.brand} {u.vehicle_model.model_name}"
                if u.vehicle_model
                else "Unit"
            )
            sub = f"{model_name} · Motor: {u.motor_no or 'N/A'}"
            item = {
                "id": u.id,
                "type": "unit",
                "title": u.vin_chassis_no,
                "subtitle": sub,
                "badge": u.get_status_display(),
                "target": f"units/{u.id}",
            }
            groups["units"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 3. Service Records
    if can("servicing.view_servicerecord") and len(results) < TOTAL_LIMIT:
        from servicing.models import ServiceRecord
        s_filters = (
            Q(vro_no__icontains=query)
            | Q(chassis_number__icontains=query)
            | Q(customer_name__icontains=query)
        )
        sid = _parse_id(query, "SRV")
        if sid:
            s_filters |= Q(pk=sid)

        for s in scope_to_user_dealer(ServiceRecord.objects.filter(s_filters), user).order_by("-created_at")[:TYPE_LIMIT]:
            vro_display = s.vro_no or f"SRV-{s.id}"
            cust = s.customer_name or "External"
            sub = f"{cust} · Chassis: {s.chassis_number or 'N/A'}"
            item = {
                "id": s.id,
                "type": "service_record",
                "title": vro_display,
                "subtitle": sub,
                "badge": s.get_status_display(),
                "target": f"servicing?vro={encode_target(vro_display)}",
            }
            groups["service_records"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 4. Leads
    if can("crm.view_lead") and len(results) < TOTAL_LIMIT:
        from crm.models import Lead
        l_filters = Q(name__icontains=query) | Q(company__icontains=query)
        if digits and len(digits) >= 3:
            l_filters |= Q(phone__icontains=digits)
        lid = _parse_id(query, "LD")
        if lid:
            l_filters |= Q(pk=lid)

        for l in scope_to_user_dealer(Lead.objects.filter(l_filters), user).order_by("-last_activity", "-id")[:TYPE_LIMIT]:
            sub = f"{l.phone} · {l.vehicle or 'Commercial EV'}"
            item = {
                "id": l.id,
                "type": "lead",
                "title": l.name,
                "subtitle": sub,
                "badge": l.get_status_display(),
                "target": f"crm-leads/{l.id}",
            }
            groups["leads"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 5. Quotations
    if can("crm.view_quotation") and len(results) < TOTAL_LIMIT:
        from crm.models import Quotation
        q_filters = (
            Q(customer_name__icontains=query)
            | Q(customer__name__icontains=query)
            | Q(vehicle__icontains=query)
            | Q(reference_no__icontains=query)
        )
        qid = _parse_id(query, "QT")
        if qid:
            q_filters |= Q(pk=qid) | Q(root_id=qid)
        m_qt = re.match(r"^QT[-_]?(\d+)-R(\d+)$", query.strip(), re.IGNORECASE)
        if m_qt:
            root_pk = int(m_qt.group(1))
            rev_num = int(m_qt.group(2))
            q_filters |= (Q(root_id=root_pk, revision_number=rev_num) | Q(pk=root_pk, revision_number=rev_num))

        for q in (
            scope_to_user_dealer(Quotation.objects.filter(q_filters), user)
            .select_related("customer")
            .order_by("-created_at")[:TYPE_LIMIT]
        ):
            cname = q.customer.name if q.customer else q.customer_name or "Customer"
            sub = f"{cname} · NPR {q.total:,.0f}"
            item = {
                "id": q.id,
                "type": "quotation",
                "title": q.display_id,
                "subtitle": sub,
                "badge": q.get_status_display(),
                "target": f"crm-quotations/{q.id}",
            }
            groups["quotations"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 6. Dealers
    if can("dealers.view_dealer") and len(results) < TOTAL_LIMIT:
        from dealers.models import Dealer
        d_filters = (
            Q(name__icontains=query)
            | Q(district__icontains=query)
            | Q(contact_person__icontains=query)
        )
        for d in scope_to_user_dealer(Dealer.objects.filter(d_filters), user, "id").order_by("name")[:TYPE_LIMIT]:
            sub = d.district or d.address or d.phone or "Authorized Dealer"
            item = {
                "id": d.id,
                "type": "dealer",
                "title": d.name,
                "subtitle": sub,
                "badge": d.get_status_display() if hasattr(d, "get_status_display") else d.status,
                "target": "dealers",
            }
            groups["dealers"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    # 7. Events
    if can("events.view_event") and len(results) < TOTAL_LIMIT:
        from events.models import Event
        e_filters = Q(name__icontains=query)
        for e in Event.objects.filter(e_filters).order_by("-start_date")[:TYPE_LIMIT]:
            sub = f"{e.start_date} to {e.end_date}"
            item = {
                "id": e.id,
                "type": "event",
                "title": e.name,
                "subtitle": sub,
                "badge": e.status.capitalize() if hasattr(e, "status") else "Event",
                "target": f"events/{e.id}",
            }
            groups["events"].append(item)
            results.append(item)
            if len(results) >= TOTAL_LIMIT:
                break

    return Response({
        "query": query,
        "total": len(results),
        "results": results[:TOTAL_LIMIT],
        "groups": groups,
    })


def encode_target(val):
    from urllib.parse import quote
    return quote(str(val))
