import mimetypes
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.http import FileResponse, Http404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from common.signed_urls import private_media_url

from .models import Role, get_user_profile, user_is_super_admin, user_permission_labels, user_has_perm
from .permissions import IsSuperAdmin
from .serializers import PermissionSerializer, RoleSerializer, UserSerializer

User = get_user_model()

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsSuperAdmin]
    queryset = User.objects.all().order_by("-date_joined", "-id")
    lookup_field = "pk"

    def get_queryset(self):
        qs = User.objects.all().order_by("-date_joined", "-id")
        # Optional search: ?search=username/email
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
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

    @action(detail=True, methods=["get"], url_path="photo", permission_classes=[IsAuthenticated])
    def photo(self, request, pk=None):
        """Serve a staff profile photo from private storage (self or Super Admin)."""
        user = self.get_object()
        if not (
            request.user.pk == user.pk
            or request.user.is_superuser
            or user_is_super_admin(request.user)
        ):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        profile = get_user_profile(user)
        if not profile.photo:
            raise Http404("No photo uploaded.")
        filename = os.path.basename(profile.photo.name)
        content_type, _ = mimetypes.guess_type(filename)
        response = FileResponse(
            profile.photo.open("rb"),
            content_type=content_type or "application/octet-stream",
        )
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        # Prevent self-deletion
        if request.user.pk == instance.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Optional: prevent deleting the last superuser? Allow but warn? We allow since is_staff is enough.
        # But if target is the only superuser and requester is not superuser, maybe block? We keep simple: allow deletion otherwise.
        return super().destroy(request, *args, **kwargs)


class RoleViewSet(viewsets.ModelViewSet):
    """CRUD for RBAC roles. Super Admin only."""

    serializer_class = RoleSerializer
    permission_classes = [IsSuperAdmin]
    queryset = Role.objects.all().prefetch_related("permissions", "profiles")

    def _is_protected_role(self, instance):
        return bool(getattr(instance, "is_protected", False)) or instance.name == "Super Admin"

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if self._is_protected_role(instance):
            return Response(
                {"detail": "The Super Admin role cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if self._is_protected_role(instance):
            new_name = request.data.get("name", instance.name)
            if str(new_name).strip() != instance.name:
                return Response(
                    {"detail": "The Super Admin role cannot be renamed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Never allow clearing the protected flag via the API.
            if "is_protected" in request.data and not request.data.get("is_protected"):
                return Response(
                    {"detail": "The Super Admin role must remain protected."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Prevent hijacking the reserved name (case-insensitive) or
            # clearing protection on other roles to escalate.
            new_name = request.data.get("name")
            if new_name is not None and str(new_name).strip().lower() == "super admin":
                return Response(
                    {"detail": 'The name "Super Admin" is reserved.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """List all available Django permission labels for role assignment."""

    serializer_class = PermissionSerializer
    permission_classes = [IsSuperAdmin]
    queryset = Permission.objects.select_related("content_type").order_by(
        "content_type__app_label", "codename"
    )

    def get_queryset(self):
        qs = super().get_queryset()
        app_label = self.request.query_params.get("app_label")
        if app_label:
            qs = qs.filter(content_type__app_label=app_label)
        return qs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    """Current user + RBAC snapshot for frontend nav/route gating.

    Returns id/username, role ids + names, home dealer, the full sorted
    ``app_label.codename`` permission list (direct + groups + roles), and
    ``is_super_admin`` (Django superuser or Super Admin role).
    """
    user = request.user
    profile = get_user_profile(user)
    role_ids = list(profile.roles.values_list("id", flat=True))
    role_names = list(profile.roles.values_list("name", flat=True))
    can_view_sensitive = bool(
        user.is_superuser
        or user_is_super_admin(user)
        or user_has_perm(user, "accounts.view_employee_sensitive")
    )
    from hrm.people import person_snapshot

    payload = {
        "id": user.pk,
        "username": user.username,
        "email": user.email or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "is_superuser": user.is_superuser,
        "is_staff": user.is_staff,
        "is_active": user.is_active,
        "is_super_admin": user_is_super_admin(user),
        "roles": role_ids,
        "role_names": role_names,
        "dealer": profile.dealer_id,
        "dealer_name": profile.dealer.name if profile.dealer_id else "",
        "permissions": sorted(user_permission_labels(user)),
        "can_view_sensitive": can_view_sensitive,
        "photo_url": private_media_url(request, profile.resolved_photo_url()),
    }
    payload.update(person_snapshot(user, user))
    linked_photo = payload.get("employee_id")
    if linked_photo:
        from hrm.models import Employee

        employee = Employee.objects.filter(pk=linked_photo).first()
        if employee and employee.photo:
            payload["photo_url"] = private_media_url(request, f"/api/hrm/employees/{employee.id}/photo/")
    return Response(payload)


me = current_user


class StaffTokenObtainPairView(TokenObtainPairView):
    """
    JWT token obtain view that dispatches user_logged_in signal on successful authentication,
    recording a LOGIN entry in the staff activity audit log.
    """

    def post(self, request, *args, **kwargs):
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0]) from e

        user = getattr(serializer, "user", None)
        if user:
            from django.contrib.auth.signals import user_logged_in
            user_logged_in.send(sender=user.__class__, request=request, user=user)

        return Response(serializer.validated_data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Staff user logout endpoint: triggers user_logged_out signal, recording a LOGOUT
    entry in the staff activity audit log. Client discards JWT tokens.
    """
    from django.contrib.auth.signals import user_logged_out
    user_logged_out.send(sender=request.user.__class__, request=request, user=request.user)
    return Response({"detail": "Logged out successfully."})

