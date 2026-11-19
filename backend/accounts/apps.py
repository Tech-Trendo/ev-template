from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self):
        # Keep the Super Admin role in sync with newly created permissions.
        # This is a framework-level post_migrate hook (permissions were just
        # (re)created), not a business-logic signal — the codebase's
        # no-signals convention for UserProfile creation is unaffected.
        from django.db.models.signals import post_migrate

        from .models import ensure_super_admin_role

        def sync_super_admin(sender, **kwargs):
            # Only run once per migrate (for this app) to avoid duplicate work.
            if getattr(sender, "name", None) != "accounts":
                return
            try:
                from django.db import connection, transaction

                # During historic migrations (e.g. accounts 0002 running
                # before 0003 adds is_protected) the Role table may not have
                # the new column yet. Skip sync in that case — the data
                # migration itself seeds roles, and 0003 backfills the flag.
                try:
                    with connection.cursor() as cur:
                        cols = {
                            f.name
                            for f in connection.introspection.get_table_description(
                                cur, "accounts_role"
                            )
                        }
                    if "is_protected" not in cols:
                        return
                except Exception:
                    return
                with transaction.atomic():
                    ensure_super_admin_role()
            except Exception:
                # Never break migrate because of RBAC sync (e.g. during
                # squash or when the auth tables are not ready yet).
                pass

        post_migrate.connect(sync_super_admin, dispatch_uid="accounts.sync_super_admin")
