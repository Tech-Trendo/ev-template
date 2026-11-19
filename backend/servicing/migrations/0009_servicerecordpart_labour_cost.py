from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("servicing", "0008_ev_company_branding"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicerecordpart",
            name="labour_cost",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
