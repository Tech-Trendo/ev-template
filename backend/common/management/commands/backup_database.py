"""Dump PostgreSQL to gzip and upload to S3; prune backups older than retention."""

from __future__ import annotations

import gzip
import os
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Create a gzipped pg_dump, upload to S3 under DB_BACKUP_PREFIX, "
        "and delete backup objects older than DB_BACKUP_RETENTION_HOURS."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-upload",
            action="store_true",
            help="Only dump locally (debug); do not touch S3.",
        )
        parser.add_argument(
            "--prune-only",
            action="store_true",
            help="Only delete expired backups; do not create a new dump.",
        )

    def handle(self, *args, **options):
        if not getattr(settings, "USE_S3", False):
            raise CommandError(
                "S3 is not configured (set AWS_ACCESS_KEY_ID, AWS_STORAGE_BUCKET_NAME, "
                "AWS_S3_ENDPOINT_URL). Refusing to run backup."
            )
        if not settings.DB_BACKUP_ENABLED and not options["prune_only"]:
            self.stdout.write(self.style.WARNING("DB_BACKUP_ENABLED is false — nothing to do."))
            return

        if not options["prune_only"]:
            key = self._upload_dump(skip_upload=options["skip_upload"])
            if key:
                self.stdout.write(self.style.SUCCESS(f"Uploaded backup: s3://{settings.AWS_STORAGE_BUCKET_NAME}/{key}"))

        deleted = self._prune()
        self.stdout.write(self.style.SUCCESS(f"Pruned {deleted} backup(s) older than {settings.DB_BACKUP_RETENTION_HOURS}h."))

    def _db_settings(self) -> dict:
        db = settings.DATABASES["default"]
        engine = db.get("ENGINE", "")
        if "postgresql" not in engine and "psycopg" not in engine:
            raise CommandError("backup_database only supports PostgreSQL.")
        return db

    def _upload_dump(self, *, skip_upload: bool) -> str | None:
        db = self._db_settings()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        filename = f"vehicle-template-{stamp}.sql.gz"
        key = f"{settings.DB_BACKUP_PREFIX}{filename}"

        env = os.environ.copy()
        if db.get("PASSWORD"):
            env["PGPASSWORD"] = str(db["PASSWORD"])

        cmd = [
            "pg_dump",
            "--format=plain",
            "--no-owner",
            "--no-acl",
            "-h",
            str(db.get("HOST") or "localhost"),
            "-p",
            str(db.get("PORT") or "5432"),
            "-U",
            str(db.get("USER") or "postgres"),
            "-d",
            str(db.get("NAME")),
        ]

        self.stdout.write(f"Running pg_dump → {filename} …")
        with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            dump = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )
            assert dump.stdout is not None
            with gzip.open(tmp_path, "wb") as gz:
                while True:
                    chunk = dump.stdout.read(1024 * 256)
                    if not chunk:
                        break
                    gz.write(chunk)
            stderr = dump.stderr.read().decode("utf-8", errors="replace") if dump.stderr else ""
            code = dump.wait()
            if code != 0:
                raise CommandError(f"pg_dump failed ({code}): {stderr.strip()}")

            if skip_upload:
                self.stdout.write(f"Local dump kept at {tmp_path}")
                return None

            client = self._s3_client()
            client.upload_file(
                tmp_path,
                settings.AWS_STORAGE_BUCKET_NAME,
                key,
                ExtraArgs={"ContentType": "application/gzip"},
            )
            return key
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def _prune(self) -> int:
        client = self._s3_client()
        bucket = settings.AWS_STORAGE_BUCKET_NAME
        prefix = settings.DB_BACKUP_PREFIX
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.DB_BACKUP_RETENTION_HOURS)
        deleted = 0
        token = None
        while True:
            kwargs = {"Bucket": bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents") or []:
                last_mod = obj.get("LastModified")
                if last_mod is None:
                    continue
                if last_mod.tzinfo is None:
                    last_mod = last_mod.replace(tzinfo=timezone.utc)
                if last_mod < cutoff:
                    client.delete_object(Bucket=bucket, Key=obj["Key"])
                    deleted += 1
                    self.stdout.write(f"Deleted expired backup: {obj['Key']}")
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return deleted

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
