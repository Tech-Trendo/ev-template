from django.core.management.base import BaseCommand

from crm.nrb_import import import_nrb_banks


class Command(BaseCommand):
    help = "Import banks and branches from the Nepal Rastra Bank list saved in crm/data/nrb_banks.json."

    def handle(self, *args, **options):
        result = import_nrb_banks()
        if result.get("skipped"):
            self.stderr.write(self.style.WARNING("NRB bank list file was not found."))
            return
        self.stdout.write(
            self.style.SUCCESS(
                "Imported {banks} banks, created {branches_created} branches, "
                "updated {branches_updated} branches.".format(**result)
            )
        )
