import os
import uuid

from django.core.files.storage import default_storage
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import user_has_perm, user_is_super_admin
from accounts.permissions import HasRolePermission

from .models import Story
from .serializers import StorySerializer, StoryListSerializer


def absolutize(request, src):
    if src and request is not None and not src.startswith("http"):
        return request.build_absolute_uri(src)
    return src


class StoryViewSet(viewsets.ModelViewSet):
    queryset = Story.objects.all()
    serializer_class = StorySerializer
    lookup_field = "slug"
    lookup_value_regex = "[^/]+"
    # RBAC for admin writes (public list/retrieve stay open).
    permission_classes = [HasRolePermission]
    perm_map = {
        "list": ["stories.view_story"],
        "retrieve": ["stories.view_story"],
        "categories": ["stories.view_story"],
        "related": ["stories.view_story"],
        "create": ["stories.add_story"],
        "update": ["stories.change_story"],
        "partial_update": ["stories.change_story"],
        "destroy": ["stories.delete_story"],
        "publish": ["stories.change_story"],
        "unpublish": ["stories.change_story"],
        "upload_image": ["stories.add_story", "stories.change_story"],
        "default": ["stories.view_story"],
    }

    def get_object(self):
        # Support lookup by slug OR id (admin compatibility), mirroring vehicles
        lookup = self.kwargs.get(self.lookup_field)
        if lookup is None:
            return super().get_object()
        queryset = self.filter_queryset(self.get_queryset())
        obj = queryset.filter(slug=lookup).first()
        if obj:
            self.check_object_permissions(self.request, obj)
            return obj
        if str(lookup).isdigit():
            obj = get_object_or_404(queryset, pk=lookup)
            self.check_object_permissions(self.request, obj)
            return obj
        return get_object_or_404(queryset, slug=lookup)

    def get_queryset(self):
        qs = Story.objects.select_related("author").prefetch_related("tags")
        public_read = self.request.method in ("GET", "HEAD", "OPTIONS")
        user = self.request.user
        can_see_all = (
            user.is_authenticated
            and user.is_active
            and (
                user.is_superuser
                or user_is_super_admin(user)
                or user_has_perm(user, "stories.view_story")
            )
        )
        staff_all = can_see_all and self.request.query_params.get("all")
        if public_read and not staff_all:
            qs = qs.filter(status=Story.STATUS_PUBLISHED)

        params = self.request.query_params

        # Search: title / excerpt / category / author name
        search = params.get("search")
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(excerpt__icontains=search)
                | Q(category__icontains=search)
                | Q(author__first_name__icontains=search)
                | Q(author__last_name__icontains=search)
                | Q(author__username__icontains=search)
            )

        category = params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)

        tag = params.get("tag")
        if tag:
            qs = qs.filter(tags__name__iexact=tag)

        author = params.get("author")
        if author and str(author).isdigit():
            qs = qs.filter(author_id=int(author))

        status_filter = params.get("status")
        if status_filter and staff_all:
            qs = qs.filter(status=status_filter)

        # Date range on published_date
        date_from = parse_date(params["date_from"]) if params.get("date_from") else None
        date_to = parse_date(params["date_to"]) if params.get("date_to") else None
        if date_from:
            qs = qs.filter(published_date__gte=date_from)
        if date_to:
            qs = qs.filter(published_date__lte=date_to)

        return qs.order_by("-published_date", "-id")

    def get_serializer_class(self):
        if self.action == "list":
            return StoryListSerializer
        return StorySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve", "categories", "related"):
            return [AllowAny()]
        return [HasRolePermission()]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # Optional manual pagination (envelope style matches events visitors)
        page = request.query_params.get("page")
        page_size = request.query_params.get("page_size") or request.query_params.get("pageSize")
        if page is not None or page_size is not None:
            try:
                page = int(page) if page is not None else 1
                page_size = int(page_size) if page_size is not None else 9
            except ValueError:
                page, page_size = 1, 9
            page_size = max(1, min(page_size, 50))
            total = queryset.count()
            start = (page - 1) * page_size
            results = queryset[start : start + page_size]
            serializer = self.get_serializer(results, many=True)
            return Response(
                {
                    "count": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": (total + page_size - 1) // page_size,
                    "results": serializer.data,
                }
            )

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        data = dict(self.get_serializer(instance).data)

        if instance.is_published:
            published_ids = list(
                Story.objects.filter(status=Story.STATUS_PUBLISHED)
                .order_by("-published_date", "-id")
                .values_list("id", flat=True)
            )
            neighbors = {}
            if instance.id in published_ids:
                idx = published_ids.index(instance.id)
                older_id = published_ids[idx + 1] if idx + 1 < len(published_ids) else None
                newer_id = published_ids[idx - 1] if idx > 0 else None
                for key, rel_id in (("previous", older_id), ("next", newer_id)):
                    if rel_id:
                        rel = Story.objects.get(pk=rel_id)
                        neighbors[key] = {
                            "title": rel.title,
                            "slug": rel.slug,
                            "image_display": absolutize(request, rel.image_src),
                        }
            data.update({k: neighbors.get(k) for k in ("previous", "next")})
        return Response(data)

    @action(detail=False, methods=["get"])
    def categories(self, request):
        values = (
            Story.objects.exclude(category="")
            .values_list("category", flat=True)
            .distinct()
            .order_by("category")
        )
        return Response(list(values))

    @action(detail=True, methods=["post"], permission_classes=[HasRolePermission])
    def publish(self, request, *args, **kwargs):
        story = self.get_object()
        story.status = Story.STATUS_PUBLISHED
        story.save(update_fields=["status"])
        return Response({"id": story.id, "status": story.status})

    @action(detail=True, methods=["post"], permission_classes=[HasRolePermission])
    def unpublish(self, request, *args, **kwargs):
        story = self.get_object()
        story.status = Story.STATUS_DRAFT
        story.save(update_fields=["status"])
        return Response({"id": story.id, "status": story.status})

    @action(detail=True, methods=["get"])
    def related(self, request, *args, **kwargs):
        story = self.get_object()
        published = Story.objects.filter(status=Story.STATUS_PUBLISHED).exclude(pk=story.pk)
        tag_ids = list(story.tags.values_list("id", flat=True))

        related = []
        if tag_ids:
            shared = Count("tags", filter=Q(tags__id__in=tag_ids), distinct=True)
            related = list(
                published.filter(tags__id__in=tag_ids)
                .annotate(shared_tags=shared)
                .order_by("-shared_tags", "-published_date", "-id")[:6]
            )
        if len(related) < 3 and story.category:
            exclude_ids = {s.pk for s in related}
            filler = list(
                published.exclude(pk__in=exclude_ids)
                .filter(category__iexact=story.category)
                .order_by("-published_date", "-id")[: 3 - len(related)]
            )
            related.extend(filler)
        related = related[:6]
        serializer = StoryListSerializer(related, many=True, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=["post"], permission_classes=[HasRolePermission])
    def upload_image(self, request):
        image = request.FILES.get("image")
        if not image:
            return Response(
                {"detail": "No image file provided."}, status=http_status.HTTP_400_BAD_REQUEST
            )
        ext = os.path.splitext(image.name)[1].lower() or ".jpg"
        name = f"stories/content/{uuid.uuid4().hex}{ext}"
        saved = default_storage.save(name, image)
        url = request.build_absolute_uri(default_storage.url(saved))
        alt = str(request.data.get("alt") or "").strip()[:200]
        return Response({"url": url, "alt": alt}, status=http_status.HTTP_201_CREATED)
