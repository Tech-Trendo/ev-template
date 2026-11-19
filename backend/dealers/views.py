from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from accounts.models import user_dealer_id, user_has_dealer_role, user_is_super_admin
from accounts.permissions import HasRolePermission

from .models import Dealer
from .serializers import DealerSerializer


class DealerViewSet(viewsets.ModelViewSet):
    """CRUD for dealers. Admin-only (dealers are not shown on the public site)."""

    serializer_class = DealerSerializer
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["dealers.view_dealer"],
        "retrieve": ["dealers.view_dealer"],
        "create": ["dealers.add_dealer"],
        "update": ["dealers.change_dealer"],
        "partial_update": ["dealers.change_dealer"],
        "destroy": ["dealers.delete_dealer"],
        "default": ["dealers.view_dealer"],
    }

    def get_queryset(self):
        qs = Dealer.objects.all()
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            home_dealer = user_dealer_id(user)
            if home_dealer is not None:
                qs = qs.filter(id=home_dealer)
            elif user_has_dealer_role(user):
                return qs.none()

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(contact_person__icontains=search)
                | Q(phone__icontains=search)
                | Q(district__icontains=search)
            )
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by("name")

    def perform_create(self, serializer):
        user = self.request.user
        home_dealer = user_dealer_id(user) if not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer is not None or user_has_dealer_role(user):
            raise PermissionDenied("Dealer users cannot create dealerships.")
        serializer.save(created_by=user, updated_by=user)

    def perform_update(self, serializer):
        user = self.request.user
        home_dealer = user_dealer_id(user) if not (user.is_superuser or user_is_super_admin(user)) else None
        if user_has_dealer_role(user):
            if home_dealer is None or serializer.instance.id != home_dealer:
                raise PermissionDenied("Dealer users cannot edit other dealerships.")
        elif home_dealer is not None and serializer.instance.id != home_dealer:
            raise PermissionDenied("Dealer users cannot edit other dealerships.")
        serializer.save(updated_by=user)

    def perform_destroy(self, instance):
        user = self.request.user
        home_dealer = user_dealer_id(user) if not (user.is_superuser or user_is_super_admin(user)) else None
        if home_dealer is not None or user_has_dealer_role(user):
            raise PermissionDenied("Dealer users cannot delete dealerships.")
        instance.delete()
