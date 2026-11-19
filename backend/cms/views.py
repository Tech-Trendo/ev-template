import os
import uuid

from django.core.files.storage import default_storage
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import HasRolePermission

from .models import CmsPage
from .serializers import CmsPageSerializer


class CmsPageViewSet(viewsets.ModelViewSet):
    """
    Page content CMS.

    - list/retrieve are public (site pages read their content).
    - create/update/delete are admin-only.
    - Pages are addressed by slug, e.g. /api/cms/pages/home/
    """

    queryset = CmsPage.objects.all()
    serializer_class = CmsPageSerializer
    lookup_field = "page"
    lookup_value_regex = "[^/]+"
    perm_map = {
        "list": ["cms.view_cmspage"],
        "retrieve": ["cms.view_cmspage"],
        "create": ["cms.add_cmspage"],
        "update": ["cms.change_cmspage"],
        "partial_update": ["cms.change_cmspage"],
        "destroy": ["cms.delete_cmspage"],
        "upload_image": ["cms.add_cmspage", "cms.change_cmspage"],
        "default": ["cms.view_cmspage"],
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [HasRolePermission()]

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)

    @action(detail=False, methods=["post"], permission_classes=[HasRolePermission], url_path="upload-image")
    def upload_image(self, request):
        image = request.FILES.get("image")
        if not image:
            return Response(
                {"detail": "No image file provided."}, status=http_status.HTTP_400_BAD_REQUEST
            )
        ext = os.path.splitext(image.name)[1].lower() or ".jpg"
        name = f"cms/{uuid.uuid4().hex}{ext}"
        saved = default_storage.save(name, image)
        url = request.build_absolute_uri(default_storage.url(saved))
        alt = str(request.data.get("alt") or "").strip()[:200]
        return Response({"url": url, "alt": alt}, status=http_status.HTTP_201_CREATED)
