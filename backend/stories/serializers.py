from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Story, Tag
from .sanitizer import sanitize_html

User = get_user_model()


def _absolutize(request, src):
    if src and request is not None and not src.startswith("http"):
        return request.build_absolute_uri(src)
    return src


class StoryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing endpoints (no heavy content/SEO)."""

    image = serializers.ImageField(required=False, allow_null=True)
    image_display = serializers.SerializerMethodField()
    author_detail = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    reading_time = serializers.SerializerMethodField()

    class Meta:
        model = Story
        fields = [
            "id",
            "title",
            "slug",
            "excerpt",
            "category",
            "image",
            "image_url",
            "image_display",
            "alt_text",
            "author",
            "author_detail",
            "published_date",
            "status",
            "reading_time",
            "reading_time_override",
            "is_featured",
            "tags",
            "updated_at",
        ]
        read_only_fields = ["id", "image_display", "author_detail", "tags", "reading_time"]

    def get_image_display(self, obj) -> str | None:
        return _absolutize(self.context.get("request"), obj.image_src)

    def get_author_detail(self, obj) -> dict:
        return author_payload(obj, self.context.get("request"))

    def get_tags(self, obj) -> list:
        return [t.name for t in obj.tags.all()]

    def get_reading_time(self, obj) -> int:
        return obj.reading_time


def author_payload(obj, request):
    photo_src = obj.author_photo_src
    return {
        "id": obj.author_id,
        "name": obj.author_name or "",
        "role": obj.author_role or "",
        "bio": obj.author_bio or "",
        "photo": _absolutize(request, photo_src),
    }


class StorySerializer(StoryListSerializer):
    """Full serializer: rich content, SEO fields, writable everything."""

    content = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=60),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    tags_display = serializers.SerializerMethodField(read_only=True)
    seo_image_display = serializers.SerializerMethodField(read_only=True)

    class Meta(StoryListSerializer.Meta):
        fields = StoryListSerializer.Meta.fields + [
            "content",
            "author_role",
            "author_bio",
            "author_photo",
            "author_photo_url",
            "sort_order",
            "seo_title",
            "seo_description",
            "og_image",
            "og_image_url",
            "created_at",
            "updated_at",
            "tags_display",
            "seo_image_display",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # `tags` is write-only (list of names); expose read via tags_display
        data.pop("tags", None)
        return data

    def get_tags_display(self, obj) -> list:
        return [{"id": t.id, "name": t.name, "slug": t.slug} for t in obj.tags.all()]

    def get_seo_image_display(self, obj) -> str | None:
        return _absolutize(self.context.get("request"), obj.seo_image_src)

    def validate_content(self, value):
        return sanitize_html(value)

    def validate_excerpt(self, value):
        # Excerpt is plain text; strip any markup accidentally pasted
        from django.utils.html import strip_tags

        return strip_tags(value or "").strip()

    def validate_seo_description(self, value):
        from django.utils.html import strip_tags

        return strip_tags(value or "").strip()

    def _resolve_tags(self, names):
        resolved = []
        for name in names:
            name = name.strip()
            if not name:
                continue
            tag, _created = Tag.objects.get_or_create(
                name__iexact=name, defaults={"name": name}
            )
            resolved.append(tag)
        return resolved

    def create(self, validated_data):
        tag_names = validated_data.pop("tags", None)
        request = self.context.get("request")
        if request is not None and not validated_data.get("author"):
            user = getattr(request, "user", None)
            if user is not None and user.is_authenticated:
                validated_data["author"] = user
        story = super().create(validated_data)
        if tag_names is not None:
            story.tags.set(self._resolve_tags(tag_names))
        return story

    def update(self, instance, validated_data):
        tag_names = validated_data.pop("tags", None)
        story = super().update(instance, validated_data)
        if tag_names is not None:
            story.tags.set(self._resolve_tags(tag_names))
        return story
