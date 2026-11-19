"""Load Nepal Rastra Bank institutions and branches into CRM bank tables."""

import json
from pathlib import Path

from django.db import transaction

from .models import Bank, BankBranch

DATA_PATH = Path(__file__).resolve().parent / "data" / "nrb_banks.json"


def import_nrb_banks(path=None):
    """Create or refresh banks and branches from the saved NRB list.

    Existing rows are matched by institution or branch code so the import can
    be run again without duplicating the catalog. Manually added banks that
    have no code are left in place.
    """
    source = Path(path) if path else DATA_PATH
    if not source.exists():
        return {"banks": 0, "branches_created": 0, "branches_updated": 0, "skipped": True}

    rows = json.loads(source.read_text(encoding="utf-8"))
    created_branches = 0
    updated_branches = 0

    with transaction.atomic():
        for row in rows:
            code = (row.get("code") or "").strip()
            name = (row.get("name") or "").strip()
            if not name:
                continue
            bank = Bank.objects.filter(code=code).first() if code else None
            if bank is None:
                bank = Bank.objects.filter(name__iexact=name).first()
            category = (row.get("category") or "").strip()
            if bank is None:
                bank = Bank.objects.create(
                    name=name,
                    code=code,
                    category=category,
                    is_active=True,
                )
            else:
                bank.name = name
                if code:
                    bank.code = code
                if category:
                    bank.category = category
                bank.save(update_fields=["name", "code", "category", "updated_at"])

            existing = {
                branch.code: branch
                for branch in BankBranch.objects.filter(bank=bank).exclude(code="")
            }
            to_create = []
            to_update = []
            seen_codes = set(existing)
            for branch_row in row.get("branches") or []:
                branch_code = (branch_row.get("code") or "").strip()
                branch_name = (branch_row.get("name") or "").strip() or "Branch"
                address = (branch_row.get("address") or "").strip()
                district = (branch_row.get("district") or "").strip()
                if branch_code and branch_code in seen_codes and branch_code in existing:
                    current = existing[branch_code]
                    if (
                        current.name != branch_name
                        or current.address != address
                        or current.district != district
                    ):
                        current.name = branch_name
                        current.address = address
                        current.district = district
                        to_update.append(current)
                    continue
                if branch_code and branch_code in seen_codes:
                    continue
                to_create.append(
                    BankBranch(
                        bank=bank,
                        name=branch_name,
                        code=branch_code,
                        address=address,
                        district=district,
                        is_active=True,
                    )
                )
                if branch_code:
                    seen_codes.add(branch_code)
            if to_update:
                BankBranch.objects.bulk_update(to_update, ["name", "address", "district"])
                updated_branches += len(to_update)
            if to_create:
                BankBranch.objects.bulk_create(to_create, batch_size=500)
                created_branches += len(to_create)

    return {
        "banks": len(rows),
        "branches_created": created_branches,
        "branches_updated": updated_branches,
        "skipped": False,
    }
