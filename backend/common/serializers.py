from __future__ import annotations

from rest_framework import serializers

from common.models import AuditLog, Notification


class NotificationSerializer(serializers.ModelSerializer):
    target_type = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "link",
            "is_read",
            "created_at",
            "dedup_key",
            "target_type",
            "object_id",
        ]
        read_only_fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "link",
            "created_at",
            "dedup_key",
            "target_type",
            "object_id",
        ]

    def get_target_type(self, obj) -> str | None:
        return obj.content_type.model if obj.content_type else None


class AuditLogSerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(
        source="changed_by.username", read_only=True, default=""
    )
    changed_by_name = serializers.SerializerMethodField()
    model_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "model_name",
            "object_id",
            "field_name",
            "old_value",
            "new_value",
            "action",
            "summary",
            "ip_address",
            "changed_by",
            "changed_by_username",
            "changed_by_name",
            "source",
            "timestamp",
        ]
        read_only_fields = fields

    def get_model_name(self, obj) -> str:
        return obj.content_type.model if obj.content_type else "system"

    def get_changed_by_name(self, obj) -> str:
        if not obj.changed_by:
            return "System"
        full = obj.changed_by.get_full_name()
        return full if full else obj.changed_by.username


class CreatedUpdatedByMixin:
    """
    Mixin for ModelSerializers to expose created_by_name and updated_by_name,
    and automatically populate created_by and updated_by from request.user on save.
    """

    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    def create(self, validated_data):
        request = self.context.get("request")
        user = (
            request.user
            if (request and getattr(request, "user", None) and request.user.is_authenticated)
            else None
        )
        model = getattr(getattr(self, "Meta", None), "model", None)
        if model and user:
            field_names = {f.name for f in model._meta.get_fields()}
            if "created_by" in field_names and "created_by" not in validated_data:
                validated_data["created_by"] = user
            if "updated_by" in field_names and "updated_by" not in validated_data:
                validated_data["updated_by"] = user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        user = (
            request.user
            if (request and getattr(request, "user", None) and request.user.is_authenticated)
            else None
        )
        model = getattr(getattr(self, "Meta", None), "model", None)
        if model and user:
            field_names = {f.name for f in model._meta.get_fields()}
            if "updated_by" in field_names:
                validated_data["updated_by"] = user
        return super().update(instance, validated_data)

