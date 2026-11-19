import hashlib
import mimetypes
import os
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Max, OuterRef, Q, Subquery
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import (
    scope_to_user_dealer,
    user_dealer_id,
    user_has_dealer_role,
    user_has_perm,
    user_is_super_admin,
)
from accounts.permissions import HasRolePermission
from dealers.models import Dealer
from common.models import AuditLog, log_audit_event
from common.views import UserAuditViewSetMixin

from .models import (
    Activity,
    ActivityType,
    Bank,
    BankBranch,
    CompanyBranding,
    Customer,
    Document,
    DocumentAttachment,
    DocumentTypeMaster,
    DocumentVersion,
    Lead,
    LeadSource,
    Opportunity,
    Quotation,
    TestDrive,
)
from .serializers import (
    ActivitySerializer,
    ActivityTypeSerializer,
    BankBranchSerializer,
    BankSerializer,
    CompanyBrandingSerializer,
    CustomerSerializer,
    DocumentAttachmentSerializer,
    DocumentSerializer,
    DocumentTypeMasterSerializer,
    DocumentVersionSerializer,
    LeadSerializer,
    LeadSourceSerializer,
    OpportunitySerializer,
    QuotationSerializer,
    TestDriveSerializer,
)
from leads.models import Enquiry

User = get_user_model()


def _paged_response(viewset, queryset, request):
    """Manual pagination envelope matching inventory/stories style."""
    page = request.query_params.get("page")
    page_size = request.query_params.get("page_size") or request.query_params.get(
        "pageSize"
    )
    if page is None and page_size is None:
        serializer = viewset.get_serializer(queryset, many=True)
        return Response(serializer.data)
    try:
        page = int(page) if page is not None else 1
        page_size = int(page_size) if page_size is not None else 20
    except ValueError:
        page, page_size = 1, 20
    page_size = max(1, min(page_size, 100))
    total = queryset.count()
    start = (page - 1) * page_size
    serializer = viewset.get_serializer(queryset[start : start + page_size], many=True)
    return Response(
        {
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "results": serializer.data,
        }
    )



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def crm_meta(request):
    """Choice metadata for CRM dropdowns.

    ``lead_sources`` is dynamic — sourced from the LeadSource table (active rows
    only) so sources added in the Lead Sources page show up in the dropdown.
    The remaining metadata comes from the model choices.

    Requires any CRM view permission (or Super Admin) — not just any staff flag.
    """
    if not (
        request.user.is_superuser
        or user_is_super_admin(request.user)
        or any(
            user_has_perm(request.user, label)
            for label in (
                "crm.view_lead",
                "crm.view_customer",
                "crm.view_opportunity",
                "crm.view_testdrive",
                "crm.view_quotation",
                "crm.view_activity",
                "crm.view_leadsource",
                "crm.view_activitytype",
                "leads.view_enquiry",
            )
        )
    ):
        return Response(
            {"detail": "You do not have permission to perform this action."},
            status=status.HTTP_403_FORBIDDEN,
        )
    lead_sources = list(
        LeadSource.objects.filter(is_active=True).order_by("id").values_list("name", flat=True)
    )
    from crm.services.pipeline import get_pipeline_summary
    return Response({
        "lead_sources": lead_sources,
        "lead_statuses": [choice[0] for choice in Lead.Status.choices],
        "lead_status_labels": dict(Lead.Status.choices),
        "pipeline_stages": ["new", "contacted", "test_drive", "quotation", "negotiation", "won", "lost"],
        "pipeline_stage_labels": {
            "new": "New",
            "contacted": "Contacted",
            "test_drive": "Test Drive",
            "quotation": "Quotation",
            "negotiation": "Negotiation",
            "won": "Won",
            "lost": "Lost",
        },
        "pipeline_summary": get_pipeline_summary(scope_to_user_dealer(Lead.objects.all(), request.user)),
        "customer_types": [choice[0] for choice in Customer.Type.choices],
        "stages": [choice[0] for choice in Opportunity.Stage.choices],
        "stage_labels": dict(Opportunity.Stage.choices),
        "test_drive_statuses": [choice[0] for choice in TestDrive.Status.choices],
        "quotation_statuses": [choice[0] for choice in Quotation.Status.choices],
        "activity_types": list(
            ActivityType.objects.filter(is_active=True).order_by("id").values_list("name", flat=True)
        ),
        "activity_labels": {
            at["name"]: at["label"] or at["name"]
            for at in ActivityType.objects.order_by("id").values("name", "label")
        },
        "enquiry_statuses": [choice[0] for choice in Enquiry.Status.choices],
        "enquiry_status_labels": dict(Enquiry.Status.choices),
        "enquiry_types": [choice[0] for choice in Enquiry.EnquiryType.choices],
        "enquiry_type_labels": dict(Enquiry.EnquiryType.choices),
    })


class LeadSourceViewSet(viewsets.ModelViewSet):
    """CRUD for dynamically managed lead sources.

    ``lead_count`` is annotated per source so the Lead Sources page can show how
    many leads reference each source. Deleting a source that is already in use
    is blocked — deactivate it instead (keeps historical leads intact).
    """

    serializer_class = LeadSourceSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_leadsource"],
        "retrieve": ["crm.view_leadsource"],
        "create": ["crm.add_leadsource"],
        "update": ["crm.change_leadsource"],
        "partial_update": ["crm.change_leadsource"],
        "destroy": ["crm.delete_leadsource"],
        "default": ["crm.view_leadsource"],
    }

    def get_queryset(self):
        qs = LeadSource.objects.all()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        lead_count_subq = (
            Lead.objects.filter(source=OuterRef("name"))
            .values("source")
            .annotate(count=Count("id"))
            .values("count")
        )
        return qs.annotate(lead_count=Subquery(lead_count_subq))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Lead.objects.filter(source=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f"Cannot delete lead source “{instance.name}” because it is "
                        "used by existing leads. Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class ActivityTypeViewSet(viewsets.ModelViewSet):
    """CRUD for dynamically managed activity types.

    Types added here immediately appear in the Add Activity form's type
    dropdown (via ``/api/crm/meta/``). Deleting a type that is already used
    by activities is blocked — deactivate it instead so historical activities
    keep their original type string intact.
    """

    serializer_class = ActivityTypeSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_activitytype"],
        "retrieve": ["crm.view_activitytype"],
        "create": ["crm.add_activitytype"],
        "update": ["crm.change_activitytype"],
        "partial_update": ["crm.change_activitytype"],
        "destroy": ["crm.delete_activitytype"],
        "default": ["crm.view_activitytype"],
    }

    def get_queryset(self):
        qs = ActivityType.objects.all()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)
        activity_count_subq = (
            Activity.objects.filter(type=OuterRef("name"))
            .values("type")
            .annotate(count=Count("id"))
            .values("count")
        )
        return qs.annotate(activity_count=Subquery(activity_count_subq))

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Activity.objects.filter(type=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f"Cannot delete activity type \u201c{instance.name}\u201d because it is "
                        "used by existing activities. Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)



def _flag_filter(qs, request):
    is_active = request.query_params.get("is_active")
    if is_active is None:
        return qs
    if is_active.lower() in ("true", "1"):
        return qs.filter(is_active=True)
    if is_active.lower() in ("false", "0"):
        return qs.filter(is_active=False)
    return qs


class BankViewSet(viewsets.ModelViewSet):
    """Banks shown in the quotation dropdown and managed from CRM settings."""

    serializer_class = BankSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
        "retrieve": ["crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
        "create": ["crm.add_bank", "crm.add_leadsource"],
        "update": ["crm.change_bank", "crm.change_leadsource"],
        "partial_update": ["crm.change_bank", "crm.change_leadsource"],
        "destroy": ["crm.delete_bank", "crm.delete_leadsource"],
        "default": ["crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
    }

    def get_queryset(self):
        qs = Bank.objects.annotate(branch_count=Count("branches"))
        qs = _flag_filter(qs, self.request)
        exact = (self.request.query_params.get("exact_name") or "").strip()
        if exact:
            qs = qs.filter(name__iexact=exact)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(category__icontains=search)
            )
        return qs.order_by("name")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Quotation.objects.filter(bank_name__iexact=instance.name).exists():
            return Response(
                {
                    "detail": (
                        f"Cannot delete bank “{instance.name}” because it is used on "
                        "existing quotations. Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class BankBranchViewSet(viewsets.ModelViewSet):
    """Branches for the selected bank, managed from CRM settings."""

    serializer_class = BankBranchSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_bankbranch", "crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
        "retrieve": ["crm.view_bankbranch", "crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
        "create": ["crm.add_bankbranch", "crm.add_bank", "crm.add_leadsource"],
        "update": ["crm.change_bankbranch", "crm.change_bank", "crm.change_leadsource"],
        "partial_update": ["crm.change_bankbranch", "crm.change_bank", "crm.change_leadsource"],
        "destroy": ["crm.delete_bankbranch", "crm.delete_bank", "crm.delete_leadsource"],
        "default": ["crm.view_bankbranch", "crm.view_bank", "crm.view_quotation", "crm.view_leadsource"],
    }

    def get_queryset(self):
        qs = BankBranch.objects.select_related("bank")
        qs = _flag_filter(qs, self.request)
        bank = (self.request.query_params.get("bank") or "").strip()
        if bank:
            if bank.isdigit():
                qs = qs.filter(bank_id=int(bank))
            else:
                qs = qs.none()
        exact = (self.request.query_params.get("exact_name") or "").strip()
        if exact:
            qs = qs.filter(name__iexact=exact)
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(code__icontains=search)
                | Q(address__icontains=search)
                | Q(district__icontains=search)
                | Q(bank__name__icontains=search)
            )
        return qs.order_by("name", "id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if Quotation.objects.filter(
            bank_name__iexact=instance.bank.name,
            bank_address__iexact=instance.name,
        ).exists():
            return Response(
                {
                    "detail": (
                        f"Cannot delete branch “{instance.name}” because it is used on "
                        "existing quotations. Deactivate it instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


def _resolved_user_name(user):
    if not user or not user.is_authenticated:
        return ""
    return user.get_full_name() or user.username


def _request_user(request):
    return request.user if request.user.is_authenticated else None


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("created_by").all()
    serializer_class = LeadSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_lead"],
        "retrieve": ["crm.view_lead"],
        "create": ["crm.add_lead"],
        "update": ["crm.change_lead"],
        "partial_update": ["crm.change_lead"],
        "destroy": ["crm.delete_lead"],
        "convert": ["crm.change_lead"],
        "import_from_event": ["crm.add_lead"],
        "default": ["crm.view_lead"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(company__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(vehicle__icontains=search)
            )
        return qs.order_by("-id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)

    def perform_create(self, serializer):
        user = _request_user(self.request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create leads.")
        extra = {
            "created_by": user,
            "created_by_name": _resolved_user_name(user),
        }
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer and not serializer.validated_data.get("dealer"):
            extra["dealer_id"] = home_dealer
        serializer.save(**extra)

    def perform_update(self, serializer):
        old_status = self.get_object().status
        instance = serializer.save()
        new_status = instance.status
        if old_status != new_status:
            meta_status = dict(Lead.Status.choices).get(new_status, new_status)
            old_meta_status = dict(Lead.Status.choices).get(old_status, old_status)
            user = _request_user(self.request)
            user_name = _resolved_user_name(self.request.user)
            recent = Activity.objects.filter(
                lead=instance,
                type=Activity.Type.STATUS_CHANGE,
                created_at__gte=timezone.now() - timezone.timedelta(seconds=5),
            ).exists()
            if not recent:
                Activity.objects.create(
                    lead=instance,
                    dealer=instance.dealer,
                    created_by=user,
                    type=Activity.Type.STATUS_CHANGE,
                    subject=f"{instance.name.strip() or f'Lead #{instance.id}'} moved to {meta_status}",
                    description=f"Status changed from {old_meta_status} to {meta_status}.",
                    user=user,
                    user_name=user_name,
                )

    def destroy(self, request, *args, **kwargs):
        """Delete a lead AND all its downstream records.

        A customer is linked to its originating lead by ``lead id`` (one-to-one).
        Deleting the lead hard-deletes that customer's TestDrives, Quotations
        and Opportunities, then the customer itself. TestDrives / Quotations
        attributed to the lead directly (created before conversion) are deleted
        too, so no orphaned CRM records are left behind. Everything runs in a
        single transaction — a failure can never leave a partial delete.
        """
        instance = self.get_object()
        with transaction.atomic():
            instance.delete_cascade()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="import-from-event")
    def import_from_event(self, request):
        """Import event visitors as leads.

        Body:
          event_id (int, required),
          visitor_ids (list[int], optional) — manual selection,
          select_all (bool, optional) — import all visitors matching filters,
          search, interest_level, vehicle, date, date_from, date_to (optional filters,
            same semantics as /api/events/<id>/visitors/; used when select_all is true).

        Returns {event, total, created, skipped, errors}.
        Duplicates (same phone or same email already in leads) are skipped.
        """
        from events.models import Event, EventVisitor

        event_id = request.data.get("event_id") or request.data.get("event")
        if not event_id:
            return Response({"detail": "event_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            event = Event.objects.get(pk=int(event_id))
        except (Event.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        raw_ids = request.data.get("visitor_ids") or []
        if isinstance(raw_ids, (str, int)):
            raw_ids = [raw_ids]
        visitor_ids: list[int] = []
        for v in raw_ids or []:
            try:
                visitor_ids.append(int(v))
            except (ValueError, TypeError):
                continue
        select_all = request.data.get("select_all")
        if isinstance(select_all, str):
            select_all = select_all.lower() in ("true", "1", "yes")
        select_all = bool(select_all) or not visitor_ids

        qs = EventVisitor.objects.filter(event=event).select_related("interest_level", "vehicle")

        if select_all:
            # Apply same server-side filters as the visitors list so
            # "select all" respects search/filters, not just the current page.
            search = (request.data.get("search") or "").strip()
            if search:
                qs = qs.filter(
                    Q(name__icontains=search) |
                    Q(phone__icontains=search) |
                    Q(email__icontains=search) |
                    Q(company__icontains=search) |
                    Q(remarks__icontains=search) |
                    Q(notes__icontains=search)
                )
            interest = request.data.get("interest_level") or request.data.get("interest_level_id")
            if interest not in (None, "", "all"):
                if str(interest).isdigit():
                    qs = qs.filter(interest_level_id=int(interest))
                else:
                    qs = qs.filter(interest_level__name__iexact=str(interest))
            vehicle = request.data.get("vehicle") or request.data.get("vehicle_id")
            if vehicle not in (None, "", "all"):
                if str(vehicle).isdigit():
                    qs = qs.filter(vehicle_id=int(vehicle))
                else:
                    qs = qs.filter(vehicle__name__iexact=str(vehicle))
            date_str = request.data.get("date")
            date_from = request.data.get("date_from")
            date_to = request.data.get("date_to")
            if date_str:
                d = parse_date(str(date_str))
                if d:
                    qs = qs.filter(visited_at__date=d)
            else:
                d_from = parse_date(str(date_from)) if date_from else None
                d_to = parse_date(str(date_to)) if date_to else None
                if d_from and d_to:
                    qs = qs.filter(visited_at__date__gte=d_from, visited_at__date__lte=d_to)
                elif d_from:
                    qs = qs.filter(visited_at__date__gte=d_from)
                elif d_to:
                    qs = qs.filter(visited_at__date__lte=d_to)
        else:
            qs = qs.filter(id__in=visitor_ids)

        visitor_list = list(qs.order_by("id")[:2000])
        if not visitor_list:
            return Response(
                {"detail": "No visitors match the selection."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = _request_user(request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot import leads.")
        user_name = _resolved_user_name(user)
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        created = 0
        skipped: list[dict] = []
        errors: list[dict] = []

        for visitor in visitor_list:
            v_name = (visitor.name or "").strip()
            if not v_name:
                errors.append({"visitor_id": visitor.id, "name": v_name, "error": "Name is required."})
                continue
            v_phone = (visitor.phone or "").strip()
            v_email = (visitor.email or "").strip()
            from common.phone import normalize_nepal_phone
            norm_phone = normalize_nepal_phone(v_phone)
            # Deduplicate against existing leads and customers (normalized phone or email match).
            duplicate = False
            if norm_phone and Customer.objects.filter(phone_normalized=norm_phone).exists():
                duplicate = True
            elif v_phone and Lead.objects.filter(phone__iexact=v_phone).exists():
                duplicate = True
            elif norm_phone and any(normalize_nepal_phone(l_phone) == norm_phone for l_phone in Lead.objects.values_list("phone", flat=True)):
                duplicate = True
            elif v_email and Lead.objects.filter(email__iexact=v_email).exists():
                duplicate = True
            if duplicate:
                skipped.append({"visitor_id": visitor.id, "name": v_name, "reason": "Already exists as a customer or lead."})
                continue
            parts = str(v_name).split()
            if len(parts) == 1:
                first_name, last_name = parts[0], ""
            else:
                first_name, last_name = parts[0], " ".join(parts[1:])
            note_bits: list[str] = []
            if (visitor.notes or "").strip():
                note_bits.append(visitor.notes.strip())
            if (visitor.remarks or "").strip() and visitor.remarks.strip() not in note_bits:
                note_bits.append(visitor.remarks.strip())
            note_bits.append(f"Imported from event: {event.name}")
            try:
                Lead.objects.create(
                    name=v_name,
                    first_name=first_name,
                    last_name=last_name,
                    company=(visitor.company or "").strip(),
                    phone=v_phone,
                    email=v_email,
                    address=(visitor.address or "").strip(),
                    vehicle=visitor.vehicle.name if visitor.vehicle else "",
                    interest_level=visitor.interest_level,
                    source=Lead.Source.EVENT,
                    notes="\n".join(note_bits),
                    dealer_id=home_dealer,
                    created_by=user,
                    created_by_name=user_name,
                )
                created += 1
            except Exception as exc:
                errors.append({"visitor_id": visitor.id, "name": v_name, "error": str(exc)})

        return Response({
            "event": {"id": event.id, "name": event.name},
            "total": len(visitor_list),
            "created": created,
            "skipped": skipped,
            "skipped_count": len(skipped),
            "failed": len(errors),
            "errors": errors,
        })

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        lead = self.get_object()
        from common.phone import normalize_nepal_phone
        user = _request_user(request)
        user_name = _resolved_user_name(request.user)
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        target_dealer = lead.dealer or (Dealer.objects.filter(id=home_dealer).first() if home_dealer else None)

        customer = Customer.objects.filter(lead=lead).first()
        if customer is None and lead.phone:
            norm_phone = normalize_nepal_phone(lead.phone)
            if norm_phone:
                customer = Customer.objects.filter(phone_normalized=norm_phone).first()
                if customer and not customer.lead_id:
                    customer.lead = lead
                    customer.save(update_fields=["lead", "updated_at"])
        if customer is None:
            customer = Customer.objects.create(
                lead=lead,
                name=lead.full_name,
                company=lead.company,
                type=Customer.Type.BUSINESS if lead.company else Customer.Type.INDIVIDUAL,
                phone=lead.phone,
                email=lead.email,
                location=lead.address,
                vehicles=[lead.vehicle] if lead.vehicle else [],
                notes=lead.notes,
                dealer=target_dealer,
                created_by=user,
                created_by_name=user_name,
            )
        else:
            update_fields = ["updated_at"]
            if lead.vehicle and lead.vehicle not in customer.vehicles:
                customer.vehicles = [*customer.vehicles, lead.vehicle]
                update_fields.append("vehicles")
            if lead.notes and not customer.notes:
                customer.notes = lead.notes
                update_fields.append("notes")
            if target_dealer and not customer.dealer_id:
                customer.dealer = target_dealer
                update_fields.append("dealer")
            customer.save(update_fields=update_fields)

        # Propagate dealer to existing test drives and quotations linked to lead if not set
        if target_dealer:
            lead.test_drives.filter(dealer__isnull=True).update(dealer=target_dealer)
            lead.quotations.filter(dealer__isnull=True).update(dealer=target_dealer)

        # Test drives / quotations attributed to the lead directly (scheduled
        # from the lead before conversion) move onto the customer so they keep
        # working — and get cascade-deleted with it later.
        lead.test_drives.update(customer=customer)
        lead.quotations.update(customer=customer)

        lead.status = Lead.Status.CONVERTED
        lead.last_activity = timezone.now()
        lead.save(update_fields=["status", "last_activity", "updated_at"])

        Activity.objects.create(
            lead=lead,
            customer=customer,
            dealer=target_dealer,
            created_by=user,
            type=Activity.Type.STATUS_CHANGE,
            subject="Converted to customer",
            description=f"Lead converted. Customer {customer.display_id}.",
            user=user,
            user_name=user_name,
        )

        ctx = self.get_serializer_context()
        return Response({
            "lead": LeadSerializer(lead, context=ctx).data,
            "customer": CustomerSerializer(customer, context=ctx).data,
        })


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_customer"],
        "retrieve": ["crm.view_customer"],
        "create": ["crm.add_customer"],
        "update": ["crm.change_customer"],
        "partial_update": ["crm.change_customer"],
        "destroy": ["crm.delete_customer"],
        "default": ["crm.view_customer"],
    }

    def create(self, request, *args, **kwargs):
        phone = request.data.get("phone", "")
        allow_dup = str(request.data.get("allow_duplicate_phone", "")).lower() in ("true", "1")
        if phone and not allow_dup:
            from common.phone import normalize_nepal_phone

            norm_phone = normalize_nepal_phone(phone)
            if norm_phone:
                matching = Customer.objects.filter(phone_normalized=norm_phone)
                if matching.exists():
                    first_match = matching.first()
                    data = [
                        {
                            "id": c.id,
                            "name": c.name,
                            "code": c.display_id,
                            "phone": c.phone,
                            "email": c.email,
                            "company": c.company,
                            "type": c.type,
                        }
                        for c in matching
                    ]
                    return Response(
                        {
                            "detail": f"Existing customer found: {first_match.name} ({first_match.display_id}).",
                            "matching_customers": data,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = _request_user(self.request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create customers.")
        extra = {
            "created_by": user,
            "created_by_name": _resolved_user_name(user),
            "last_activity": timezone.now(),
        }
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer and not serializer.validated_data.get("dealer"):
            extra["dealer_id"] = home_dealer
        serializer.save(**extra)

    def perform_update(self, serializer):
        user = _request_user(self.request)
        extra = {}
        if user:
            extra["updated_by"] = user
        serializer.save(**extra)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(company__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(display_id__icontains=search)
            )
        return qs.order_by("-id")

    def list(self, request, *args, **kwargs):
        return _paged_response(self, self.filter_queryset(self.get_queryset()), request)


class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.select_related("customer", "assigned_to").all()
    serializer_class = OpportunitySerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_opportunity"],
        "retrieve": ["crm.view_opportunity"],
        "create": ["crm.add_opportunity"],
        "update": ["crm.change_opportunity"],
        "partial_update": ["crm.change_opportunity"],
        "destroy": ["crm.delete_opportunity"],
        "default": ["crm.view_opportunity"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)
        return qs

    def perform_create(self, serializer):
        user = _request_user(self.request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create opportunities.")
        extra = {
            "created_by": user,
            "assigned_to": user,
            "assigned_to_name": _resolved_user_name(user),
            "last_activity": timezone.now(),
        }
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer and not serializer.validated_data.get("dealer"):
            extra["dealer_id"] = home_dealer
        serializer.save(**extra)

    def perform_update(self, serializer):
        user = _request_user(self.request)
        extra = {"last_activity": timezone.now()}
        if user:
            extra["updated_by"] = user
        instance = serializer.save(**extra)
        if "stage" in self.request.data:
            stage_label = instance.get_stage_display()
            Activity.objects.create(
                customer=instance.customer,
                dealer=instance.dealer,
                created_by=user,
                type=Activity.Type.STATUS_CHANGE,
                subject=f"Opportunity moved to {stage_label}",
                description=f"{instance.title} moved to {stage_label} stage.",
                user=user,
                user_name=_resolved_user_name(self.request.user),
            )


class TestDriveViewSet(viewsets.ModelViewSet):
    queryset = TestDrive.objects.select_related("customer").all()
    serializer_class = TestDriveSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_testdrive"],
        "retrieve": ["crm.view_testdrive"],
        "create": ["crm.add_testdrive"],
        "update": ["crm.change_testdrive"],
        "partial_update": ["crm.change_testdrive"],
        "destroy": ["crm.delete_testdrive"],
        "default": ["crm.view_testdrive"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)
        return qs

    def perform_create(self, serializer):
        user = _request_user(self.request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create test drives.")
        extra = {
            "created_by": user,
        }
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer and not serializer.validated_data.get("dealer"):
            extra["dealer_id"] = home_dealer
        instance = serializer.save(**extra)
        Activity.objects.create(
            customer=instance.customer,
            lead=instance.lead,
            dealer=instance.dealer,
            created_by=user,
            type=Activity.Type.TEST_DRIVE,
            subject=f"Test drive scheduled: {instance.vehicle}",
            description=f"{instance.date} at {instance.time or ''}, {instance.location}.".strip(),
            user=user,
            user_name=instance.salesperson or _resolved_user_name(self.request.user),
        )
        if instance.lead:
            if instance.lead.status == Lead.Status.NEW:
                instance.lead.status = Lead.Status.QUALIFIED
            instance.lead.last_activity = timezone.now()
            instance.lead.save(update_fields=["status", "last_activity", "updated_at"])
        if instance.customer:
            instance.customer.last_activity = timezone.now()
            instance.customer.save(update_fields=["last_activity", "updated_at"])

    def perform_update(self, serializer):
        user = _request_user(self.request)
        extra = {}
        if user:
            extra["updated_by"] = user
        old_status = self.get_object().status
        new_status = serializer.validated_data.get("status", old_status)
        if new_status != old_status:
            from crm.services.pipeline import transition_test_drive_status

            # First save any other updated fields without triggering duplicate status logic
            serializer.save(**extra)
            instance = serializer.instance
            instance.status = old_status
            transition_test_drive_status(
                test_drive=instance,
                new_status=new_status,
                user=user,
                notes=serializer.validated_data.get("notes", ""),
            )
        else:
            serializer.save(**extra)


class QuotationViewSet(viewsets.ModelViewSet):
    serializer_class = QuotationSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_quotation"],
        "retrieve": ["crm.view_quotation"],
        "create": ["crm.add_quotation"],
        "update": ["crm.edit_quotation", "crm.change_quotation"],
        "partial_update": ["crm.edit_quotation", "crm.change_quotation"],
        "destroy": ["crm.delete_quotation"],
        "pdf": ["crm.view_quotation"],
        "by_uuid": ["crm.view_quotation"],
        "revise": ["crm.revise_quotation", "crm.change_quotation"],
        "revisions": ["crm.view_quotation"],
        "next_reference": ["crm.view_quotation", "crm.add_quotation", "crm.change_quotation"],
        "default": ["crm.view_quotation"],
    }

    def get_queryset(self):
        qs = Quotation.objects.select_related(
            "customer", "vehicle_model", "variant", "variant__body_type", "unit", "reserved_unit", "parent", "root", "dealer", "created_by"
        ).all()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        variant = self.request.query_params.get("variant")
        if variant:
            qs = qs.filter(variant_id=variant)
        vehicle_model = self.request.query_params.get("vehicle_model")
        if vehicle_model:
            qs = qs.filter(vehicle_model_id=vehicle_model)

        if self.action == "list":
            if self.request.query_params.get("all_revisions", "").lower() != "true":
                qs = qs.filter(is_latest=True)
        return qs

    @action(detail=False, methods=["get"], url_path="next-reference")
    def next_reference(self, request):
        """Preview the next QT-6T-CHA-10027-16F-001 style reference number."""
        from inventory.models import VehicleModel, VehicleVariant
        from .quotation_reference import build_quotation_reference, quotation_reference_stem

        model_id = request.query_params.get("vehicle_model")
        variant_id = request.query_params.get("variant")
        battery = request.query_params.get("battery_capacity") or ""
        length = request.query_params.get("vehicle_length") or ""
        exclude_id = request.query_params.get("exclude")
        model = VehicleModel.objects.filter(pk=model_id).first() if model_id else None
        variant = (
            VehicleVariant.objects.select_related("vehicle_model").filter(pk=variant_id).first()
            if variant_id
            else None
        )
        stem = quotation_reference_stem(
            vehicle_model=model,
            variant=variant,
            battery_capacity=battery,
            vehicle_length=length,
        )
        if stem == "QT" or not (model and variant and battery and length):
            return Response(
                {
                    "stem": stem,
                    "reference_no": "",
                    "detail": "Select vehicle model, variant, battery capacity, and cargo length first.",
                }
            )
        reference = build_quotation_reference(
            vehicle_model=model,
            variant=variant,
            battery_capacity=battery,
            vehicle_length=length,
            exclude_id=exclude_id,
        )
        return Response({"stem": stem, "reference_no": reference})

    def perform_create(self, serializer):
        user = _request_user(self.request)
        if user and not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create quotations.")
        extra = {
            "created_by": user,
        }
        home_dealer = user_dealer_id(user) if user and not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer and not serializer.validated_data.get("dealer"):
            extra["dealer_id"] = home_dealer
        instance = serializer.save(**extra)
        Activity.objects.create(
            customer=instance.customer,
            lead=instance.lead,
            dealer=instance.dealer,
            created_by=user,
            type=Activity.Type.QUOTATION,
            subject=f"Quotation {instance.display_id} created",
            description=f"{instance.vehicle} quotation for NPR {instance.subtotal:,.0f}.",
            user=user,
            user_name=instance.salesperson or _resolved_user_name(self.request.user),
        )
        if instance.lead:
            if instance.lead.status in [Lead.Status.NEW, Lead.Status.CONTACTED]:
                instance.lead.status = Lead.Status.QUALIFIED
            if not instance.lead.budget and instance.subtotal:
                instance.lead.budget = instance.subtotal
            instance.lead.last_activity = timezone.now()
            instance.lead.save(update_fields=["status", "budget", "last_activity", "updated_at"])
        if instance.customer:
            instance.customer.last_activity = timezone.now()
            instance.customer.save(update_fields=["last_activity", "updated_at"])

    def perform_update(self, serializer):
        old_obj = self.get_object()
        if not old_obj.is_latest:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": "Historical quotation revisions are read-only. Revise the latest quotation instead."}
            )

        tracked_fields = [
            "customer_id", "lead_id", "customer_name", "company",
            "vehicle_model_id", "unit_id", "vehicle", "salesperson",
            "salesperson_email", "salesperson_phone", "vehicle_price",
            "accessories", "discount", "vat_rate", "other_charges",
            "valid_until", "reference_no", "notes", "status",
        ]
        old_values = {f: getattr(old_obj, f) for f in tracked_fields}
        old_status = old_obj.status

        acting_user = _request_user(self.request)
        extra = {}
        if acting_user:
            extra["updated_by"] = acting_user
        instance = serializer.save(**extra)

        # Audit log before/after for every edited field
        from common.models import log_audit_event, AuditLog
        changes_logged = 0
        for field in tracked_fields:
            old_val = old_values.get(field)
            new_val = getattr(instance, field)
            old_str = str(old_val if old_val is not None else "")
            new_str = str(new_val if new_val is not None else "")
            if old_str != new_str:
                user_name = (
                    acting_user.get_full_name() or acting_user.username
                    if acting_user
                    else "System"
                )
                log_audit_event(
                    instance=instance,
                    field_name=field,
                    old_value=old_str,
                    new_value=new_str,
                    changed_by=acting_user,
                    source="QUOTATION_EDIT",
                    action=AuditLog.Action.UPDATE,
                    summary=f"{user_name} edited {field} on quotation {instance.display_id} from '{old_str}' to '{new_str}'",
                )
                changes_logged += 1

        if changes_logged == 0:
            user_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"
            log_audit_event(
                instance=instance,
                field_name="",
                old_value="",
                new_value="",
                changed_by=acting_user,
                source="QUOTATION_EDIT",
                action=AuditLog.Action.UPDATE,
                summary=f"{user_name} updated quotation {instance.display_id}",
            )

        new_status = instance.status
        if new_status != old_status:
            from crm.services.pipeline import (
                accept_quotation,
                handle_quotation_rejection_or_expiry,
            )

            if new_status == Quotation.Status.ACCEPTED:
                accept_quotation(instance, user=_request_user(self.request))
            elif new_status in [Quotation.Status.REJECTED, Quotation.Status.EXPIRED]:
                handle_quotation_rejection_or_expiry(instance, user=_request_user(self.request))
            else:
                status_label = instance.get_status_display()
                user = _request_user(self.request)
                Activity.objects.create(
                    customer=instance.customer,
                    lead=instance.lead,
                    dealer=instance.dealer,
                    created_by=user,
                    type=Activity.Type.STATUS_CHANGE,
                    subject=f"Quotation {instance.display_id} {status_label.lower()}",
                    description=f"{instance.vehicle} quotation updated to {status_label}.",
                    user=user,
                    user_name=instance.salesperson or _resolved_user_name(self.request.user),
                )
                if instance.lead:
                    instance.lead.last_activity = timezone.now()
                    instance.lead.save(update_fields=["last_activity", "updated_at"])
                if instance.customer:
                    instance.customer.last_activity = timezone.now()
                    instance.customer.save(update_fields=["last_activity", "updated_at"])

    def perform_destroy(self, instance):
        if instance.child_revisions.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"detail": "Cannot delete a quotation that has child revisions."}
            )
        super().perform_destroy(instance)

    @action(detail=True, methods=["get"], permission_classes=[HasRolePermission])
    def pdf(self, request, pk=None):
        from .quotation_pdf import build_quotation_pdf
        from common.models import record_print_event

        quotation = self.get_object()
        try:
            from .quotation_reference import ensure_modern_quotation_reference

            ensure_modern_quotation_reference(quotation)
        except Exception:
            pass
        pdf_name = (quotation.reference_no or "").strip() or ""
        if pdf_name:
            import re as _re

            pdf_name = _re.sub(r"-R\d+$", "", pdf_name, flags=_re.IGNORECASE)
            rev = int(getattr(quotation, "revision_number", 0) or 0)
            if rev > 0:
                pdf_name = f"{pdf_name}-R{rev}"
        else:
            pdf_name = quotation.display_id
        record_print_event(
            user=request.user,
            document_type="QUOTATION",
            object_id=quotation.pk,
            title=f"Quotation {pdf_name}",
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        pdf_bytes = build_quotation_pdf(quotation, printed_by=request.user)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        filename = f"{pdf_name}.pdf".replace(" ", "_")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = str(len(pdf_bytes))
        return response

    @action(
        detail=False,
        methods=["get"],
        url_path=r"by-uuid/(?P<quotation_uuid>[0-9a-f-]+)",
        permission_classes=[HasRolePermission],
    )
    def by_uuid(self, request, quotation_uuid=None):
        from django.shortcuts import get_object_or_404

        quotation = get_object_or_404(Quotation, uuid=quotation_uuid)
        serializer = self.get_serializer(quotation)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[HasRolePermission])
    def revise(self, request, pk=None):
        old_quote = self.get_object()

        with transaction.atomic():
            root_quote = old_quote.root if old_quote.root else old_quote

            # Find next revision number in chain
            latest_rev = (
                Quotation.objects.filter(
                    Q(pk=root_quote.pk) | Q(root=root_quote)
                ).aggregate(max_rev=Max("revision_number"))["max_rev"]
                or 0
            )
            next_rev = latest_rev + 1

            # Mark all previous revisions in this chain as not latest
            Quotation.objects.filter(
                Q(pk=root_quote.pk) | Q(root=root_quote),
                is_latest=True,
            ).update(is_latest=False)

            # Per Step 0.4:
            # The new revision does NOT inherit the previous revision's reserved_unit or reservation.
            # Leave previous revision exactly as it was, reservation and all.
            # The new revision starts unreserved.
            data = request.data if isinstance(request.data, dict) and request.data else {}

            status_req = data.get("status")
            if status_req == "sent" or status_req == Quotation.Status.SENT:
                target_status = Quotation.Status.SENT
            else:
                target_status = Quotation.Status.DRAFT

            customer_id = data.get("customer") if "customer" in data else old_quote.customer_id
            lead_id = data.get("lead") if "lead" in data else old_quote.lead_id
            customer_name = data.get("customer_name") if "customer_name" in data else old_quote.customer_name
            company = data.get("company") if "company" in data else old_quote.company
            vehicle_model_id = data.get("vehicle_model") if "vehicle_model" in data else old_quote.vehicle_model_id
            unit_id = data.get("unit") if "unit" in data else old_quote.unit_id
            vehicle = data.get("vehicle") if "vehicle" in data else old_quote.vehicle
            salesperson = data.get("salesperson") or old_quote.salesperson or _resolved_user_name(request.user)
            if "salesperson_email" in data and data.get("salesperson_email"):
                salesperson_email = data.get("salesperson_email")
            elif salesperson != old_quote.salesperson:
                salesperson_email = ""
            else:
                salesperson_email = old_quote.salesperson_email

            if "salesperson_phone" in data and data.get("salesperson_phone"):
                salesperson_phone = data.get("salesperson_phone")
            elif salesperson != old_quote.salesperson:
                salesperson_phone = ""
            else:
                salesperson_phone = old_quote.salesperson_phone

            vehicle_price = data.get("vehicle_price") if "vehicle_price" in data else old_quote.vehicle_price
            accessories = data.get("accessories") if "accessories" in data else old_quote.accessories
            discount = data.get("discount") if "discount" in data else old_quote.discount
            vat_rate = data.get("vat_rate") if "vat_rate" in data else old_quote.vat_rate
            other_charges = data.get("other_charges") if "other_charges" in data else old_quote.other_charges
            quantity = data.get("quantity") if "quantity" in data else old_quote.quantity
            valid_until = data.get("valid_until") if "valid_until" in data else old_quote.valid_until
            reference_no = data.get("reference_no") if "reference_no" in data else old_quote.reference_no
            notes = data.get("notes") if "notes" in data else old_quote.notes
            extra_specs = data.get("extra_specs") if "extra_specs" in data else old_quote.extra_specs
            bank_name = data.get("bank_name") if "bank_name" in data else old_quote.bank_name
            bank_address = data.get("bank_address") if "bank_address" in data else old_quote.bank_address

            home_dealer = user_dealer_id(request.user) if not (request.user.is_superuser or user_is_super_admin(request.user)) else None
            if not (request.user.is_superuser or user_is_super_admin(request.user)):
                if user_has_dealer_role(request.user) and not home_dealer:
                    raise PermissionDenied("Dealer staff without an assigned home dealership cannot revise quotations.")
            dealer_id = data.get("dealer") if "dealer" in data else old_quote.dealer_id
            if not dealer_id and home_dealer:
                dealer_id = home_dealer

            new_quote = Quotation.objects.create(
                parent=old_quote,
                root=root_quote,
                revision_number=next_rev,
                is_latest=True,
                status=target_status,
                lead_id=lead_id,
                customer_id=customer_id,
                customer_name=customer_name or "",
                company=company or "",
                vehicle_model_id=vehicle_model_id,
                unit_id=unit_id,
                reserved_unit=None,
                reservation_expires_at=None,
                vehicle=vehicle or "",
                salesperson=salesperson or "",
                salesperson_email=salesperson_email or "",
                salesperson_phone=salesperson_phone or "",
                vehicle_price=vehicle_price if vehicle_price is not None else 0,
                accessories=accessories if accessories is not None else 0,
                discount=discount if discount is not None else 0,
                vat_rate=vat_rate if vat_rate is not None else 0,
                other_charges=other_charges if other_charges is not None else 0,
                quantity=quantity if quantity is not None else 1,
                valid_until=valid_until or None,
                reference_no=reference_no or "",
                notes=notes or "",
                extra_specs=extra_specs if isinstance(extra_specs, list) else [],
                bank_name=bank_name or "",
                bank_address=bank_address or "",
                dealer_id=dealer_id,
                created_by=_request_user(request),
            )

            # Log Activity
            Activity.objects.create(
                customer=new_quote.customer,
                lead=new_quote.lead,
                dealer=new_quote.dealer,
                created_by=_request_user(request),
                type=Activity.Type.QUOTATION,
                subject=f"Quotation revised to {new_quote.display_id}",
                description=f"Created revision {new_quote.display_id} from {old_quote.display_id}.",
                user=_request_user(request),
                user_name=new_quote.salesperson or _resolved_user_name(request.user),
            )

        serializer = self.get_serializer(new_quote)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], permission_classes=[HasRolePermission])
    def revisions(self, request, pk=None):
        quotation = self.get_object()
        root_quote = quotation.root if quotation.root else quotation
        chain = (
            Quotation.objects.filter(
                Q(pk=root_quote.pk) | Q(root=root_quote)
            )
            .select_related("customer", "vehicle_model", "unit", "reserved_unit", "parent", "root")
            .order_by("revision_number", "created_at")
        )
        serializer = self.get_serializer(chain, many=True)
        return Response(serializer.data)


class ActivityViewSet(viewsets.ModelViewSet):
    queryset = Activity.objects.select_related("lead", "customer", "user").all()
    serializer_class = ActivitySerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_activity"],
        "retrieve": ["crm.view_activity"],
        "create": ["crm.add_activity"],
        "update": ["crm.change_activity"],
        "partial_update": ["crm.change_activity"],
        "destroy": ["crm.delete_activity"],
        "default": ["crm.view_activity"],
    }
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(dealer_id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()
            else:
                dealer = self.request.query_params.get("dealer")
                if dealer:
                    qs = qs.filter(dealer_id=dealer)
        else:
            dealer = self.request.query_params.get("dealer")
            if dealer:
                qs = qs.filter(dealer_id=dealer)

        params = self.request.query_params
        lead = params.get("lead")
        if lead and lead.isdigit():
            qs = qs.filter(lead_id=lead)
        customer = params.get("customer")
        if customer and customer.isdigit():
            qs = qs.filter(customer_id=customer)
        return qs

    def perform_create(self, serializer):
        req_user = _request_user(self.request)
        if req_user and not (req_user.is_superuser or user_is_super_admin(req_user)):
            if user_has_dealer_role(req_user) and not user_dealer_id(req_user):
                raise PermissionDenied("Dealer staff without an assigned home dealership cannot create activities.")
        user_name = (serializer.validated_data.get("user_name") or "").strip()
        if not user_name or user_name.lower() in ["system", ""]:
            if req_user:
                linked_user = req_user
                user_name = _resolved_user_name(req_user)
            else:
                linked_user = None
                user_name = "System"
        else:
            linked_user = User.objects.filter(username__iexact=user_name).first()
            if not linked_user:
                parts = user_name.split()
                if len(parts) >= 2:
                    linked_user = User.objects.filter(
                        first_name__iexact=parts[0], last_name__iexact=" ".join(parts[1:])
                    ).first()
                if not linked_user and parts:
                    linked_user = User.objects.filter(first_name__iexact=parts[0]).first()
            if not linked_user and req_user:
                linked_user = req_user
                user_name = _resolved_user_name(req_user)

        extra = {
            "created_by": req_user,
        }
        home_dealer = user_dealer_id(req_user) if req_user and not (req_user.is_superuser or user_is_super_admin(req_user)) else None
        target_dealer_id = None
        if serializer.validated_data.get("dealer"):
            target_dealer_id = serializer.validated_data.get("dealer").id
        elif home_dealer:
            target_dealer_id = home_dealer
        elif serializer.validated_data.get("customer") and serializer.validated_data.get("customer").dealer_id:
            target_dealer_id = serializer.validated_data.get("customer").dealer_id
        elif serializer.validated_data.get("lead") and serializer.validated_data.get("lead").dealer_id:
            target_dealer_id = serializer.validated_data.get("lead").dealer_id

        if target_dealer_id:
            extra["dealer_id"] = target_dealer_id

        instance = serializer.save(user=linked_user, user_name=user_name, **extra)
        if instance.lead:
            instance.lead.last_activity = instance.datetime or timezone.now()
            instance.lead.save(update_fields=["last_activity", "updated_at"])
        if instance.customer:
            instance.customer.last_activity = instance.datetime or timezone.now()
            instance.customer.save(update_fields=["last_activity", "updated_at"])


class CompanyBrandingViewSet(viewsets.ViewSet):
    """Company-wide document branding settings (singleton)."""

    permission_classes = [HasRolePermission]
    perm_map = {
        "retrieve": ["crm.view_quotation", "cms.view_cmspage"],
        "list": ["crm.view_quotation", "cms.view_cmspage"],
        "update": ["cms.change_cmspage", "crm.change_quotation"],
        "partial_update": ["cms.change_cmspage", "crm.change_quotation"],
        "upload_letterhead": ["cms.change_cmspage", "crm.change_quotation"],
        "remove_letterhead": ["cms.change_cmspage", "crm.change_quotation"],
        "destroy": ["cms.change_cmspage", "crm.change_quotation"],
        "default": ["cms.change_cmspage", "crm.change_quotation"],
    }

    def list(self, request):
        branding = CompanyBranding.get_instance()
        serializer = CompanyBrandingSerializer(branding, context={"request": request})
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        branding = CompanyBranding.get_instance()
        serializer = CompanyBrandingSerializer(branding, context={"request": request})
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        branding = CompanyBranding.get_instance()
        serializer = CompanyBrandingSerializer(
            branding, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user if request.user.is_authenticated else None)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="upload-letterhead")
    def upload_letterhead(self, request):
        file_obj = request.FILES.get("letterhead") or request.FILES.get("image") or request.FILES.get("file")
        if not file_obj:
            return Response(
                {"detail": "No letterhead file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Size check: 10 MB maximum
        max_size = 10 * 1024 * 1024
        if file_obj.size > max_size:
            return Response(
                {"detail": "File size exceeds 10 MB limit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # File type / extension check
        ext = os.path.splitext(file_obj.name)[1].lower()
        allowed_extensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"]
        if ext not in allowed_extensions:
            return Response(
                {"detail": f"Unsupported file type '{ext}'. Allowed types: PDF, PNG, JPG, JPEG, WEBP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = getattr(file_obj, "content_type", "")
        if content_type:
            allowed_content_types = [
                "application/pdf",
                "image/png",
                "image/jpeg",
                "image/webp",
                "application/octet-stream",
            ]
            if content_type not in allowed_content_types and not content_type.startswith("image/"):
                return Response(
                    {"detail": f"Invalid content type '{content_type}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        branding = CompanyBranding.get_instance()
        if branding.letterhead_image:
            branding.letterhead_image.delete(save=False)
        branding.letterhead_image = file_obj
        branding.updated_by = request.user if request.user.is_authenticated else None
        branding.save()
        serializer = CompanyBrandingSerializer(branding, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post", "delete"], url_path="remove-letterhead")
    def remove_letterhead(self, request):
        branding = CompanyBranding.get_instance()
        if branding.letterhead_image:
            branding.letterhead_image.delete(save=False)
            branding.letterhead_image = None
            branding.updated_by = request.user if request.user.is_authenticated else None
            branding.save()
        serializer = CompanyBrandingSerializer(branding, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        branding = CompanyBranding.get_instance()
        if branding.letterhead_image:
            branding.letterhead_image.delete(save=False)
            branding.letterhead_image = None
            branding.updated_by = request.user if request.user.is_authenticated else None
            branding.save()
        serializer = CompanyBrandingSerializer(branding, context={"request": request})
        return Response(serializer.data)


class DocumentTypeMasterViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = DocumentTypeMaster.objects.all()
    serializer_class = DocumentTypeMasterSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["crm.view_documenttypemaster", "crm.view_document"],
        "retrieve": ["crm.view_documenttypemaster", "crm.view_document"],
        "create": ["crm.add_documenttypemaster"],
        "update": ["crm.change_documenttypemaster"],
        "partial_update": ["crm.change_documenttypemaster"],
        "destroy": ["crm.delete_documenttypemaster"],
        "default": ["crm.view_documenttypemaster"],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("is_active"):
            act = self.request.query_params.get("is_active").lower() in ("true", "1")
            qs = qs.filter(is_active=act)
        return qs.order_by("name")


class DocumentAccess(HasRolePermission):
    """Vault access, plus an employee viewing documents attached to their own record."""

    def has_permission(self, request, view):
        if super().has_permission(request, view):
            return True
        employee_id = request.query_params.get("employee")
        if not employee_id or getattr(view, "action", None) not in {"list", "retrieve", "download", "preview"}:
            return False
        from hrm.scope import employee_queryset_for

        return employee_queryset_for(request.user).filter(pk=employee_id).exists()


class DocumentViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    """
    CRUD viewset for Document Vault & attachments.
    Supports secure serving, duplicate warning by SHA256 hash, multi-record assignment,
    version history on file replace, and soft delete with mandatory reason.
    """

    queryset = (
        Document.objects.select_related(
            "customer",
            "lead",
            "quotation",
            "uploaded_by",
            "document_type_master",
            "created_by",
            "updated_by",
        )
        .prefetch_related(
            "versions__uploaded_by",
            "attachments__shipment",
            "attachments__unit",
            "attachments__customer",
            "attachments__sale",
            "attachments__employee",
        )
        .all()
    )
    serializer_class = DocumentSerializer
    permission_classes = [DocumentAccess]
    perm_map = {
        "list": ["crm.view_document"],
        "retrieve": ["crm.view_document"],
        "create": ["crm.add_document"],
        "update": ["crm.change_document"],
        "partial_update": ["crm.change_document"],
        "destroy": ["crm.delete_document"],
        "replace_file": ["crm.change_document"],
        "attach": ["crm.change_document"],
        "detach": ["crm.change_document"],
        "download": ["crm.view_document"],
        "preview": ["crm.view_document"],
        "version_download": ["crm.view_document"],
        "default": ["crm.view_document"],
    }

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()

        # Dealer scoping: Dealer users see only documents linked to their own dealer's records plus documents they uploaded
        if user and user.is_authenticated and not user.is_superuser:
            from accounts.models import user_has_perm, user_is_super_admin

            if not user_has_perm(user, "crm.view_document") and not user_is_super_admin(user):
                employee_id = self.request.query_params.get("employee")
                qs = qs.filter(attachments__employee_id=employee_id or 0)
            dealer_id = user_dealer_id(user)
            if dealer_id:
                qs = qs.filter(
                    Q(uploaded_by=user)
                    | Q(attachments__unit__dealer_id=dealer_id)
                    | Q(attachments__customer__dealer_id=dealer_id)
                    | Q(attachments__sale__dealer_id=dealer_id)
                    | Q(customer__dealer_id=dealer_id)
                )

        params = self.request.query_params
        if not params.get("include_deleted"):
            qs = qs.filter(is_deleted=False)

        # Tab / File Type filter
        tab = params.get("tab")
        file_type = params.get("file_type")
        if tab == "media" or file_type == "image":
            qs = qs.filter(
                Q(file_type__startswith="image/")
                | Q(file__iendswith=".jpg")
                | Q(file__iendswith=".jpeg")
                | Q(file__iendswith=".png")
                | Q(file__iendswith=".webp")
            )
        elif tab == "document" or file_type == "document":
            qs = qs.exclude(
                Q(file_type__startswith="image/")
                | Q(file__iendswith=".jpg")
                | Q(file__iendswith=".jpeg")
                | Q(file__iendswith=".png")
                | Q(file__iendswith=".webp")
            )

        if params.get("category"):
            c = params["category"]
            qs = qs.filter(
                Q(category__iexact=c)
                | Q(document_type_master__code__iexact=c)
                | Q(document_type__iexact=c)
            )

        if params.get("uploaded_by"):
            qs = qs.filter(uploaded_by_id=params["uploaded_by"])

        if params.get("date_from"):
            qs = qs.filter(created_at__date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(created_at__date__lte=params["date_to"])

        if params.get("search"):
            s = params["search"]
            qs = qs.filter(
                Q(title__icontains=s) | Q(notes__icontains=s) | Q(file__icontains=s)
            )

        # Entity assignment filters
        if params.get("shipment"):
            qs = qs.filter(attachments__shipment_id=params["shipment"])
        if params.get("unit"):
            qs = qs.filter(attachments__unit_id=params["unit"])
        if params.get("customer"):
            cid = params["customer"]
            qs = qs.filter(Q(attachments__customer_id=cid) | Q(customer_id=cid))
        if params.get("sale"):
            qs = qs.filter(attachments__sale_id=params["sale"])
        if params.get("employee"):
            qs = qs.filter(attachments__employee_id=params["employee"])
        if params.get("lead"):
            lid = params["lead"]
            qs = qs.filter(lead_id=lid)
        if params.get("quotation"):
            qid = params["quotation"]
            qs = qs.filter(quotation_id=qid)

        return qs.distinct().order_by("-created_at", "-id")

    def create(self, request, *args, **kwargs):
        file = request.FILES.get("file")
        if not file:
            raise ValidationError({"file": "No file uploaded."})

        # Calculate file hash
        h = hashlib.sha256()
        for chunk in file.chunks():
            h.update(chunk)
        file_hash = h.hexdigest()
        file.seek(0)

        # Check duplicate hash warning
        force = (
            str(request.data.get("force_duplicate", "")).lower() in ("true", "1")
            or str(request.data.get("force", "")).lower() in ("true", "1")
        )
        existing = Document.objects.filter(
            file_hash=file_hash, is_deleted=False
        ).first()
        if existing and not force:
            return Response(
                {
                    "duplicate_warning": True,
                    "existing_document": {
                        "id": existing.id,
                        "title": existing.title,
                        "category": existing.category,
                        "created_at": existing.created_at.strftime("%Y-%m-%d"),
                    },
                    "message": f"A file with identical content already exists as '{existing.title}'.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Determine mime type
        mime = (
            getattr(file, "content_type", "")
            or mimetypes.guess_type(file.name)[0]
            or ""
        )

        title = request.data.get("title") or request.data.get("name") or file.name
        category = request.data.get("category") or "OTHER"
        notes = request.data.get("notes", "")
        expiry_date = request.data.get("expiry_date") or None

        doc = Document(
            title=title,
            category=category,
            document_type=category.lower(),
            file=file,
            file_hash=file_hash,
            file_size=file.size,
            file_type=mime,
            notes=notes,
            expiry_date=expiry_date,
            uploaded_by=request.user if request.user.is_authenticated else None,
            created_by=request.user if request.user.is_authenticated else None,
            updated_by=request.user if request.user.is_authenticated else None,
        )
        master_id = request.data.get("document_type_master")
        if master_id:
            doc.document_type_master_id = master_id

        try:
            doc.full_clean()
        except DjangoValidationError as e:
            raise ValidationError(e.message_dict if hasattr(e, "message_dict") else str(e))
        doc.save()

        # Handle initial assignment attachments if provided
        shipment_id = request.data.get("shipment") or request.data.get("shipment_id")
        unit_id = request.data.get("unit") or request.data.get("unit_id")
        customer_id = request.data.get("customer") or request.data.get("customer_id")
        sale_id = request.data.get("sale") or request.data.get("sale_id")
        employee_id = request.data.get("employee") or request.data.get("employee_id")
        acting_user = request.user if request.user.is_authenticated else None
        if shipment_id:
            DocumentAttachment.objects.create(
                document=doc, shipment_id=shipment_id, created_by=acting_user
            )
        if unit_id:
            DocumentAttachment.objects.create(
                document=doc, unit_id=unit_id, created_by=acting_user
            )
        if customer_id:
            DocumentAttachment.objects.create(
                document=doc, customer_id=customer_id, created_by=acting_user
            )
        if sale_id:
            DocumentAttachment.objects.create(
                document=doc, sale_id=sale_id, created_by=acting_user
            )
        if employee_id:
            DocumentAttachment.objects.create(
                document=doc, employee_id=employee_id, created_by=acting_user
            )

        log_audit_event(
            instance=doc,
            action=AuditLog.Action.CREATE,
            changed_by=request.user,
            summary=f"Uploaded document '{doc.title}' ({doc.category})",
        )

        serializer = self.get_serializer(doc)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        doc = self.get_object()
        reason = (
            request.data.get("reason")
            or request.query_params.get("reason")
            or ""
        ).strip()
        if not reason:
            raise ValidationError(
                {"reason": "A deletion reason is required for soft deleting a document."}
            )

        # Warn if in use unless confirmed
        confirm_in_use = (
            str(request.data.get("confirm_in_use", "")).lower() in ("true", "1")
            or str(request.query_params.get("confirm_in_use", "")).lower()
            in ("true", "1")
        )
        if doc.attachments.exists() and not confirm_in_use:
            return Response(
                {
                    "in_use_warning": True,
                    "usage_count": doc.attachments.count(),
                    "used_in": self.get_serializer(doc).data.get("used_in", []),
                    "message": f"This document is linked to {doc.attachments.count()} record(s). Please confirm deletion.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        doc.is_deleted = True
        doc.deleted_at = timezone.now()
        doc.deleted_by = request.user if request.user.is_authenticated else None
        doc.deletion_reason = reason
        doc.save(
            update_fields=[
                "is_deleted",
                "deleted_at",
                "deleted_by",
                "deletion_reason",
                "updated_at",
            ]
        )

        log_audit_event(
            instance=doc,
            action=AuditLog.Action.DELETE,
            changed_by=request.user,
            summary=f"Soft deleted document '{doc.title}'. Reason: {reason}",
        )
        return Response({"detail": "Document soft deleted successfully."})

    @action(detail=True, methods=["post"], url_path="replace-file")
    def replace_file(self, request, pk=None):
        """Replace document file while keeping the previous file in version history."""
        doc = self.get_object()
        new_file = request.FILES.get("file")
        if not new_file:
            raise ValidationError({"file": "No replacement file uploaded."})

        change_note = request.data.get("change_note", "").strip()

        # Archive current file as a previous version
        next_ver = doc.versions.count() + 1
        DocumentVersion.objects.create(
            document=doc,
            version_no=next_ver,
            file=doc.file,
            file_hash=doc.file_hash,
            file_size=doc.file_size,
            file_type=doc.file_type,
            uploaded_by=doc.uploaded_by,
            change_note=change_note or f"Archived prior to version {next_ver + 1} upload.",
        )

        # Compute hash and mime of new file
        h = hashlib.sha256()
        for chunk in new_file.chunks():
            h.update(chunk)
        new_hash = h.hexdigest()
        new_file.seek(0)
        mime = (
            getattr(new_file, "content_type", "")
            or mimetypes.guess_type(new_file.name)[0]
            or ""
        )

        doc.file = new_file
        doc.file_hash = new_hash
        doc.file_size = new_file.size
        doc.file_type = mime
        doc.uploaded_by = request.user if request.user.is_authenticated else None
        doc.updated_by = request.user if request.user.is_authenticated else None
        try:
            doc.full_clean()
        except DjangoValidationError as e:
            raise ValidationError(e.message_dict if hasattr(e, "message_dict") else str(e))
        doc.save(
            update_fields=[
                "file",
                "file_hash",
                "file_size",
                "file_type",
                "uploaded_by",
                "updated_by",
                "updated_at",
            ]
        )
        if hasattr(doc, "_prefetched_objects_cache"):
            doc._prefetched_objects_cache.clear()

        log_audit_event(
            instance=doc,
            action=AuditLog.Action.UPDATE,
            changed_by=request.user,
            summary=f"Replaced file on document '{doc.title}'. Archived previous file as v{next_ver}.",
        )
        doc.refresh_from_db()
        return Response(self.get_serializer(doc).data)

    @action(detail=True, methods=["post"], url_path="attach")
    def attach(self, request, pk=None):
        """Attach document to a shipment, unit, customer, or sale."""
        doc = self.get_object()
        shipment_id = request.data.get("shipment") or request.data.get("shipment_id")
        unit_id = request.data.get("unit") or request.data.get("unit_id")
        customer_id = request.data.get("customer") or request.data.get("customer_id")
        sale_id = request.data.get("sale") or request.data.get("sale_id")
        employee_id = request.data.get("employee") or request.data.get("employee_id")

        if not any([shipment_id, unit_id, customer_id, sale_id, employee_id]):
            raise ValidationError(
                {"detail": "Provide a shipment, unit, customer, sale, or employee ID to attach to."}
            )

        acting_user = request.user if request.user.is_authenticated else None
        att, created = DocumentAttachment.objects.get_or_create(
            document=doc,
            shipment_id=shipment_id,
            unit_id=unit_id,
            customer_id=customer_id,
            sale_id=sale_id,
            employee_id=employee_id,
            defaults={"created_by": acting_user},
        )
        return Response(
            {
                "detail": "Document attached successfully."
                if created
                else "Already attached.",
                "attachment_id": att.id,
            }
        )

    @action(detail=True, methods=["post"], url_path="detach")
    def detach(self, request, pk=None):
        """Detach document from an entity."""
        doc = self.get_object()
        att_id = request.data.get("attachment_id")
        if att_id:
            att = get_object_or_404(DocumentAttachment, pk=att_id, document=doc)
            att.delete()
            return Response({"detail": "Attachment removed."})

        shipment_id = request.data.get("shipment") or request.data.get("shipment_id")
        unit_id = request.data.get("unit") or request.data.get("unit_id")
        customer_id = request.data.get("customer") or request.data.get("customer_id")
        sale_id = request.data.get("sale") or request.data.get("sale_id")

        qs = DocumentAttachment.objects.filter(document=doc)
        if shipment_id:
            qs = qs.filter(shipment_id=shipment_id)
        if unit_id:
            qs = qs.filter(unit_id=unit_id)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if sale_id:
            qs = qs.filter(sale_id=sale_id)
        employee_id = request.data.get("employee") or request.data.get("employee_id")
        if employee_id:
            qs = qs.filter(employee_id=employee_id)

        count, _ = qs.delete()
        return Response({"detail": f"{count} attachment(s) removed."})

    def _check_dealer_access(self, doc, user):
        if not user or not user.is_authenticated:
            raise PermissionDenied("Authentication required.")
        dealer_id = user_dealer_id(user)
        if not dealer_id:
            return True  # Head office / non-dealer user

        # Check if user uploaded it
        if doc.uploaded_by_id == user.id:
            return True

        # Check if attached to dealer's unit, customer, or sale
        has_dealer_link = doc.attachments.filter(
            Q(unit__dealer_id=dealer_id)
            | Q(customer__dealer_id=dealer_id)
            | Q(sale__dealer_id=dealer_id)
        ).exists()
        if has_dealer_link or (doc.customer and doc.customer.dealer_id == dealer_id):
            return True

        raise PermissionDenied("You do not have permission to access documents outside your dealership.")

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        """Secure authenticated document download checking permissions and dealer scoping."""
        doc = self.get_object()
        self._check_dealer_access(doc, request.user)
        source = doc
        version_no = request.query_params.get("version")
        if version_no:
            source = doc.versions.filter(version_no=version_no).first() if version_no.isdigit() else None
            if source is None:
                raise ValidationError(f"Version {version_no} not found for this document.")
        if not source.file:
            raise ValidationError("Document file not found.")

        filename = os.path.basename(source.file.name)
        response = FileResponse(
            source.file.open("rb"),
            content_type=source.file_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        """Secure authenticated document inline preview checking permissions and dealer scoping."""
        doc = self.get_object()
        self._check_dealer_access(doc, request.user)
        if not doc.file:
            raise ValidationError("Document file not found.")

        filename = os.path.basename(doc.file.name)
        response = FileResponse(
            doc.file.open("rb"),
            content_type=doc.file_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=["get"], url_path=r"versions/(?P<version_id>[^/.]+)/download")
    def version_download(self, request, pk=None, version_id=None):
        """Secure authenticated download of an archived version."""
        doc = self.get_object()
        self._check_dealer_access(doc, request.user)
        ver = get_object_or_404(DocumentVersion, document=doc, pk=version_id)
        if not ver.file:
            raise ValidationError("Version file not found.")

        filename = os.path.basename(ver.file.name)
        response = FileResponse(
            ver.file.open("rb"),
            content_type=ver.file_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
