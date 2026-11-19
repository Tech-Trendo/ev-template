"""File storage backends for public and private media.

Public marketing media (when USE_S3):
  - Legacy files still on the VPS MEDIA_ROOT keep serving via /media/
  - New uploads go to S3 only and are served via signed S3 URLs
    (DataHub buckets are private — bare object URLs 403)

Private media:
  - S3 (or local PRIVATE_MEDIA_ROOT) and only via authenticated API endpoints
"""

from __future__ import annotations

import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible
from django.utils.functional import LazyObject


@deconstructible
class PrivateFileSystemStorage(FileSystemStorage):
    """File storage for private/sensitive assets outside the public media tree."""

    def __init__(self, *args, **kwargs):
        location = getattr(settings, "PRIVATE_MEDIA_ROOT", None)
        if not location:
            location = os.path.join(settings.BASE_DIR, "private_media")
        kwargs.setdefault("location", location)
        kwargs.setdefault("base_url", None)
        super().__init__(*args, **kwargs)

    def url(self, name):
        """Private files do not have a direct public URL."""
        raise AttributeError(
            f"This private file '{name}' cannot be accessed via a direct public URL. "
            "Use an authenticated API endpoint to view or download it."
        )


try:
    from storages.backends.s3boto3 import S3Boto3Storage
except ImportError:  # pragma: no cover — django-storages optional until USE_S3
    S3Boto3Storage = None  # type: ignore[misc, assignment]


if S3Boto3Storage is not None:

    @deconstructible
    class PublicMediaS3Storage(S3Boto3Storage):
        """New public media → S3; legacy local files → /media/."""

        location = "media"
        file_overwrite = False
        default_acl = None
        # Private DataHub bucket — signed querystring URLs for objects not on disk.
        querystring_auth = True

        def _local_fs(self) -> FileSystemStorage:
            return FileSystemStorage(
                location=str(settings.MEDIA_ROOT),
                base_url=getattr(settings, "MEDIA_URL", "/media/") or "/media/",
            )

        def _clean_field_name(self, name: str) -> str:
            cleaned = self._clean_name(name) if hasattr(self, "_clean_name") else name
            loc = (self.location or "").strip("/")
            if loc and cleaned.startswith(loc + "/"):
                cleaned = cleaned[len(loc) + 1 :]
            return cleaned.lstrip("/")

        def _local_exists(self, name: str) -> bool:
            local = self._local_fs()
            cleaned = self._clean_field_name(name)
            return local.exists(cleaned) or local.exists(name)

        def _save(self, name, content):
            # New uploads are S3-only (legacy files already on disk keep /media/).
            return super()._save(name, content)

        def url(self, name, parameters=None, expire=None, http_method=None):
            cleaned = self._clean_field_name(name)
            if self._local_exists(name):
                base = getattr(settings, "MEDIA_URL", "/media/") or "/media/"
                if not base.endswith("/"):
                    base += "/"
                return f"{base}{cleaned}"
            # Not on the VPS volume → signed S3 URL so a private bucket still loads.
            if expire is None:
                expire = getattr(settings, "AWS_QUERYSTRING_EXPIRE", None)
            return super().url(name, parameters=parameters, expire=expire, http_method=http_method)

        def exists(self, name):
            if self._local_exists(name):
                return True
            try:
                return super().exists(name)
            except Exception:
                return False

        def delete(self, name):
            try:
                self._local_fs().delete(self._clean_field_name(name))
            except Exception:
                pass
            try:
                super().delete(name)
            except Exception:
                pass

        def open(self, name, mode="rb"):
            local = self._local_fs()
            cleaned = self._clean_field_name(name)
            if local.exists(cleaned):
                return local.open(cleaned, mode)
            if local.exists(name):
                return local.open(name, mode)
            return super().open(name, mode)

    @deconstructible
    class PrivateMediaS3Storage(S3Boto3Storage):
        """Sensitive assets under `private/` — no public URLs."""

        location = "private"
        file_overwrite = False
        default_acl = "private"
        querystring_auth = False

        def url(self, name):
            raise AttributeError(
                f"This private file '{name}' cannot be accessed via a direct public URL. "
                "Use an authenticated API endpoint to view or download it."
            )


class DefaultPrivateStorage(LazyObject):
    """Resolve STORAGES['private'] at first use so S3/local swap works without model edits."""

    def _setup(self):
        from django.core.files.storage import storages

        self._wrapped = storages["private"]


private_storage = DefaultPrivateStorage()
