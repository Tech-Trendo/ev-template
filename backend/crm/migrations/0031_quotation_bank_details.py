from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0030_quotation_extra_specs"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="bank_name",
            field=models.CharField(
                blank=True,
                default="GLOBAL IME BANK LTD",
                help_text="Bank name printed in the quotation account details.",
                max_length=200,
            ),
        ),
        migrations.AddField(
            model_name="quotation",
            name="bank_address",
            field=models.CharField(
                blank=True,
                default="KULESHWOR BRANCH",
                help_text="Bank branch or address printed in the quotation account details.",
                max_length=200,
            ),
        ),
        migrations.AlterField(
            model_name="quotation",
            name="vehicle_length",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Cargo length, e.g. 16 FT, 20 FT",
                max_length=50,
            ),
        ),
    ]
