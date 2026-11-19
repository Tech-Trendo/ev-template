from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("servicing", "0007_service_entry_image"),
    ]

    operations = [
        migrations.AlterField(
            model_name="servicerecord",
            name="ev_company",
            field=models.CharField(
                blank=True,
                default="Vehicle Template",
                max_length=150,
            ),
        ),
    ]
