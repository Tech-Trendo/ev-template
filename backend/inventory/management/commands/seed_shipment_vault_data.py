from django.core.management.base import BaseCommand
from accounts.models import ensure_super_admin_role, seed_starter_roles
from crm.models import DocumentTypeMaster
from inventory.models import ShipmentCostType


class Command(BaseCommand):
    help = "Seed shipment cost types, document vault types, and refresh starter role permissions."

    def handle(self, *args, **options):
        self.stdout.write("Seeding Shipment Cost Types...")
        cost_types = [
            ("FREIGHT", "Freight", "Ocean / Air / Land freight forwarding charges"),
            ("CUSTOMS_DUTY", "Customs Duty", "Customs and border tariff duties"),
            ("VAT", "VAT", "Value Added Tax paid at customs"),
            ("CLEARING_AGENT", "Clearing Agent", "Customs clearing agent fees"),
            ("TRANSPORT", "Transport", "Inland transportation from border to Kathmandu"),
            ("INSURANCE", "Insurance", "Transit and maritime insurance coverage"),
            ("OTHER", "Other", "Miscellaneous handling or demurrage fees"),
        ]
        for code, name, desc in cost_types:
            obj, created = ShipmentCostType.objects.get_or_create(
                code=code,
                defaults={"name": name, "description": desc, "is_active": True},
            )
            status = "created" if created else "already exists"
            self.stdout.write(f"  - {name} ({code}): {status}")

        self.stdout.write("Seeding Document Vault Types...")
        doc_types = [
            ("BILL_OF_LADING", "Bill of Lading", "Bill of Lading or transport consignment note", True),
            ("COMMERCIAL_INVOICE", "Commercial Invoice", "Commercial invoice from manufacturer or supplier", True),
            ("PACKING_LIST", "Packing List", "Packing list specifying containers and crates", False),
            ("CUSTOMS_DECLARATION", "Customs Declaration", "Pragyapan Patra / Customs entry declaration", True),
            ("INSURANCE", "Insurance", "Transit or vehicle insurance certificate", False),
            ("WARRANTY", "Warranty", "Manufacturer warranty certificate", False),
            ("REGISTRATION", "Registration", "Department of Transport vehicle registration / blue book", False),
            ("ROADWORTHINESS", "Roadworthiness", "Vehicle fitness and roadworthiness certificate", False),
            ("OTHER", "Other", "Other supporting documentation", False),
        ]
        for code, name, desc, req in doc_types:
            obj, created = DocumentTypeMaster.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "description": desc,
                    "is_required_for_shipment": req,
                    "is_active": True,
                },
            )
            status = "created" if created else "already exists"
            self.stdout.write(f"  - {name} ({code}, required={req}): {status}")

        self.stdout.write("Refreshing roles and permissions...")
        ensure_super_admin_role()
        seed_starter_roles()
        self.stdout.write(self.style.SUCCESS("Shipment vault seed completed successfully."))
