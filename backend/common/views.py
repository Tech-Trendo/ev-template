from __future__ import annotations

import logging

from django.db.models import Q
from django.utils.dateparse import parse_datetime, parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from accounts.models import (
    user_dealer_id,
    user_has_dealer_role,
    user_has_perm,
    user_is_super_admin,
)
from common.models import AuditLog, Notification
from common.serializers import AuditLogSerializer, NotificationSerializer

logger = logging.getLogger(__name__)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    In-app notifications for the authenticated user.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        user = self.request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                return Notification.objects.none()

        qs = Notification.objects.filter(recipient=user)
        unread_only = self.request.query_params.get("unread_only", "").lower() in ("true", "1")
        if unread_only:
            qs = qs.filter(is_read=False)
        return qs.order_by("-created_at", "-id")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request, *args, **kwargs):
        """Return the unread notification count for the current user."""
        user = request.user
        if not (user.is_superuser or user_is_super_admin(user)):
            if user_has_dealer_role(user) and not user_dealer_id(user):
                return Response({"unread_count": 0})

        count = Notification.objects.filter(
            recipient=user, is_read=False
        ).count()
        return Response({"unread_count": count})

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None, *args, **kwargs):
        """Mark a single notification as read."""
        notif = self.get_object()
        if not notif.is_read:
            notif.is_read = True
            notif.save(update_fields=["is_read"])
        return Response(self.get_serializer(notif).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request, *args, **kwargs):
        """Mark all notifications for current user as read."""
        count = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).update(is_read=True)
        return Response({"status": "ok", "marked_read": count})


class AuditLogPermission(permissions.BasePermission):
    """
    Ensure only Super Admin or users with explicit audit log viewing
    privileges can access audit entries.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if user_is_super_admin(request.user):
            return True
        return user_has_perm(request.user, "common.view_auditlog")


class AuditLogPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Audit ledger change history view.
    Filterable by model name (content_type), object_id, user, source, and date range.
    """

    permission_classes = [AuditLogPermission]
    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = AuditLog.objects.select_related("content_type", "changed_by").all()
        params = self.request.query_params

        model_name = params.get("content_type") or params.get("model")
        if model_name:
            model_name = model_name.strip().lower()
            qs = qs.filter(content_type__model=model_name)

        object_id = params.get("object_id")
        if object_id:
            qs = qs.filter(object_id=str(object_id).strip())

        source = params.get("source")
        if source:
            qs = qs.filter(source__iexact=source.strip())

        action = params.get("action")
        if action:
            qs = qs.filter(action__iexact=action.strip())

        user_id = params.get("user")
        if user_id:
            try:
                qs = qs.filter(changed_by_id=int(user_id))
            except ValueError:
                pass

        date_from = params.get("date_from")
        if date_from:
            d_from = parse_datetime(date_from) or parse_date(date_from)
            if d_from:
                qs = qs.filter(timestamp__gte=d_from)

        date_to = params.get("date_to")
        if date_to:
            d_to = parse_datetime(date_to) or parse_date(date_to)
            if d_to:
                qs = qs.filter(timestamp__lte=d_to)

        search = params.get("search")
        if search:
            search = search.strip()
            qs = qs.filter(
                Q(field_name__icontains=search)
                | Q(old_value__icontains=search)
                | Q(new_value__icontains=search)
                | Q(object_id__icontains=search)
                | Q(summary__icontains=search)
                | Q(action__icontains=search)
                | Q(changed_by__username__icontains=search)
            )

        return qs.order_by("-timestamp", "-id")

    @action(
        detail=False,
        methods=["post"],
        url_path="record-print",
        permission_classes=[permissions.IsAuthenticated],
    )
    def record_print(self, request, *args, **kwargs):
        """
        Record a print or PDF export event from frontend or backend services.
        Payload: { document_type, object_id, title }
        """
        from common.models import record_print_event

        document_type = request.data.get("document_type", "DOCUMENT")
        object_id = request.data.get("object_id", "")
        title = request.data.get("title", "")
        ip_addr = request.META.get("REMOTE_ADDR")
        log_entry = record_print_event(
            user=request.user,
            document_type=document_type,
            object_id=object_id,
            title=title,
            ip_address=ip_addr,
        )
        return Response(
            {"status": "ok", "id": log_entry.id, "summary": log_entry.summary}
        )


class UserAuditViewSetMixin:
    """
    Mixin for ViewSets to ensure created_by and updated_by are auto-set
    from request.user during perform_create and perform_update.
    """

    def perform_create(self, serializer):
        user = (
            self.request.user
            if (
                self.request
                and getattr(self.request, "user", None)
                and self.request.user.is_authenticated
            )
            else None
        )
        kwargs = {}
        model = getattr(getattr(serializer, "Meta", None), "model", None)
        if model and user:
            field_names = {f.name for f in model._meta.get_fields()}
            if "created_by" in field_names and "created_by" not in serializer.validated_data:
                kwargs["created_by"] = user
            if "updated_by" in field_names and "updated_by" not in serializer.validated_data:
                kwargs["updated_by"] = user
        serializer.save(**kwargs)

    def perform_update(self, serializer):
        user = (
            self.request.user
            if (
                self.request
                and getattr(self.request, "user", None)
                and self.request.user.is_authenticated
            )
            else None
        )
        kwargs = {}
        model = getattr(getattr(serializer, "Meta", None), "model", None)
        if model and user:
            field_names = {f.name for f in model._meta.get_fields()}
            if "updated_by" in field_names:
                kwargs["updated_by"] = user
        serializer.save(**kwargs)

