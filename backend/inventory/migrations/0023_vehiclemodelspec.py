from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0022_shipment_cost_import_source"),
    ]

    operations = [
        migrations.CreateModel(
            name="VehicleModelSpec",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("battery", "Battery capacity"), ("cargo_length", "Cargo length")], db_index=True, max_length=20)),
                ("label", models.CharField(max_length=100)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("vehicle_model", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="specs", to="inventory.vehiclemodel")),
            ],
            options={
                "ordering": ["vehicle_model", "kind", "sort_order", "label"],
            },
        ),
        migrations.AddConstraint(
            model_name="vehiclemodelspec",
            constraint=models.UniqueConstraint(fields=("vehicle_model", "kind", "label"), name="uniq_vehicle_model_spec_label"),
        ),
    ]
