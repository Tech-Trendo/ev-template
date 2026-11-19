from rest_framework import serializers

from .models import AttendanceRecord


class AttendanceRecordSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "user",
            "username",
            "full_name",
            "timestamp",
            "type",
            "confidence_score",
            "device",
            "location",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_username(self, obj):
        return obj.user.username

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username
