from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("servicing", "0009_servicerecordpart_labour_cost"),
        ("inventory", "0025_vei_shares_pdi_checklist"),
    ]

    operations = [
        migrations.AddField(
            model_name="vehiclereceivechecklist",
            name="service_record",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="receive_checklists",
                to="servicing.servicerecord",
            ),
        ),
    ]
