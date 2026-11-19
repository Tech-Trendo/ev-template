from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hrm", "0002_hr_employees"),
    ]

    operations = [
        migrations.AddField(
            model_name="bsyearoverride",
            name="source",
            field=models.CharField(
                blank=True,
                choices=[("entered manually", "Entered manually"), ("api", "API")],
                default="entered manually",
                max_length=32,
            ),
        ),
    ]
