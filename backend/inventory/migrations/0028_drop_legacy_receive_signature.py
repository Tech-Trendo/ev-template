"""Remove a legacy NOT NULL signature column from receive checklists.

Older databases carry a legacy NOT NULL signature column on the receive
checklist table from a previous field name.  The current model writes
``rep_signature`` (added defensively by 0027).  Leaving the legacy column in
place makes every new checklist insert fail, so copy any data across and drop
it.
"""

from django.db import migrations

TABLE = "inventory_vehiclereceivechecklist"
LEGACY = "evergreen_rep_signature"
CURRENT = "rep_signature"


def drop_legacy_column(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        tables = schema_editor.connection.introspection.table_names(cursor)
        if TABLE not in tables:
            return
        description = schema_editor.connection.introspection.get_table_description(cursor, TABLE)
        columns = {field.name for field in description}
        if LEGACY not in columns:
            return
        if CURRENT in columns:
            schema_editor.execute(
                f'UPDATE "{TABLE}" SET "{CURRENT}" = "{LEGACY}" '
                f'WHERE ("{CURRENT}" IS NULL OR "{CURRENT}" = \'\') '
                f'AND "{LEGACY}" IS NOT NULL'
            )
        else:
            schema_editor.execute(
                f'ALTER TABLE "{TABLE}" RENAME COLUMN "{LEGACY}" TO "{CURRENT}"'
            )
            return
        schema_editor.execute(f'ALTER TABLE "{TABLE}" DROP COLUMN "{LEGACY}"')


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0027_repair_receive_checklist_signature"),
    ]

    operations = [
        migrations.RunPython(drop_legacy_column, migrations.RunPython.noop),
    ]
