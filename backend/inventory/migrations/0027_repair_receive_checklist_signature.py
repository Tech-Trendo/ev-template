"""Repair databases created from an older revision of migration 0004.

The ``rep_signature`` column was added to ``0004_...`` after some databases
had already recorded that migration as applied, leaving them with the field in
Django's migration state but not in the physical table.  This migration adds
the column only when it is actually missing, so fresh databases (where 0004
already created it) are unaffected.
"""

from django.db import migrations


def add_missing_signature_column(apps, schema_editor):
    table = "inventory_vehiclereceivechecklist"
    column = "rep_signature"

    with schema_editor.connection.cursor() as cursor:
        tables = schema_editor.connection.introspection.table_names(cursor)
        if table not in tables:
            return
        description = schema_editor.connection.introspection.get_table_description(cursor, table)
        if column in {field.name for field in description}:
            return

        schema_editor.execute(
            f'ALTER TABLE "{table}" ADD COLUMN "{column}" varchar(150) NOT NULL DEFAULT \'\''
        )


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0026_vehiclereceivechecklist_service_record"),
    ]

    operations = [
        migrations.RunPython(add_missing_signature_column, migrations.RunPython.noop),
    ]
