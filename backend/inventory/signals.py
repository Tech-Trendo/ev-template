from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver


import logging

logger = logging.getLogger(__name__)


def register_signals():
    try:
        from vehicles.models import Vehicle
        from .models import sync_catalog_vehicles_to_models

        @receiver(post_save, sender=Vehicle, dispatch_uid="inventory_sync_vehicle_on_save")
        def on_vehicle_saved(sender, instance, created, **kwargs):
            sync_catalog_vehicles_to_models()

        @receiver(post_delete, sender=Vehicle, dispatch_uid="inventory_sync_vehicle_on_delete")
        def on_vehicle_deleted(sender, instance, **kwargs):
            sync_catalog_vehicles_to_models()
    except Exception as exc:
        logger.warning("Could not register vehicle catalog sync signals: %s", exc)
