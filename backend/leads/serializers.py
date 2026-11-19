from rest_framework import serializers

from .models import Enquiry
from vehicles.models import Vehicle


class EnquiryCreateSerializer(serializers.ModelSerializer):
    vehicle_name = serializers.CharField(
        source="vehicle.name", required=False, allow_blank=True, write_only=True
    )

    class Meta:
        model = Enquiry
        fields = [
            "id",
            "name",
            "company",
            "phone",
            "email",
            "vehicle_name",
            "enquiry_type",
            "message",
        ]

    def validate_vehicle_name(self, value):
        if value and value not in ("Other / Multiple",):
            if not Vehicle.objects.filter(name=value).exists():
                raise serializers.ValidationError("Unknown vehicle.")
        return value

    def create(self, validated_data):
        vehicle_name = validated_data.pop("vehicle", {}).get("name")
        vehicle = (
            Vehicle.objects.filter(name=vehicle_name).first() if vehicle_name else None
        )
        return Enquiry.objects.create(vehicle=vehicle, **validated_data)


class EnquiryListSerializer(serializers.ModelSerializer):
    vehicle = serializers.StringRelatedField()
    lead_display = serializers.SerializerMethodField()

    class Meta:
        model = Enquiry
        fields = "__all__"

    def get_lead_display(self, obj):
        if obj.lead:
            return {
                "id": obj.lead.id,
                "name": obj.lead.resolved_name,
                "status": obj.lead.status,
            }
        return None
