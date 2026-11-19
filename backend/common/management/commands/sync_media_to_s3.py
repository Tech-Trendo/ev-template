"""Upload local MEDIA_ROOT / PRIVATE_MEDIA_ROOT files into the configured S3 bucket.

Public files → s3://{bucket}/media/{relative}
Private files → s3://{bucket}/private/{relative}

Idempotent: skips objects that already exist with the same size.
Does not delete local originals (keep them until you verify the site).
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Sync local media + private_media directories to the DataHub / S3 bucket."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List files that would be uploaded without uploading.",
        )
        parser.add_argument(
            "--only",
            choices=["media", "private", "all"],
            default="all",
            help="Which local tree to sync (default: all).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-upload even when an object with the same size already exists.",
        )

    def handle(self, *args, **options):
        if not getattr(settings, "USE_S3", False):
            raise CommandError(
                "S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_STORAGE_BUCKET_NAME, "
                "and AWS_S3_ENDPOINT_URL first."
            )

        dry_run = options["dry_run"]
        only = options["only"]
        force = options["force"]
        client = self._s3_client()
        bucket = settings.AWS_STORAGE_BUCKET_NAME

        totals = {"uploaded": 0, "skipped": 0, "missing_dirs": 0, "errors": 0}

        if only in ("media", "all"):
            media_root = Path(settings.MEDIA_ROOT)
            self.stdout.write(f"Public media root: {media_root}")
            self._sync_tree(
                client=client,
                bucket=bucket,
                local_root=media_root,
                key_prefix="media/",
                dry_run=dry_run,
                force=force,
                totals=totals,
                public=True,
            )

        if only in ("private", "all"):
            private_root = Path(settings.PRIVATE_MEDIA_ROOT)
            self.stdout.write(f"Private media root: {private_root}")
            self._sync_tree(
                client=client,
                bucket=bucket,
                local_root=private_root,
                key_prefix="private/",
                dry_run=dry_run,
                force=force,
                totals=totals,
                public=False,
            )

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. uploaded={totals['uploaded']} skipped={totals['skipped']} "
                f"errors={totals['errors']} missing_dirs={totals['missing_dirs']}"
                + (" (dry-run)" if dry_run else "")
            )
        )
        if totals["uploaded"] and not dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "Make sure the bucket allows public GetObject for prefix media/ "
                    "(bucket policy). private/ must stay private."
                )
            )

    def _sync_tree(
        self,
        *,
        client,
        bucket: str,
        local_root: Path,
        key_prefix: str,
        dry_run: bool,
        force: bool,
        totals: dict,
        public: bool,
    ) -> None:
        if not local_root.exists():
            self.stdout.write(self.style.WARNING(f"  (missing) {local_root}"))
            totals["missing_dirs"] += 1
            return

        files = [p for p in local_root.rglob("*") if p.is_file()]
        self.stdout.write(f"  Found {len(files)} file(s) under {local_root}")

        for path in files:
            rel = path.relative_to(local_root).as_posix()
            key = f"{key_prefix}{rel}"
            size = path.stat().st_size
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"

            if not force and self._remote_same_size(client, bucket, key, size):
                totals["skipped"] += 1
                continue

            self.stdout.write(f"  → s3://{bucket}/{key} ({size} bytes)")
            if dry_run:
                totals["uploaded"] += 1
                continue

            extra = {"ContentType": content_type}
            # Some S3-compatible stores ignore ACL; safe to try for public media.
            if public and os.environ.get("AWS_S3_PUBLIC_ACL", "").lower() in (
                "1",
                "true",
                "yes",
                "public-read",
            ):
                extra["ACL"] = "public-read"

            try:
                client.upload_file(
                    str(path),
                    bucket,
                    key,
                    ExtraArgs=extra,
                )
                totals["uploaded"] += 1
            except Exception as exc:  # noqa: BLE001 — report and continue
                totals["errors"] += 1
                self.stderr.write(self.style.ERROR(f"  FAILED {key}: {exc}"))

    def _remote_same_size(self, client, bucket: str, key: str, size: int) -> bool:
        try:
            head = client.head_object(Bucket=bucket, Key=key)
            return int(head.get("ContentLength") or -1) == size
        except client.exceptions.ClientError:
            return False
        except Exception:
            return False

    def _s3_client(self):
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION_NAME,
            config=Config(
                signature_version=settings.AWS_S3_SIGNATURE_VERSION,
                s3={"addressing_style": settings.AWS_S3_ADDRESSING_STYLE},
            ),
        )
