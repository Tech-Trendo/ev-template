from django.db import migrations, models


def forwards(apps, schema_editor):
    ServiceRecord = apps.get_model("servicing", "ServiceRecord")
    ServiceRecord.objects.filter(ev_company="").update(ev_company="Vehicle Template")


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("servicing", "0009_servicerecordpart_labour_cost"),
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
        migrations.RunPython(forwards, backwards),
    ]
