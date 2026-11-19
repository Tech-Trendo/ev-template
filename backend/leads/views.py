from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import HasRolePermission

from stories.models import Story
from vehicles.models import Vehicle

from .models import Enquiry
from .serializers import EnquiryCreateSerializer, EnquiryListSerializer

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


class EnquiryViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Enquiry.objects.all()
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["leads.view_enquiry"],
        "retrieve": ["leads.view_enquiry"],
        "create": ["leads.add_enquiry"],
        "update": ["leads.change_enquiry"],
        "partial_update": ["leads.change_enquiry"],
        "destroy": ["leads.delete_enquiry"],
        "stats": ["leads.view_enquiry"],
        "default": ["leads.view_enquiry"],
    }

    def get_serializer_class(self):
        if self.action == "create":
            return EnquiryCreateSerializer
        return EnquiryListSerializer

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [HasRolePermission()]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(company__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(vehicle__name__icontains=search)
            )

        status_filter = params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        enquiry_type = params.get("enquiry_type")
        if enquiry_type:
            qs = qs.filter(enquiry_type=enquiry_type)

        exclude_type = params.get("exclude_type")
        if exclude_type:
            qs = qs.exclude(enquiry_type=exclude_type)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # Opt-in server-side pagination (?page=&page_size=, default page size 10).
        page = request.query_params.get("page")
        page_size = request.query_params.get("page_size") or request.query_params.get("pageSize")
        if page is None and page_size is None:
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)

        try:
            page = int(page) if page is not None else 1
            page_size = int(page_size) if page_size is not None else DEFAULT_PAGE_SIZE
        except ValueError:
            page, page_size = 1, DEFAULT_PAGE_SIZE
        page = max(1, page)
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))

        total = queryset.count()
        total_pages = (total + page_size - 1) // page_size
        page = min(page, max(total_pages, 1))
        start = (page - 1) * page_size
        results = queryset[start : start + page_size]

        serializer = self.get_serializer(results, many=True)
        return Response(
            {
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "results": serializer.data,
            }
        )

    @action(detail=False, methods=["get"], permission_classes=[HasRolePermission])
    def stats(self, request):
        total = Enquiry.objects.count()
        new = Enquiry.objects.filter(status=Enquiry.Status.NEW).count()
        in_progress = Enquiry.objects.filter(
            status=Enquiry.Status.IN_PROGRESS
        ).count()
        closed = Enquiry.objects.filter(status=Enquiry.Status.CLOSED).count()
        by_type = {
            value: Enquiry.objects.filter(enquiry_type=value).count()
            for value in Enquiry.EnquiryType.values
        }
        recent = EnquiryListSerializer(
            Enquiry.objects.all()[:5], many=True, context={"request": request}
        ).data
        return Response(
            {
                "total": total,
                "by_status": {"new": new, "in_progress": in_progress, "closed": closed},
                "by_type": by_type,
                "recent": recent,
                "vehicles": Vehicle.objects.filter(is_active=True).count(),
                "stories": Story.objects.filter(status=Story.STATUS_PUBLISHED).count(),
            }
        )
