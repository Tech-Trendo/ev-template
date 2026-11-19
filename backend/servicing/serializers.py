from rest_framework import serializers

from common.signed_urls import private_media_url

from .models import ServiceEntryImage, ServiceRecord, ServiceRecordPart


class ServiceRecordPartSerializer(serializers.ModelSerializer):
    total_cost = serializers.FloatField(read_only=True)
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)

    class Meta:
        model = ServiceRecordPart
        fields = [
            "id",
            "part_name",
            "part_number",
            "quantity",
            "labour_cost",
            "cost",
            "total_cost",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
        ]
        read_only_fields = ["id", "total_cost", "created_by", "created_by_name", "updated_by", "updated_by_name"]


class ServiceEntryImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceEntryImage
        fields = ["id", "item_key", "image_url"]
        read_only_fields = fields

    def get_image_url(self, obj):
        return private_media_url(self.context.get("request"), obj.image_src)


class ServiceRecordSerializer(serializers.ModelSerializer):
    chassis_number = serializers.CharField(required=False, allow_blank=True, max_length=100)
    parts = ServiceRecordPartSerializer(many=True, required=False)
    entry_images = ServiceEntryImageSerializer(many=True, read_only=True)
    dealer_name = serializers.SerializerMethodField()
    vehicle_name = serializers.SerializerMethodField()
    technician_name = serializers.SerializerMethodField()
    duration_display = serializers.CharField(read_only=True)
    total_cost = serializers.FloatField(read_only=True)
    lead_name = serializers.SerializerMethodField()
    vehicle_model_name = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(read_only=True)
    updated_by_name = serializers.CharField(read_only=True)
    has_receive_checklist = serializers.BooleanField(read_only=True, required=False)
    receive_checklist_id = serializers.IntegerField(read_only=True, required=False, allow_null=True)
    vro_filled = serializers.SerializerMethodField()

    class Meta:
        model = ServiceRecord
        fields = [
            "id",
            "vro_no",
            "is_external",
            "chassis_number",
            "vehicle_unit",
            "vehicle",
            "vehicle_name",
            "vehicle_model_name",
            "lead",
            "lead_name",
            "customer",
            "customer_name",
            "customer_address",
            "customer_mobile",
            "dealer",
            "dealer_name",
            "status",
            "technician",
            "technician_name",
            "date_received",
            "time_received",
            "date_completed",
            "actual_delivered_at",
            "duration_display",
            "v_reg_no",
            "battery_kw",
            "motor_no",
            "date_of_sale",
            "ev_company",
            "estimated_cost",
            "labour_cost",
            "parts_cost",
            "total_cost",
            "job_description",
            "action_taken",
            "service_notes",
            "odometer_reading",
            "entry_inventory",
            "service_advisor",
            "work_forwarded_to",
            "customer_undertaking_agreed",
            "customer_signature",
            "parts",
            "entry_images",
            "job_type",
            "source",
            "import_job",
            "has_receive_checklist",
            "receive_checklist_id",
            "vro_filled",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vro_no",
            "duration_display",
            "total_cost",
            "source",
            "import_job",
            "has_receive_checklist",
            "receive_checklist_id",
            "vro_filled",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "created_at",
            "updated_at",
        ]

    def to_internal_value(self, data):
        # Support "unit" alias for "vehicle_unit"
        if "unit" in data and "vehicle_unit" not in data:
            data = data.copy() if hasattr(data, "copy") else dict(data)
            data["vehicle_unit"] = data.get("unit")
        return super().to_internal_value(data)

    def get_dealer_name(self, obj):
        return obj.dealer_name or (obj.dealer.name if obj.dealer_id else "")

    def get_vehicle_name(self, obj):
        if obj.vehicle_unit and obj.vehicle_unit.vehicle_model:
            m = obj.vehicle_unit.vehicle_model
            return str(m)
        return obj.vehicle.name if obj.vehicle_id else ""

    def get_vehicle_model_name(self, obj):
        return self.get_vehicle_name(obj)

    def get_technician_name(self, obj):
        if obj.technician_id is None:
            return getattr(obj, "technician_name", "") or ""
        return obj.technician.get_full_name() or obj.technician.username

    def get_lead_name(self, obj):
        if not obj.lead_id:
            return ""
        return obj.lead.resolved_name if hasattr(obj.lead, "resolved_name") else str(obj.lead)

    def get_vro_filled(self, obj) -> bool:
        """True once workshop fields have been filled on the repair order form."""
        if (obj.job_description or "").strip():
            return True
        if (obj.action_taken or "").strip():
            return True
        if (obj.service_advisor or "").strip():
            return True
        if (obj.customer_signature or "").strip():
            return True
        if list(obj.parts.all()):
            return True
        inv = obj.entry_inventory or {}
        return any(
            isinstance(v, dict) and (v.get("present") or (v.get("remarks") or "").strip())
            for v in inv.values()
        )

    def validate(self, attrs):
        unit = attrs.get("vehicle_unit")
        if unit is None and self.instance:
            unit = self.instance.vehicle_unit

        chassis = attrs.get("chassis_number")
        if chassis is not None:
            chassis = chassis.strip()
            attrs["chassis_number"] = chassis
        elif self.instance:
            chassis = self.instance.chassis_number

        if unit and not chassis:
            attrs["chassis_number"] = unit.vin_chassis_no
            chassis = unit.vin_chassis_no
        if not chassis and not unit:
            raise serializers.ValidationError({"chassis_number": "Chassis number is required."})

        # Server-side snapshot population from unit
        if unit:
            if not attrs.get("motor_no") and unit.motor_no:
                attrs["motor_no"] = unit.motor_no
            if not attrs.get("battery_kw") and unit.effective_battery_kw is not None:
                attrs["battery_kw"] = unit.effective_battery_kw
            if not attrs.get("v_reg_no") and unit.registration_no:
                attrs["v_reg_no"] = unit.registration_no
            if not attrs.get("date_of_sale") and unit.sold_date:
                attrs["date_of_sale"] = unit.sold_date

            # Validate registration number difference
            v_reg_clean = str(attrs.get("v_reg_no") or "").strip()
            existing_reg = str(unit.registration_no or "").strip()
            confirm_reg = (
                self.initial_data.get("confirm_registration_change") in (True, "true", "True", "1", 1)
                or self.initial_data.get("override_registration") in (True, "true", "True", "1", 1)
                if hasattr(self, "initial_data") else False
            )
            if v_reg_clean and existing_reg and existing_reg != v_reg_clean and not confirm_reg:
                raise serializers.ValidationError(
                    {
                        "v_reg_no": (
                            f"Entered registration number '{v_reg_clean}' differs from vehicle unit's "
                            f"registered number '{existing_reg}'. Send confirm_registration_change=true to confirm change."
                        )
                    }
                )

        # Validate owner match unless override_customer is provided
        override = (
            self.initial_data.get("override_customer") in (True, "true", "True", "1", 1)
            if hasattr(self, "initial_data") else False
        )
        customer = attrs.get("customer")
        if customer is None and self.instance:
            customer = self.instance.customer

        if unit and customer and unit.current_customer and customer != unit.current_customer and not override:
            raise serializers.ValidationError(
                {
                    "customer": (
                        f"Selected customer '{customer.name}' does not match unit's current owner "
                        f"'{unit.current_customer.name}'. Send override_customer=true to proceed."
                    )
                }
            )

        is_external = attrs.get(
            "is_external",
            self.instance.is_external if self.instance else False,
        )

        # Server-side snapshot population from customer
        cust = customer or (unit.current_customer if unit else None)
        if not cust and self.instance:
            cust = self.instance.customer or (
                self.instance.vehicle_unit.current_customer
                if self.instance.vehicle_unit
                else None
            )

        # A4: Customer identity fields inherited from linked Customer must be READ-ONLY in the API
        # once vehicle_unit/customer is set (unless is_external=True).
        # Reject any attempt to change them with a 400.
        if not is_external and (cust or (unit and (unit.current_customer or unit.customer_name))):
            target_name = (cust.name if cust else (unit.customer_name if unit else "")) or ""
            if self.instance and not target_name:
                target_name = self.instance.customer_name or ""

            provided_name = None
            if hasattr(self, "initial_data") and "customer_name" in self.initial_data:
                provided_name = self.initial_data.get("customer_name")
            elif "customer_name" in attrs:
                provided_name = attrs.get("customer_name")

            if provided_name is not None:
                clean_provided = str(provided_name).strip()
                clean_target = str(target_name).strip()
                if clean_target and clean_provided != clean_target:
                    raise serializers.ValidationError(
                        {
                            "customer_name": (
                                f"Customer name is read-only when linked to customer '{clean_target}' "
                                "and cannot be changed via servicing records."
                            )
                        }
                    )

            if target_name:
                attrs["customer_name"] = target_name

        if cust:
            if not attrs.get("customer_name"):
                attrs["customer_name"] = cust.name
            if not attrs.get("customer_mobile") and cust.phone:
                attrs["customer_mobile"] = cust.phone
            if not attrs.get("customer_address") and cust.location:
                attrs["customer_address"] = cust.location

        return attrs

    def _save_parts(self, record, parts_data):
        for part in parts_data:
            if not part.get("part_name"):
                continue
            ServiceRecordPart.objects.create(
                record=record,
                **{
                    k: v
                    for k, v in part.items()
                    if k in ["part_name", "part_number", "quantity", "labour_cost", "cost"]
                },
            )

    def _sync_unit_registration(self, record, v_reg_no):
        from common.models import log_audit_event

        unit = record.vehicle_unit
        if not unit or not v_reg_no:
            return
        reg_clean = str(v_reg_no).strip()
        old_reg = (unit.registration_no or "").strip()
        if old_reg != reg_clean:
            unit.registration_no = reg_clean
            unit._skip_audit_signal = True
            unit.save(update_fields=["registration_no", "updated_at"])
            request = self.context.get("request")
            acting_user = (
                request.user
                if (request and request.user and request.user.is_authenticated)
                else None
            )
            user_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"
            log_audit_event(
                instance=unit,
                field_name="registration_no",
                old_value=old_reg,
                new_value=reg_clean,
                changed_by=acting_user,
                source="REGISTRATION_CHANGE",
                action="UPDATE",
                summary=f"{user_name} updated registration for VIN {unit.vin_chassis_no}",
            )

    def _sync_customer_contacts(self, record):
        from common.models import log_audit_event
        from common.phone import normalize_nepal_phone

        cust = record.customer
        if not cust:
            return

        initial = getattr(self, "initial_data", {}) or {}
        request = self.context.get("request")
        acting_user = (
            request.user
            if (request and request.user and request.user.is_authenticated)
            else None
        )
        user_name = acting_user.get_full_name() or acting_user.username if acting_user else "System"
        update_fields = []

        # Phone
        new_phone = initial.get("customer_mobile") or record.customer_mobile
        if new_phone is not None:
            new_phone_str = str(new_phone).strip()
            if new_phone_str and new_phone_str != cust.phone:
                log_audit_event(
                    instance=cust,
                    field_name="phone",
                    old_value=cust.phone,
                    new_value=new_phone_str,
                    changed_by=acting_user,
                    source="SERVICING",
                    action="UPDATE",
                    summary=f"{user_name} updated phone for customer {cust.name}",
                )
                cust.phone = new_phone_str
                cust.phone_normalized = normalize_nepal_phone(new_phone_str)
                update_fields.extend(["phone", "phone_normalized"])

        # Email
        new_email = initial.get("customer_email")
        if new_email is not None:
            new_email_str = str(new_email).strip()
            if new_email_str and new_email_str != cust.email:
                log_audit_event(
                    instance=cust,
                    field_name="email",
                    old_value=cust.email,
                    new_value=new_email_str,
                    changed_by=acting_user,
                    source="SERVICING",
                    action="UPDATE",
                    summary=f"{user_name} updated email for customer {cust.name}",
                )
                cust.email = new_email_str
                update_fields.append("email")

        # Address / Location
        new_address = initial.get("customer_address") or record.customer_address
        if new_address is not None:
            new_address_str = str(new_address).strip()
            if new_address_str and new_address_str != cust.location:
                log_audit_event(
                    instance=cust,
                    field_name="location",
                    old_value=cust.location,
                    new_value=new_address_str,
                    changed_by=acting_user,
                    source="SERVICING",
                    action="UPDATE",
                    summary=f"{user_name} updated location for customer {cust.name}",
                )
                cust.location = new_address_str
                update_fields.append("location")

        if update_fields:
            cust._skip_audit_signal = True
            cust.save(update_fields=list(set(update_fields)) + ["updated_at"])

    def create(self, validated_data):
        parts_data = validated_data.pop("parts", [])
        record = ServiceRecord.objects.create(**validated_data)
        self._save_parts(record, parts_data)
        self._sync_unit_registration(record, record.v_reg_no)
        self._sync_customer_contacts(record)
        return record

    def update(self, instance, validated_data):
        parts_data = validated_data.pop("parts", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if parts_data is not None:
            instance.parts.all().delete()
            self._save_parts(instance, parts_data)
        self._sync_unit_registration(instance, instance.v_reg_no)
        self._sync_customer_contacts(instance)
        return instance
