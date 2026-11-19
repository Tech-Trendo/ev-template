from rest_framework import serializers

from .models import CmsPage


class CmsPageSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CmsPage
        fields = ["page", "data", "updated_at", "updated_by_name"]
        read_only_fields = ["updated_at"]

    def get_updated_by_name(self, obj) -> str:
        user = obj.updated_by
        if not user:
            return ""
        return user.get_full_name() or user.get_username()

    def validate_page(self, value):
        allowed = [choice[0] for choice in CmsPage._meta.get_field("page").choices]
        if value not in allowed:
            raise serializers.ValidationError(f"Unknown page '{value}'.")
        return value

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Content must be a JSON object.")
        return value
