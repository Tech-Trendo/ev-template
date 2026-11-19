from __future__ import annotations

from rest_framework import serializers
from django.utils import timezone
from .models import Event, EventVisitor, InterestLevel
from vehicles.models import Vehicle


class InterestLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterestLevel
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name cannot be empty.")
        return name

    def validate(self, attrs):
        name = attrs.get("name")
        if name:
            qs = InterestLevel.objects.filter(name__iexact=name.strip())
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"name": "Interest level with this name already exists."})
        return attrs


class EventSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField(read_only=True)
    visitors_count = serializers.SerializerMethodField(read_only=True)
    visitors = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Event
        fields = ["id", "name", "start_date", "end_date", "status", "visitors_count", "visitors", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "visitors_count", "visitors", "created_at", "updated_at"]

    def get_status(self, obj) -> str:
        today = timezone.localdate()
        if today < obj.start_date:
            return "upcoming"
        if today > obj.end_date:
            return "completed"
        return "ongoing"

    def get_visitors_count(self, obj) -> int:
        if hasattr(obj, "visitors_count_annotated"):
            return obj.visitors_count_annotated
        if hasattr(obj, "_visitor_count"):
            return obj._visitor_count
        # fallback: use annotated or count
        try:
            return obj.visitors.count()
        except Exception:
            return 0

    def get_visitors(self, obj) -> list:
        # limit for list? return count only; but keep for detail? Let's keep empty for list and actual list for detail if needed
        # We won't expose full visitors here; use nested endpoint instead
        return []

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Event name cannot be empty.")
        return value.strip()

    def validate(self, attrs):
        start = attrs.get("start_date") or (self.instance.start_date if self.instance else None)
        end = attrs.get("end_date") or (self.instance.end_date if self.instance else None)
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date cannot be before start date."})
        return attrs


class EventVisitorSerializer(serializers.ModelSerializer):
    photo = serializers.ImageField(required=False, allow_null=True)
    photo_display = serializers.SerializerMethodField(read_only=True)
    visited_at = serializers.DateTimeField(required=False, allow_null=True)
    interest_level = serializers.PrimaryKeyRelatedField(
        queryset=InterestLevel.objects.all(),
        required=False,
        allow_null=True,
    )
    # For reading, expand interest_level object
    interest_level_detail = InterestLevelSerializer(source="interest_level", read_only=True)
    # Also allow writing via interest_level_id name? but keep pk
    vehicle = serializers.PrimaryKeyRelatedField(
        queryset=Vehicle.objects.all(),
        required=False,
        allow_null=True,
    )
    vehicle_detail = serializers.SerializerMethodField(read_only=True)
    event = serializers.PrimaryKeyRelatedField(read_only=True)
    event_detail = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = EventVisitor
        fields = [
            "id",
            "event",
            "event_detail",
            "name",
            "phone",
            "email",
            "company",
            "address",
            "notes",
            "remarks",
            "interest_level",
            "interest_level_detail",
            "vehicle",
            "vehicle_detail",
            "photo",
            "photo_display",
            "visited_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "event", "photo_display", "interest_level_detail", "vehicle_detail", "event_detail", "created_at", "updated_at"]

    def get_photo_display(self, obj) -> str:
        request = self.context.get("request")
        src = obj.photo_url
        if src and request is not None and not src.startswith("http"):
            return request.build_absolute_uri(src)
        return src

    def get_vehicle_detail(self, obj) -> dict | None:
        if obj.vehicle:
            return {"id": obj.vehicle.id, "name": obj.vehicle.name, "slug": obj.vehicle.slug}
        return None

    def get_event_detail(self, obj) -> dict | None:
        if obj.event:
            return {"id": obj.event.id, "name": obj.event.name}
        return None

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Name cannot be empty.")
        return value.strip()

    def validate_phone(self, value):
        if not value:
            return ""
        # Support multiple numbers separated by "/" e.g. "9800000000/9800000001".
        # Normalize: split on "/", strip whitespace, drop empties, rejoin with "/".
        raw = str(value).strip()
        # Allow comma as separator too, normalize to "/"
        raw = raw.replace(",", "/")
        parts = [p.strip() for p in raw.split("/") if p.strip()]
        return "/".join(parts)

    def validate_email(self, value):
        if value and "@" not in value:
            raise serializers.ValidationError("Enter a valid email address.")
        return value

    def validate_visited_at(self, value):
        # visited_at is optional — None is allowed (means "no date recorded").
        # Missing value on create is defaulted to now in validate() below.
        return value

    def to_internal_value(self, data):
        # Treat "" as missing (HTML datetime-local sends "" when cleared).
        if isinstance(data, dict) and data.get("visited_at") == "":
            data = dict(data)
            data.pop("visited_at", None)
        return super().to_internal_value(data)

    def validate(self, attrs):
        # visited_at defaults to now when omitted on create, so manual/bulk
        # entry doesn't force typing date & time. Don't touch it on update
        # when the field was omitted (keeps existing value).
        if self.instance is None and not attrs.get("visited_at"):
            attrs["visited_at"] = timezone.now()
        # interest_level defaults to Hot if not provided and instance creation
        if self.instance is None and not attrs.get("interest_level"):
            # try to get Hot level
            try:
                hot = InterestLevel.objects.filter(name__iexact="Hot", is_active=True).first()
                if hot:
                    attrs["interest_level"] = hot
                else:
                    fallback = InterestLevel.objects.filter(is_active=True).first()
                    if fallback:
                        attrs["interest_level"] = fallback
            except Exception:
                pass
        return attrs
