from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0029_quotation_battery_capacity_quotation_charger_info_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="extra_specs",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Extra specification rows added on the quotation, as {label, value} objects.",
            ),
        ),
    ]
