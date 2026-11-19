from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0002_assign_role_perms"),
    ]

    operations = [
        migrations.DeleteModel(name="StaffFaceProfile"),
    ]
