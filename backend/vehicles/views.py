from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from accounts.models import user_has_perm, user_is_super_admin
from accounts.permissions import HasRolePermission
from common.views import UserAuditViewSetMixin

from .models import Vehicle
from .serializers import VehicleSerializer


class VehicleViewSet(UserAuditViewSetMixin, viewsets.ModelViewSet):
    queryset = Vehicle.objects.all().prefetch_related(
        "stats", "features", "gallery", "specification_groups__specifications"
    )
    serializer_class = VehicleSerializer
    lookup_field = "slug"
    lookup_value_regex = "[^/]+"

    def get_object(self):
        # Support lookup by slug OR id (for admin compatibility)
        lookup = self.kwargs.get(self.lookup_field)
        if lookup is None:
            return super().get_object()
        queryset = self.filter_queryset(self.get_queryset())
        # Try slug first
        obj = queryset.filter(slug=lookup).first()
        if obj:
            self.check_object_permissions(self.request, obj)
            return obj
        # Fallback to pk lookup (numeric)
        if str(lookup).isdigit():
            obj = get_object_or_404(queryset, pk=lookup)
            self.check_object_permissions(self.request, obj)
            return obj
        # Not found -> 404
        return get_object_or_404(queryset, slug=lookup)

    def get_queryset(self):
        qs = Vehicle.objects.all().select_related("dealer").prefetch_related(
            "stats", "features", "gallery", "specification_groups__specifications"
        )
        public = self.request.method in ("GET", "HEAD", "OPTIONS")
        user = self.request.user
        can_see_all = (
            user.is_authenticated
            and user.is_active
            and (
                user.is_superuser
                or user_is_super_admin(user)
                or user_has_perm(user, "vehicles.view_vehicle")
            )
        )
        staff_all = can_see_all and self.request.query_params.get("all")
        if public and not staff_all:
            return qs.filter(is_active=True)
        return qs

    # RBAC for admin writes. Public list/retrieve stay open (AllowAny);
    # every write requires the matching vehicles.* permission (Super Admin
    # passes via HasRolePermission's superuser / Super Admin handling).
    perm_map = {
        "create": ["vehicles.add_vehicle"],
        "update": ["vehicles.change_vehicle"],
        "partial_update": ["vehicles.change_vehicle"],
        "destroy": ["vehicles.delete_vehicle"],
        "default": ["vehicles.view_vehicle"],
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasRolePermission()]
