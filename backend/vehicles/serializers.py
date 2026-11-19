import json

from rest_framework import serializers

from dealers.models import Dealer

from .models import Vehicle, VehicleStat, VehicleFeature, VehicleGalleryImage, SpecificationGroup, Specification


class VehicleStatSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleStat
        fields = ["id", "label", "value", "sort_order"]
        read_only_fields = ["id"]


class VehicleFeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleFeature
        fields = ["id", "title", "description", "icon", "sort_order"]
        read_only_fields = ["id"]


class VehicleGalleryImageSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)
    image_display = serializers.SerializerMethodField()

    class Meta:
        model = VehicleGalleryImage
        fields = ["id", "image", "image_url", "image_display", "alt_text", "caption", "sort_order"]
        read_only_fields = ["id", "image_display"]

    def get_image_display(self, obj) -> str:
        request = self.context.get("request")
        src = obj.image_src
        if src and request is not None and not src.startswith("http"):
            return request.build_absolute_uri(src)
        return src


class SpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Specification
        fields = ["id", "label", "value", "sort_order"]
        read_only_fields = ["id"]


class SpecificationGroupSerializer(serializers.ModelSerializer):
    specifications = SpecificationSerializer(many=True, required=False)

    class Meta:
        model = SpecificationGroup
        fields = ["id", "title", "sort_order", "specifications"]
        read_only_fields = ["id"]


class VehicleSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)
    image_display = serializers.SerializerMethodField()
    dealer = serializers.PrimaryKeyRelatedField(
        queryset=Dealer.objects.all(), required=False, allow_null=True
    )
    dealer_name = serializers.SerializerMethodField()
    stock_summary = serializers.SerializerMethodField(read_only=True)
    stats = VehicleStatSerializer(many=True, required=False)
    features = VehicleFeatureSerializer(many=True, required=False)
    gallery = VehicleGalleryImageSerializer(many=True, required=False)
    specification_groups = SpecificationGroupSerializer(many=True, required=False)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = Vehicle
        fields = [
            "id",
            "slug",
            "name",
            "category",
            "payload",
            "range_km",
            "battery",
            "image",
            "image_url",
            "image_display",
            "tag",
            "alt_text",
            "description",
            "hero_heading",
            "hero_description",
            "primary_cta_label",
            "secondary_cta_label",
            "engineered_heading",
            "engineered_description",
            "is_active",
            "sort_order",
            "dealer",
            "dealer_name",
            "stats",
            "features",
            "gallery",
            "specification_groups",
            "stock_summary",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
        ]
        read_only_fields = [
            "id",
            "image_display",
            "dealer_name",
            "slug",
            "stock_summary",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
        ]

    def get_stock_summary(self, obj) -> dict:
        request = self.context.get("request")
        # Only compute inventory counts for authenticated staff/admin users
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return {"total_units": 0, "in_stock": 0, "sold": 0, "in_servicing": 0}
        try:
            from inventory.models import VehicleUnit, VehicleModel
            from servicing.models import ServiceRecord

            vm = VehicleModel.objects.filter(model_name__icontains=obj.name).first()
            if not vm and " " in obj.name:
                part = obj.name.split(" ", 1)[1]
                vm = VehicleModel.objects.filter(model_name__icontains=part).first()

            if vm:
                units = VehicleUnit.objects.filter(vehicle_model=vm)
                total = units.count()
                sold = units.filter(status=VehicleUnit.Status.SOLD).count()
                in_stock = units.filter(
                    status__in=[VehicleUnit.Status.READY_FOR_SALE, VehicleUnit.Status.IN_WAREHOUSE]
                ).count()
                in_servicing = ServiceRecord.objects.filter(
                    vehicle_unit__in=units,
                    status__in=[
                        ServiceRecord.Status.RECEIVED,
                        ServiceRecord.Status.IN_PROGRESS,
                        ServiceRecord.Status.WAITING_FOR_PARTS,
                    ],
                ).count()
                return {
                    "total_units": total,
                    "in_stock": in_stock,
                    "sold": sold,
                    "in_servicing": in_servicing,
                }
        except Exception:
            pass
        return {"total_units": 0, "in_stock": 0, "sold": 0, "in_servicing": 0}

    def get_dealer_name(self, obj) -> str:
        return obj.dealer.name if getattr(obj, "dealer_id", None) else ""

    def get_image_display(self, obj) -> str:
        request = self.context.get("request")
        src = obj.image_src
        if src and request is not None and not src.startswith("http"):
            return request.build_absolute_uri(src)
        return src

    def _parse_json_field(self, data, field):
        """Handle multipart where nested JSON is sent as string."""
        val = data.get(field)
        if isinstance(val, str):
            try:
                parsed = json.loads(val)
                return parsed
            except Exception:
                return []
        return val

    def _extract_nested(self, validated_data, data):
        # For multipart, DRF may have nested data as strings
        for field in ["stats", "features", "gallery", "specification_groups"]:
            if field not in validated_data and field in data:
                parsed = self._parse_json_field(data, field)
                if parsed is not None:
                    validated_data[field] = parsed
        return validated_data

    def create(self, validated_data):
        # Handle nested data passed as JSON string in multipart
        request_data = self.context.get("request").data if self.context.get("request") else {}
        validated_data = self._extract_nested(validated_data, request_data)

        stats_data = validated_data.pop("stats", [])
        features_data = validated_data.pop("features", [])
        gallery_data = validated_data.pop("gallery", [])
        spec_groups_data = validated_data.pop("specification_groups", [])

        # Gallery file handling for multipart: gallery may include files via gallery_images_files
        # But we handle gallery image files via indexed keys like gallery[0].image
        vehicle = Vehicle.objects.create(**validated_data)

        for s in stats_data:
            if s.get("label") and s.get("value"):
                VehicleStat.objects.create(vehicle=vehicle, **{k: v for k, v in s.items() if k in ["label", "value", "sort_order"]})
        for f in features_data:
            if f.get("title"):
                VehicleFeature.objects.create(vehicle=vehicle, **{k: v for k, v in f.items() if k in ["title", "description", "icon", "sort_order"]})
        created_gallery = []
        for g in gallery_data:
            # g may contain image as file object or url
            obj = VehicleGalleryImage.objects.create(vehicle=vehicle, **{k: v for k, v in g.items() if k in ["image", "image_url", "alt_text", "caption", "sort_order"]})
            created_gallery.append(obj)
        # Handle gallery file uploads via gallery_0_image keys
        request = self.context.get("request")
        if request and hasattr(request, "FILES"):
            for key, file in request.FILES.items():
                if key.startswith("gallery_") and key.endswith("_image"):
                    try:
                        idx = int(key.split("_")[1])
                        if idx < len(created_gallery):
                            gal = created_gallery[idx]
                            gal.image = file
                            gal.image_url = ""
                            gal.save(update_fields=["image", "image_url"])
                    except Exception:
                        pass
        for grp in spec_groups_data:
            specs = grp.pop("specifications", [])
            if not grp.get("title"):
                continue
            group = SpecificationGroup.objects.create(vehicle=vehicle, **{k: v for k, v in grp.items() if k in ["title", "sort_order"]})
            for spec in specs:
                if spec.get("label"):
                    Specification.objects.create(group=group, **{k: v for k, v in spec.items() if k in ["label", "value", "sort_order"]})

        return vehicle

    def update(self, instance, validated_data):
        request_data = self.context.get("request").data if self.context.get("request") else {}
        validated_data = self._extract_nested(validated_data, request_data)

        stats_data = validated_data.pop("stats", None)
        features_data = validated_data.pop("features", None)
        gallery_data = validated_data.pop("gallery", None)
        spec_groups_data = validated_data.pop("specification_groups", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if stats_data is not None:
            instance.stats.all().delete()
            for s in stats_data:
                if s.get("label") and s.get("value"):
                    VehicleStat.objects.create(vehicle=instance, **{k: v for k, v in s.items() if k in ["label", "value", "sort_order"]})
        if features_data is not None:
            instance.features.all().delete()
            for f in features_data:
                if f.get("title"):
                    VehicleFeature.objects.create(vehicle=instance, **{k: v for k, v in f.items() if k in ["title", "description", "icon", "sort_order"]})
        if gallery_data is not None:
            # Preserve existing file objects before delete to allow keeping uploaded images
            old_gallery = list(instance.gallery.all())
            old_by_index = {i: g for i, g in enumerate(old_gallery)}
            instance.gallery.all().delete()
            # Create new gallery entries
            created = []
            for idx, g in enumerate(gallery_data):
                # g may contain image as file object or url; filter allowed keys
                data = {k: v for k, v in g.items() if k in ["image", "image_url", "alt_text", "caption", "sort_order"]}
                # If no image_url and no image file but old had image file, preserve old file via URL fallback
                # Frontend may send existing image_display as image_url to preserve; handle that
                if not data.get("image_url") and not data.get("image"):
                    # Check if frontend provided image_display as preservation hint
                    if g.get("image_display") and old_by_index.get(idx):
                        # Use old's image_url if exists, else keep file reference by copying via image_url fallback
                        old = old_by_index[idx]
                        if old.image and old.image.name:
                            # Copy file reference: we will set image via file copy after creation
                            data["_preserve_image_idx"] = idx
                        elif old.image_url:
                            data["image_url"] = old.image_url
                        # Also preserve caption/alt if not provided
                    elif old_by_index.get(idx) and old_by_index[idx].image and old_by_index[idx].image.name and not data.get("image_url"):
                        data["_preserve_image_idx"] = idx
                obj = VehicleGalleryImage.objects.create(vehicle=instance, **{k: v for k, v in data.items() if k not in ["_preserve_image_idx"]})
                if data.get("_preserve_image_idx") is not None:
                    old = old_by_index[idx]
                    # Copy file
                    try:
                        obj.image = old.image
                        obj.save(update_fields=["image"])
                    except Exception:
                        pass
                created.append(obj)
            # Check for uploaded files with keys gallery_0_image etc
            request = self.context.get("request")
            if request and hasattr(request, "FILES"):
                for key, file in request.FILES.items():
                    if key.startswith("gallery_") and key.endswith("_image"):
                        try:
                            idx = int(key.split("_")[1])
                            gal = created[idx] if idx < len(created) else instance.gallery.all()[idx]
                            gal.image = file
                            # Clear image_url if file provided (priority to file)
                            gal.image_url = ""
                            gal.save(update_fields=["image", "image_url"])
                        except Exception:
                            pass
        if spec_groups_data is not None:
            # Delete existing groups (cascades specs)
            instance.specification_groups.all().delete()
            for grp in spec_groups_data:
                specs = grp.pop("specifications", [])
                if not grp.get("title"):
                    continue
                group = SpecificationGroup.objects.create(vehicle=instance, **{k: v for k, v in grp.items() if k in ["title", "sort_order"]})
                for spec in specs:
                    if spec.get("label"):
                        Specification.objects.create(group=group, **{k: v for k, v in spec.items() if k in ["label", "value", "sort_order"]})

        return instance
