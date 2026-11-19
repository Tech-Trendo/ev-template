from rest_framework import serializers

from .models import Dealer


class DealerSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = Dealer
        fields = [
            "id",
            "name",
            "contact_person",
            "phone",
            "email",
            "address",
            "district",
            "status",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        qs = Dealer.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A dealer with this name already exists.")
        return value
