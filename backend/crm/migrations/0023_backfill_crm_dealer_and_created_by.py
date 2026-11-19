from django.db import migrations


def backfill_crm_dealer_and_created_by(apps, schema_editor):
    Lead = apps.get_model("crm", "Lead")
    Customer = apps.get_model("crm", "Customer")
    Opportunity = apps.get_model("crm", "Opportunity")
    TestDrive = apps.get_model("crm", "TestDrive")
    Quotation = apps.get_model("crm", "Quotation")
    Activity = apps.get_model("crm", "Activity")
    UserProfile = apps.get_model("accounts", "UserProfile")

    # Map user_id to dealer_id
    user_dealers = dict(
        UserProfile.objects.filter(dealer__isnull=False).values_list("user_id", "dealer_id")
    )

    # 1. Lead dealer backfill from created_by
    for lead in Lead.objects.filter(dealer__isnull=True):
        if lead.created_by_id and lead.created_by_id in user_dealers:
            lead.dealer_id = user_dealers[lead.created_by_id]
            lead.save(update_fields=["dealer"])

    # 2. Customer created_by and dealer
    for cust in Customer.objects.all():
        updated_fields = []
        if not cust.created_by_id and cust.lead_id and cust.lead.created_by_id:
            cust.created_by = cust.lead.created_by
            updated_fields.append("created_by")

        if not cust.dealer_id:
            if cust.lead_id and cust.lead.dealer_id:
                cust.dealer_id = cust.lead.dealer_id
                updated_fields.append("dealer")
            elif cust.created_by_id and cust.created_by_id in user_dealers:
                cust.dealer_id = user_dealers[cust.created_by_id]
                updated_fields.append("dealer")

        if updated_fields:
            cust.save(update_fields=updated_fields)

    # 3. Opportunity created_by and dealer
    for opp in Opportunity.objects.all():
        updated_fields = []
        if not opp.created_by_id and opp.assigned_to_id:
            opp.created_by = opp.assigned_to
            updated_fields.append("created_by")

        if not opp.dealer_id:
            if opp.customer_id and opp.customer.dealer_id:
                opp.dealer_id = opp.customer.dealer_id
                updated_fields.append("dealer")
            elif opp.created_by_id and opp.created_by_id in user_dealers:
                opp.dealer_id = user_dealers[opp.created_by_id]
                updated_fields.append("dealer")

        if updated_fields:
            opp.save(update_fields=updated_fields)

    # 4. TestDrive created_by and dealer
    for td in TestDrive.objects.all():
        updated_fields = []
        if not td.created_by_id and td.lead_id and td.lead.created_by_id:
            td.created_by = td.lead.created_by
            updated_fields.append("created_by")

        if not td.dealer_id:
            if td.unit_id and td.unit.dealer_id:
                td.dealer_id = td.unit.dealer_id
                updated_fields.append("dealer")
            elif td.customer_id and td.customer.dealer_id:
                td.dealer_id = td.customer.dealer_id
                updated_fields.append("dealer")
            elif td.lead_id and td.lead.dealer_id:
                td.dealer_id = td.lead.dealer_id
                updated_fields.append("dealer")
            elif td.created_by_id and td.created_by_id in user_dealers:
                td.dealer_id = user_dealers[td.created_by_id]
                updated_fields.append("dealer")

        if updated_fields:
            td.save(update_fields=updated_fields)

    # 5. Quotation created_by and dealer
    for q in Quotation.objects.all():
        updated_fields = []
        if not q.created_by_id and q.lead_id and q.lead.created_by_id:
            q.created_by = q.lead.created_by
            updated_fields.append("created_by")

        if not q.dealer_id:
            if q.reserved_unit_id and q.reserved_unit.dealer_id:
                q.dealer_id = q.reserved_unit.dealer_id
                updated_fields.append("dealer")
            elif q.unit_id and q.unit.dealer_id:
                q.dealer_id = q.unit.dealer_id
                updated_fields.append("dealer")
            elif q.customer_id and q.customer.dealer_id:
                q.dealer_id = q.customer.dealer_id
                updated_fields.append("dealer")
            elif q.lead_id and q.lead.dealer_id:
                q.dealer_id = q.lead.dealer_id
                updated_fields.append("dealer")
            elif q.created_by_id and q.created_by_id in user_dealers:
                q.dealer_id = user_dealers[q.created_by_id]
                updated_fields.append("dealer")

        if updated_fields:
            q.save(update_fields=updated_fields)

    # 6. Activity created_by and dealer
    for act in Activity.objects.all():
        updated_fields = []
        if not act.created_by_id and act.user_id:
            act.created_by = act.user
            updated_fields.append("created_by")

        if not act.dealer_id:
            if act.created_by_id and act.created_by_id in user_dealers:
                act.dealer_id = user_dealers[act.created_by_id]
                updated_fields.append("dealer")
            elif act.customer_id and act.customer.dealer_id:
                act.dealer_id = act.customer.dealer_id
                updated_fields.append("dealer")
            elif act.lead_id and act.lead.dealer_id:
                act.dealer_id = act.lead.dealer_id
                updated_fields.append("dealer")

        if updated_fields:
            act.save(update_fields=updated_fields)


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0022_activity_created_by_activity_dealer_and_more"),
        ("inventory", "0015_backfill_unit_dealer_and_sale_created_by"),
        ("accounts", "0005_quotation_edit_revise_perms"),
    ]

    operations = [
        migrations.RunPython(backfill_crm_dealer_and_created_by, migrations.RunPython.noop),
    ]
