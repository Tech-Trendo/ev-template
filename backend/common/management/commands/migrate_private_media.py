"""Management command to migrate private/sensitive media files to PRIVATE_MEDIA_ROOT.

Scans Document Vault documents, employee photos, PDI signatures and inspection
photos, and condition report photos currently residing in public MEDIA_ROOT,
safely copies them to PRIVATE_MEDIA_ROOT outside MEDIA_URL, verifies the copy
via SHA256 and file size, and removes the public original only after verification.

Supports --dry-run to audit which files will be moved without making changes.
"""

from __future__ import annotations

import hashlib
import os
import shutil
from typing import Dict, List, Tuple

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import models


def file_sha256(filepath: str) -> str:
    """Compute SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class Command(BaseCommand):
    help = (
        "Migrate sensitive media files (documents, employee photos, inspection photos) "
        "from public MEDIA_ROOT to PRIVATE_MEDIA_ROOT."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what files would be migrated without copying or deleting anything.",
        )
        parser.add_argument(
            "--keep-originals",
            action="store_true",
            help="Do not delete the public originals after copying and verifying.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        keep_originals = options["keep_originals"]

        public_root = getattr(settings, "MEDIA_ROOT", None)
        private_root = getattr(settings, "PRIVATE_MEDIA_ROOT", None)

        if not public_root or not os.path.exists(public_root):
            self.stdout.write(self.style.WARNING(f"Public MEDIA_ROOT '{public_root}' does not exist."))
        if not private_root:
            private_root = os.path.join(settings.BASE_DIR, "private_media")

        self.stdout.write(f"Source (Public MEDIA_ROOT):  {public_root}")
        self.stdout.write(f"Target (PRIVATE_MEDIA_ROOT): {private_root}")
        if dry_run:
            self.stdout.write(self.style.WARNING("--- RUNNING IN DRY-RUN MODE (No files will be modified) ---"))

        # Model field specifications to scan
        targets: List[Tuple[str, str, str]] = [
            ("crm", "Document", "file"),
            ("crm", "DocumentVersion", "file"),
            ("accounts", "UserProfile", "photo"),
            ("inventory", "PDIInspection", "signature"),
            ("inventory", "PDIResult", "photo"),
            ("inventory", "InspectionPhoto", "photo"),
            ("inventory", "ConditionResult", "photo"),
            ("inventory", "ConditionPhoto", "image"),
        ]

        collected_rel_paths = set()

        for app_label, model_name, field_name in targets:
            try:
                from django.apps import apps
                model = apps.get_model(app_label, model_name)
            except LookupError:
                self.stdout.write(self.style.WARNING(f"Model {app_label}.{model_name} not found."))
                continue

            qs = model.objects.exclude(**{f"{field_name}__isnull": True}).exclude(**{field_name: ""})
            count = qs.count()
            self.stdout.write(f"Checking {app_label}.{model_name}.{field_name} ({count} records)...")

            for obj in qs.iterator():
                field_val = getattr(obj, field_name)
                if not field_val or not field_val.name:
                    continue
                collected_rel_paths.add(field_val.name)

        # Also scan disk folders under MEDIA_ROOT for sensitive prefixes
        sensitive_prefixes = ("documents", "employee_photos", "pdi", "condition")
        if public_root and os.path.exists(public_root):
            for prefix in sensitive_prefixes:
                prefix_dir = os.path.join(public_root, prefix)
                if os.path.exists(prefix_dir):
                    for root, _, files in os.walk(prefix_dir):
                        for fname in files:
                            full_p = os.path.join(root, fname)
                            rel_p = os.path.relpath(full_p, public_root).replace("\\", "/")
                            collected_rel_paths.add(rel_p)

        self.stdout.write(f"Discovered {len(collected_rel_paths)} unique sensitive file paths to evaluate.")

        stats = {
            "already_migrated": 0,
            "migrated": 0,
            "would_migrate": 0,
            "missing": 0,
            "errors": 0,
        }

        for rel_path in sorted(collected_rel_paths):
            src_path = os.path.join(public_root, rel_path) if public_root else None
            dst_path = os.path.join(private_root, rel_path)

            src_exists = src_path and os.path.exists(src_path)
            dst_exists = os.path.exists(dst_path)

            if not src_exists and not dst_exists:
                stats["missing"] += 1
                self.stdout.write(self.style.WARNING(f"  [MISSING] Neither source nor target exists: {rel_path}"))
                continue

            if not src_exists and dst_exists:
                stats["already_migrated"] += 1
                continue

            if src_exists and dst_exists:
                # Both exist: verify if content is already identical
                src_hash = file_sha256(src_path)
                dst_hash = file_sha256(dst_path)
                if src_hash == dst_hash:
                    stats["already_migrated"] += 1
                    if not dry_run and not keep_originals:
                        os.remove(src_path)
                        self.stdout.write(f"  [CLEANED] Removed duplicate public original: {rel_path}")
                    continue

            # src_exists and (not dst_exists or hashes differed)
            if dry_run:
                stats["would_migrate"] += 1
                self.stdout.write(f"  [DRY RUN] Would copy {src_path} -> {dst_path} and delete original")
                continue

            try:
                os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                shutil.copy2(src_path, dst_path)

                # Verify SHA256 and size
                src_hash = file_sha256(src_path)
                dst_hash = file_sha256(dst_path)
                src_size = os.path.getsize(src_path)
                dst_size = os.path.getsize(dst_path)

                if src_hash != dst_hash or src_size != dst_size:
                    stats["errors"] += 1
                    self.stdout.write(
                        self.style.ERROR(f"  [VERIFY FAILED] Hash or size mismatch for {rel_path}! Retaining original.")
                    )
                    continue

                if not keep_originals:
                    os.remove(src_path)

                stats["migrated"] += 1
                self.stdout.write(self.style.SUCCESS(f"  [MIGRATED] Successfully moved and verified: {rel_path}"))

            except Exception as e:
                stats["errors"] += 1
                self.stdout.write(self.style.ERROR(f"  [ERROR] Failed to migrate {rel_path}: {e}"))

        self.stdout.write("\nMigration Summary:")
        for k, v in stats.items():
            self.stdout.write(f"  {k}: {v}")
