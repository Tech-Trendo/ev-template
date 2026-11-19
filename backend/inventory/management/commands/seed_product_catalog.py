from django.core.management.base import BaseCommand

from inventory.product_catalog import seed_product_catalog


class Command(BaseCommand):
    help = (
        "Seed shared product variants (CHA/HDC/…) on every vehicle model and "
        "battery / cargo-length options for 6T and 10T models."
    )

    def handle(self, *args, **options):
        result = seed_product_catalog()
        self.stdout.write(
            self.style.SUCCESS(
                "Product catalog ready: {models} models, "
                "variants +{variants_created}/~{variants_updated}, "
                "specs +{specs_created}/~{specs_updated}.".format(**result)
            )
        )
