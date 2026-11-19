import logging
import mimetypes
import os

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Exists, OuterRef, Q, Subquery
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

from accounts.models import user_dealer_id, user_has_dealer_role, user_is_super_admin
from accounts.permissions import HasRolePermission
from common.views import UserAuditViewSetMixin
from inventory.models import VehicleReceiveCheckList

from .models import ENTRY_CHECKLIST_KEYS, ServiceEntryImage, ServiceRecord
from .serializers import ServiceEntryImageSerializer, ServiceRecordSerializer


class ServiceRecordViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    """Workshop service visits. Staff-only; dealer-scoped for Dealer Staff.

    Filters: ``?status=``, ``?dealer=<id>``, ``?chassis_number=`` (icontains),
    ``?technician=<id>``, ``?date_from=`` / ``?date_to=`` (on date_received),
    ``?search=`` (chassis / notes).
    """

    serializer_class = ServiceRecordSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["servicing.view_servicerecord"],
        "retrieve": ["servicing.view_servicerecord"],
        "create": ["servicing.add_servicerecord"],
        "update": ["servicing.change_servicerecord"],
        "partial_update": ["servicing.change_servicerecord"],
        "destroy": ["servicing.delete_servicerecord"],
        "upload_entry_image": ["servicing.change_servicerecord", "servicing.add_servicerecord"],
        "view_entry_image": ["servicing.view_servicerecord"],
        "default": ["servicing.view_servicerecord"],
    }

    def get_queryset(self):
        checklists = VehicleReceiveCheckList.objects.filter(service_record_id=OuterRef("pk"))
        qs = (
            ServiceRecord.objects.select_related("vehicle", "dealer", "technician")
            .prefetch_related("parts", "entry_images")
            .annotate(
                has_receive_checklist=Exists(checklists),
                receive_checklist_id=Subquery(checklists.order_by("-id").values("id")[:1]),
            )
            .all()
        )
        # Dealer scoping: non-super-admin users with a home dealer only see
        # their own dealer's records. This is a queryset filter, not just a
        # permission check, so scoped users can never list other dealers.
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()

        params = self.request.query_params
        status_filter = params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        dealer = params.get("dealer")
        if dealer:
            qs = qs.filter(dealer_id=dealer)
        chassis = params.get("chassis_number") or params.get("chassis")
        if chassis:
            qs = qs.filter(chassis_number__icontains=chassis.strip())
        technician = params.get("technician")
        if technician:
            qs = qs.filter(technician_id=technician)
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None
        if date_from:
            qs = qs.filter(date_received__gte=date_from)
        if date_to:
            qs = qs.filter(date_received__lte=date_to)
        lead = params.get("lead")
        if lead:
            qs = qs.filter(lead_id=lead)
        customer = params.get("customer")
        if customer:
            qs = qs.filter(customer_id=customer)
        vehicle_unit = params.get("vehicle_unit")
        if vehicle_unit:
            qs = qs.filter(vehicle_unit_id=vehicle_unit)
        vro_no = params.get("vro_no")
        if vro_no:
            qs = qs.filter(vro_no__icontains=vro_no.strip())
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(chassis_number__icontains=search)
                | Q(vro_no__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(v_reg_no__icontains=search)
                | Q(service_notes__icontains=search)
                | Q(job_description__icontains=search)
            )
        return qs.order_by("-date_received", "-id")

    def perform_update(self, serializer):
        """Audit customer field edits; propagate registration number to the unit."""
        instance = self.get_object()
        old_phone = instance.customer_mobile or ""
        old_email = getattr(instance, "customer_email", "") or ""
        old_reg = instance.v_reg_no or ""
        user = self.request.user if self.request.user.is_authenticated else None
        extra = {}
        if user:
            extra["updated_by"] = user

        updated = serializer.save(**extra)

        new_phone = updated.customer_mobile or ""
        new_email = getattr(updated, "customer_email", "") or ""
        new_reg = updated.v_reg_no or ""

        # A10: Log an Activity when customer contact details change.
        if updated.customer_id and (old_phone != new_phone or old_email != new_email):
            try:
                from crm.models import Activity
                from accounts.models import user_is_super_admin
                user = self.request.user if self.request.user.is_authenticated else None
                user_name = user.get_full_name() or user.username if user else "System"
                changes = []
                if old_phone != new_phone:
                    changes.append(f"phone: {old_phone!r} → {new_phone!r}")
                if old_email != new_email:
                    changes.append(f"email: {old_email!r} → {new_email!r}")
                Activity.objects.create(
                    customer_id=updated.customer_id,
                    type=Activity.Type.STATUS_CHANGE,
                    subject=f"Customer details updated via servicing form (VRO {updated.vro_no or updated.id})",
                    description="; ".join(changes),
                    user=user,
                    user_name=user_name,
                )
            except Exception as exc:
                logger.exception("Failed to log activity for customer update via service record %s: %s", updated.id, exc)

        # A11: Write registration number back to the unit if it was blank.
        if new_reg and not old_reg and updated.vehicle_unit_id:
            try:
                from inventory.models import VehicleUnit
                VehicleUnit.objects.filter(
                    pk=updated.vehicle_unit_id, registration_no=""
                ).update(registration_no=new_reg)
            except Exception as exc:
                logger.exception("Failed to update unit registration number from service record %s: %s", updated.id, exc)

    @action(
        detail=True,
        methods=["post"],
        url_path="entry-images",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_entry_image(self, request, pk=None):
        """Attach or replace the photo for one vehicle-entry checklist item."""
        record = self.get_object()
        item_key = (request.data.get("item_key") or "").strip()
        if item_key not in ENTRY_CHECKLIST_KEYS:
            raise ValidationError({"item_key": "Unknown checklist item."})
        image = request.FILES.get("image") or request.FILES.get("photo")
        if not image:
            raise ValidationError({"image": "Choose an image file."})
        obj = ServiceEntryImage.objects.filter(record=record, item_key=item_key).first()
        if obj is None:
            obj = ServiceEntryImage(record=record, item_key=item_key)
        previous = obj.image if obj.pk else None
        obj.image = image
        try:
            obj.full_clean()
        except DjangoValidationError as exc:
            raise ValidationError(getattr(exc, "message_dict", None) or exc.messages)
        obj.save()
        if previous and previous.name != obj.image.name:
            previous.delete(save=False)
        return Response(
            ServiceEntryImageSerializer(obj, context={"request": request}).data
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"entry-images/(?P<item_key>[^/.]+)",
    )
    def view_entry_image(self, request, pk=None, item_key=None):
        """Serve a checklist photo from private storage."""
        record = self.get_object()
        photo = get_object_or_404(ServiceEntryImage, record=record, item_key=item_key)
        if not photo.image:
            raise ValidationError("File not found.")
        filename = os.path.basename(photo.image.name)
        content_type, _ = mimetypes.guess_type(filename)
        response = FileResponse(
            photo.image.open("rb"),
            content_type=content_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class TrackServiceView(APIView):
    """Public chassis-number lookup (option C: chassis only, PII-free).

    Returns status + dates + changed parts per visit only. Never exposes
    owner PII, technician names, internal service notes, or part costs.
    Rate-limited via the ``tracking`` throttle scope to slow enumeration.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "tracking"

    def get(self, request):
        chassis = (request.query_params.get("chassis_number") or "").strip()
        if not chassis:
            return Response(
                {"detail": "chassis_number query parameter is required."}, status=400
            )
        visits = (
            ServiceRecord.objects.select_related("vehicle", "dealer")
            .prefetch_related("parts")
            .filter(chassis_number__iexact=chassis)
            .order_by("-date_received", "-id")
        )
        if not visits:
            return Response(
                {"detail": "No service history found for this chassis number."},
                status=404,
            )
        first = visits.last()
        return Response(
            {
                "chassis_number": first.chassis_number,
                "vehicle_name": first.vehicle.name if first.vehicle_id else "",
                "current_status": visits[0].status,
                "current_status_label": visits[0].get_status_display(),
                "last_updated": visits[0].date_received,
                "visits": [
                    {
                        "status": v.status,
                        "status_label": v.get_status_display(),
                        "dealer_name": v.dealer.name if v.dealer_id else "",
                        "date_received": v.date_received,
                        "date_completed": v.date_completed,
                        "odometer_reading": v.odometer_reading,
                        "parts": [
                            {
                                "part_name": p.part_name,
                                "part_number": p.part_number,
                                "quantity": p.quantity,
                            }
                            for p in v.parts.all()
                        ],
                    }
                    for v in visits
                ],
            }
        )


class ServicingPrefillView(APIView):
    """Smart prefill search for the Servicing form.

    Searches Unit by VIN, motor number, registration number, and customer phone/name.
    Also returns previous servicing history and warranty status.
    Guarded by servicing.view_servicerecord (CRM permissions NOT required).
    Dealer scoped. Max 10 results.
    """

    permission_classes = [HasRolePermission]
    perm_map = {
        "get": ["servicing.view_servicerecord"],
        "default": ["servicing.view_servicerecord"],
    }

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response([])

        from common.phone import normalize_nepal_phone
        from inventory.models import VehicleUnit
        from crm.models import Customer

        norm_q = normalize_nepal_phone(q)
        user = request.user
        home_dealer = None
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)

        unit_qs = (
            VehicleUnit.objects.select_related("vehicle_model", "current_customer", "import_batch")
            .prefetch_related("sales__dealer", "service_records")
        )

        unit_filter = (
            Q(vin_chassis_no__icontains=q)
            | Q(motor_no__icontains=q)
            | Q(registration_no__icontains=q)
            | Q(current_customer__name__icontains=q)
        )
        if norm_q:
            unit_filter |= Q(current_customer__phone_normalized__icontains=norm_q)
        # Allow intake links like ?unit=11 / prefill?q=11 to resolve by primary key.
        if q.isdigit():
            unit_filter |= Q(pk=int(q))

        units = unit_qs.filter(unit_filter)
        if home_dealer is not None:
            units = units.filter(
                Q(sales__dealer_id=home_dealer) | Q(service_records__dealer_id=home_dealer)
            ).distinct()

        results = []
        seen_units = set()
        seen_vins = set()

        for u in units[:10]:
            seen_units.add(u.id)
            seen_vins.add(u.vin_chassis_no.lower())
            cust = u.current_customer
            latest_sale = u.latest_sale
            last_sr = u.service_records.order_by("-date_received", "-id").first()
            service_count = u.service_records.count()

            results.append({
                "unit": {
                    "id": u.id,
                    "vin": u.vin_chassis_no,
                    "model": str(u.vehicle_model),
                    "model_id": u.vehicle_model_id,
                    "color": u.color,
                    "motor_no": u.motor_no,
                    "battery": float(u.effective_battery_kw) if u.effective_battery_kw else None,
                    "registration": u.registration_no,
                    "odometer_last": last_sr.odometer_reading if (last_sr and last_sr.odometer_reading) else u.odometer_km,
                },
                "customer": {
                    "id": cust.id if cust else None,
                    "code": cust.display_id if cust else "",
                    "name": cust.name if cust else (u.customer_name or ""),
                    "phone": cust.phone if cust else "",
                    "email": cust.email if cust else "",
                    "address": cust.location if cust else "",
                    "type": cust.type if cust else "Individual",
                } if (cust or u.customer_name) else None,
                "sale": {
                    "date": str(latest_sale.sale_date) if latest_sale else (str(u.sold_date) if u.sold_date else None),
                    "dealer": str(latest_sale.dealer.name) if (latest_sale and latest_sale.dealer) else "",
                    "dealer_id": latest_sale.dealer_id if latest_sale else None,
                } if (latest_sale or u.sold_date) else None,
                "warranty": {
                    "status": u.vehicle_warranty_status,
                    "end_date": str(u.vehicle_warranty_end) if u.vehicle_warranty_end else None,
                    "start_date": str(u.warranty_start) if u.warranty_start else None,
                    "vehicle": {
                        "status": u.vehicle_warranty_status,
                        "end_date": str(u.vehicle_warranty_end) if u.vehicle_warranty_end else None,
                        "months": u.vehicle_model.vehicle_warranty_months if u.vehicle_model else None,
                        "km": u.vehicle_model.vehicle_warranty_km if u.vehicle_model else None,
                    },
                    "battery": {
                        "status": u.battery_warranty_status,
                        "end_date": str(u.battery_warranty_end) if u.battery_warranty_end else None,
                        "months": u.vehicle_model.battery_warranty_months if u.vehicle_model else None,
                        "km": u.vehicle_model.battery_warranty_km if u.vehicle_model else None,
                    },
                },
                "last_service": {
                    "vro_no": last_sr.vro_no if last_sr else None,
                    "date": str(last_sr.date_received) if last_sr else None,
                    "status": last_sr.status if last_sr else None,
                } if last_sr else None,
                "service_count": service_count,
            })

        # If we have space for more results, also search external / previous service records
        if len(results) < 10:
            remaining = 10 - len(results)
            sr_filter = (
                Q(chassis_number__icontains=q)
                | Q(v_reg_no__icontains=q)
                | Q(motor_no__icontains=q)
                | Q(customer_name__icontains=q)
            )
            if norm_q:
                sr_filter |= Q(customer_mobile__icontains=norm_q)

            sr_qs = ServiceRecord.objects.filter(sr_filter)
            if home_dealer is not None:
                sr_qs = sr_qs.filter(dealer_id=home_dealer)
            if seen_units:
                sr_qs = sr_qs.exclude(vehicle_unit_id__in=seen_units)

            sr_matches = (
                sr_qs.select_related("customer", "vehicle_unit", "dealer")
                .order_by("-date_received", "-id")[:remaining * 2]
            )

            for sr in sr_matches:
                chassis_key = (sr.chassis_number or "").strip().lower()
                if chassis_key in seen_vins:
                    continue
                seen_vins.add(chassis_key)

                cust = sr.customer
                results.append({
                    "unit": {
                        "id": sr.vehicle_unit_id,
                        "vin": sr.chassis_number,
                        "model": sr.vehicle_name or (str(sr.vehicle_unit.vehicle_model) if sr.vehicle_unit else ""),
                        "color": sr.vehicle_unit.color if sr.vehicle_unit else "",
                        "motor_no": sr.motor_no,
                        "battery": float(sr.battery_kw) if sr.battery_kw else None,
                        "registration": sr.v_reg_no,
                        "odometer_last": sr.odometer_reading,
                    },
                    "customer": {
                        "id": cust.id if cust else None,
                        "code": cust.display_id if cust else "",
                        "name": cust.name if cust else sr.customer_name,
                        "phone": cust.phone if cust else sr.customer_mobile,
                        "email": cust.email if cust else "",
                        "address": cust.location if cust else sr.customer_address,
                        "type": cust.type if cust else "Individual",
                    } if (cust or sr.customer_name) else None,
                    "sale": {
                        "date": str(sr.date_of_sale) if sr.date_of_sale else None,
                        "dealer": sr.dealer_name or (sr.dealer.name if sr.dealer else ""),
                        "dealer_id": sr.dealer_id,
                    } if (sr.date_of_sale or sr.dealer_id) else None,
                    "warranty": {
                        "status": "none" if not sr.date_of_sale else "active",
                        "end_date": None,
                        "start_date": str(sr.date_of_sale) if sr.date_of_sale else None,
                        "vehicle": {
                            "status": "none" if not sr.date_of_sale else "active",
                            "end_date": None,
                            "months": None,
                            "km": None,
                        },
                        "battery": {
                            "status": "none" if not sr.date_of_sale else "active",
                            "end_date": None,
                            "months": None,
                            "km": None,
                        },
                    },
                    "last_service": {
                        "vro_no": sr.vro_no,
                        "date": str(sr.date_received),
                        "status": sr.status,
                    },
                    "service_count": ServiceRecord.objects.filter(chassis_number__iexact=sr.chassis_number).count(),
                })
                if len(results) >= 10:
                    break

        return Response(results)


class ServiceDueListView(APIView):
    """Lists vehicle units that are due or overdue for routine service.

    Filterable by:
    - dealer: dealer ID
    - overdue_only: true/false
    - days_until_due: integer threshold (e.g. 7, 14, 30)

    Respects RBAC via HasRolePermission (servicing.view_servicerecord)
    and scopes queryset to user's assigned dealer for dealer staff.
    """

    permission_classes = [HasRolePermission]
    perm_map = {
        "get": ["servicing.view_servicerecord"],
        "default": ["servicing.view_servicerecord"],
    }

    def get(self, request):
        from inventory.models import VehicleUnit

        user = request.user
        home_dealer = user_dealer_id(user) if not user_is_super_admin(user) else None

        qs = (
            VehicleUnit.objects.select_related(
                "vehicle_model", "customer", "lead"
            )
            .prefetch_related("service_records", "sales__dealer")
            .filter(
                status__in=[
                    VehicleUnit.Status.SOLD,
                    VehicleUnit.Status.READY_FOR_SALE,
                    VehicleUnit.Status.RESERVED,
                ]
            )
        )

        if not (user.is_superuser or user_is_super_admin(user)):
            if home_dealer:
                qs = qs.filter(sales__dealer_id=home_dealer, sales__is_current=True).distinct()
            elif user_has_dealer_role(user):
                return Response([])
            else:
                dealer_param = request.query_params.get("dealer")
                if dealer_param:
                    try:
                        d_id = int(dealer_param)
                        qs = qs.filter(sales__dealer_id=d_id, sales__is_current=True).distinct()
                    except ValueError:
                        pass
        else:
            dealer_param = request.query_params.get("dealer")
            if dealer_param:
                try:
                    d_id = int(dealer_param)
                    qs = qs.filter(sales__dealer_id=d_id, sales__is_current=True).distinct()
                except ValueError:
                    pass

        overdue_only = str(request.query_params.get("overdue_only", "")).lower() in ("true", "1")
        days_param = request.query_params.get("days_until_due")
        max_days = None
        if days_param is not None and days_param != "":
            try:
                max_days = int(days_param)
            except ValueError:
                pass

        results = []
        for u in qs:
            due = u.next_service_due
            status_val = due.get("status")
            if status_val in ("not_configured", "none"):
                continue

            is_overdue = due.get("is_overdue", False)
            days_until = due.get("days_until_due")

            if overdue_only and not is_overdue:
                continue

            if max_days is not None:
                if days_until is None or days_until > max_days:
                    continue

            customer_obj = u.customer
            sale_obj = u.latest_sale
            dealer_obj = sale_obj.dealer if sale_obj else None

            results.append(
                {
                    "unit_id": u.id,
                    "vin_chassis_no": u.vin_chassis_no,
                    "registration_no": u.registration_no,
                    "color": u.color,
                    "current_odometer": u.odometer_km,
                    "model_id": u.vehicle_model_id,
                    "model_name": str(u.vehicle_model) if u.vehicle_model else "",
                    "customer_id": customer_obj.id if customer_obj else None,
                    "customer_name": customer_obj.name if customer_obj else (u.customer_name or ""),
                    "customer_phone": customer_obj.phone if customer_obj else "",
                    "dealer_id": dealer_obj.id if dealer_obj else None,
                    "dealer_name": dealer_obj.name if dealer_obj else "",
                    "next_service_due": due,
                }
            )

        def sort_key(item):
            d = item["next_service_due"]
            is_od = d.get("is_overdue", False)
            days = d.get("days_until_due")
            return (0 if is_od else 1, days if days is not None else 999999)

        results.sort(key=sort_key)
        return Response(results)
