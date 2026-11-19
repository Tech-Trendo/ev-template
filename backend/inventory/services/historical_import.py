"""Historical data import engine.

Supports bulk data onboarding for Customers, Shipments, Vehicle Units, Sales,
and Servicing records from CSV and XLSX spreadsheets.

Key guarantees:
- Idempotent matching on natural keys (updates only fill blanks).
- Preserves original business dates without skewing daily activity rollups.
- Nepal geography normalisation for 77 districts and 7 provinces.
- Dates are Gregorian unless the file is imported with calendar "bs", in which case every date column is Bikram Sambat and is stored as the matching AD date.
- Dry run validation with downloadable error CSV.
- Atomic commit with optional skip-invalid mode (max 5,000 rows).
- Zero side-effects: no CRM activity logs, no notifications, single opening stock movement.
- Super Admin 7-day rollback if imported records remain untouched.
"""

from __future__ import annotations

import contextlib
import contextvars
import csv
import datetime
import hashlib
import io
import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple, Union

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

import openpyxl
from common.models import AuditLog
from common.signals import suppress_audit_signal
from common.nepal_geography import normalize_district_and_province, normalize_province
from common.phone import normalize_nepal_phone
from crm.models import Customer
from dealers.models import Dealer
from inventory.models import (
    ImportBatch,
    ImportJob,
    PaymentMode,
    ShipmentCost,
    ShipmentCostType,
    ShipmentSequence,
    StockMovement,
    VehicleModel,
    VehicleUnit,
    VehicleVariant,
    Sale,
)
from servicing.models import ServiceRecord


def _resolve_dealer(name: str):
    """Case-insensitive dealer match by name. Returns (dealer, error_message)."""
    if not name:
        return None, None
    dealer = Dealer.objects.filter(name__iexact=name.strip()).first()
    if not dealer:
        return None, f"Unknown dealer '{name}'. Dealers must already exist; they are never auto-created."
    return dealer, None

MAX_IMPORT_ROWS = 5000
MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
# Normalized Nepal mobile (98/97/96 + 8 digits) or landline with area code (0 + 7-9 digits).
NEPAL_PHONE_RE = re.compile(r"^(9[678]\d{8}|0\d{7,9})$")

_import_calendar: contextvars.ContextVar[str] = contextvars.ContextVar("import_calendar", default="ad")


@contextlib.contextmanager
def use_import_calendar(calendar: Any):
    """Interpret date columns as AD or BS for the duration of a dry run or commit."""
    choice = str(calendar or "ad").strip().lower()
    if choice not in ("ad", "bs"):
        raise ValidationError("Calendar must be 'ad' or 'bs'.")
    token = _import_calendar.set(choice)
    try:
        yield choice
    finally:
        _import_calendar.reset(token)

User = get_user_model()


# ----------------------------------------------------------------------
# Template & Schema Definitions
# ----------------------------------------------------------------------

TEMPLATE_SCHEMAS: Dict[str, Dict[str, Any]] = {
    ImportJob.ImportType.CUSTOMERS: {
        "title": "Historical Customers Import",
        "headers": [
            "name",
            "phone",
            "email",
            "customer_type",
            "company_name",
            "pan_number",
            "address",
            "district",
            "province",
            "dealer",
            "registration_date",
            "notes",
        ],
        "sample_rows": [
            [
                "Ram Bahadur Shrestha",
                "9841234567",
                "ram.shrestha@example.com",
                "Individual",
                "",
                "",
                "New Baneshwor, Ward 10",
                "Kathmandu",
                "Bagmati",
                "Kathmandu Central",
                "2023-04-15",
                "Legacy customer transferred from old excel sheet",
            ],
            [
                "Himalayan Logistics Pvt. Ltd.",
                "014422334",
                "fleet@himalayanlogistics.com.np",
                "Business",
                "Himalayan Logistics Pvt. Ltd.",
                "302918273",
                "Birgunj Dry Port Road",
                "Parsa",
                "Madhesh",
                "Birgunj Dealer",
                "2022-11-20",
                "Commercial fleet owner",
            ],
        ],
    },
    ImportJob.ImportType.SHIPMENTS: {
        "title": "Historical Shipments Import",
        "headers": [
            "shipment_no",
            "supplier_exporter",
            "container_bl_no",
            "carrier_name",
            "origin",
            "status",
            "etd",
            "eta",
            "actual_arrival_date",
            "customs_clearance_date",
            "warehouse_received_date",
            "notes",
        ],
        "sample_rows": [
            [
                "SHP-2023-000001",
                "VT Vehicle Factory",
                "COSU62839102",
                "COSCO Shipping",
                "Qingdao, China",
                "CLOSED",
                "2023-01-10",
                "2023-02-15",
                "2023-02-20",
                "2023-02-28",
                "2023-03-05",
                "Batch 1 pioneer EV consignment",
            ],
            [
                "SHP-2023-000002",
                "VT Vehicle Factory",
                "MSKU98123746",
                "Maersk Line",
                "Tianjin, China",
                "CLOSED",
                "2023-04-01",
                "2023-05-10",
                "2023-05-18",
                "2023-05-25",
                "2023-05-30",
                "Batch 2 commercial van consignment",
            ],
        ],
    },
    ImportJob.ImportType.UNITS: {
        "title": "Historical Vehicle Units Import",
        "headers": [
            "vin_chassis_no",
            "model_code",
            "variant_name",
            "color",
            "motor_no",
            "battery_no",
            "manufacture_date",
            "odometer_km",
            "status",
            "shipment_no",
            "arrival_date",
            "dealer",
            "stockyard_location",
            "purchase_cost",
            "landed_cost",
            "selling_price",
        ],
        "sample_rows": [
            [
                "LVT20230000101",
                "FD-EV1",
                "Standard Range",
                "Alpine White",
                "MOT20230101",
                "BAT20230101",
                "2023-01-05",
                "15",
                "IN_STOCK",
                "SHP-2023-000001",
                "2023-03-05",
                "Kathmandu Central",
                "Kathmandu Stockyard Bay A1",
                "2500000",
                "3100000",
                "3650000",
            ],
            [
                "LVT20230000102",
                "FD-EV1",
                "Long Range",
                "Ocean Blue",
                "MOT20230102",
                "BAT20230102",
                "2023-01-08",
                "10",
                "SOLD",
                "SHP-2023-000001",
                "2023-03-05",
                "Kathmandu Central",
                "Showroom Floor",
                "2800000",
                "3400000",
                "4050000",
            ],
        ],
    },
    ImportJob.ImportType.SALES: {
        "title": "Historical Sales Import",
        "headers": [
            "tax_invoice_no",
            "vin_chassis_no",
            "customer_phone",
            "customer_pan_vat",
            "sale_date",
            "selling_price",
            "discount",
            "down_payment",
            "payment_mode",
            "bank_name",
            "dealer",
            "salesperson_name",
            "notes",
        ],
        "sample_rows": [
            [
                "INV-2023-0012",
                "LVT20230000102",
                "9841234567",
                "",
                "2023-04-20",
                "4050000",
                "50000",
                "1500000",
                "BANK_FINANCE",
                "Nabil Bank",
                "Kathmandu Central",
                "Bikash Sharma",
                "Customer availed 3 year auto loan",
            ],
        ],
    },
    ImportJob.ImportType.SERVICING: {
        "title": "Historical Servicing History Import",
        "headers": [
            "job_card_no",
            "vin_chassis_no",
            "customer_phone",
            "date_received",
            "date_completed",
            "job_type",
            "odometer_reading",
            "technician_name",
            "status",
            "labour_cost",
            "parts_cost",
            "notes",
        ],
        "sample_rows": [
            [
                "VRO-2023-0045",
                "LVT20230000102",
                "9841234567",
                "2023-07-15",
                "2023-07-15",
                "First Free Service (1,000 km)",
                "1050",
                "Sunil Thapa",
                "completed",
                "0",
                "500",
                "General inspection, wheel torque and diagnostic report",
            ],
        ],
    },
    ImportJob.ImportType.SHIPMENT_COSTS: {
        "title": "Historical Shipment Cost Lines Import",
        "headers": [
            "shipment_no",
            "cost_type",
            "amount",
            "currency",
            "exchange_rate",
            "description",
        ],
        "sample_rows": [
            ["SHP-2023-000045", "FREIGHT", "4200", "USD", "132.50", "Ocean freight Shanghai to Kolkata"],
            ["SHP-2023-000045", "CUSTOMS_DUTY", "1850000", "NPR", "1", "Birgunj customs duty"],
        ],
    },
}


# ----------------------------------------------------------------------
# Template Generation (CSV & XLSX)
# ----------------------------------------------------------------------

def generate_template_csv(import_type: str) -> bytes:
    """Generate blank template CSV with header and sample rows."""
    schema = TEMPLATE_SCHEMAS.get(import_type)
    if not schema:
        raise ValueError(f"Unknown import type '{import_type}'")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(schema["headers"])
    for r in schema["sample_rows"]:
        writer.writerow(r)
    return buffer.getvalue().encode("utf-8-sig")


def generate_template_xlsx(import_type: str) -> bytes:
    """Generate blank template XLSX with header and sample rows."""
    schema = TEMPLATE_SCHEMAS.get(import_type)
    if not schema:
        raise ValueError(f"Unknown import type '{import_type}'")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = schema["title"][:31]

    ws.append(schema["headers"])
    for r in schema["sample_rows"]:
        ws.append(r)

    # Style header row
    header_font = openpyxl.styles.Font(bold=True, color="FFFFFF")
    header_fill = openpyxl.styles.PatternFill(
        start_color="04314A", end_color="04314A", fill_type="solid"
    )
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ----------------------------------------------------------------------
# Parsing & Normalisation Helpers
# ----------------------------------------------------------------------

def parse_ad_date(val: Any) -> Tuple[Optional[datetime.date], Optional[str]]:
    """Parses a date cell. AD by default; BS when this import file selected the BS calendar."""
    if _import_calendar.get() == "bs":
        return _parse_bs_date(val)
    return _parse_gregorian_date(val)


def _parse_bs_date(val: Any) -> Tuple[Optional[datetime.date], Optional[str]]:
    """Read a Bikram Sambat date and return the Gregorian day it falls on."""
    from hrm.calendar import CalendarRangeError, bs_to_ad

    if val is None or val == "":
        return None, None
    if isinstance(val, (datetime.date, datetime.datetime)):
        return None, (
            "This cell is a Gregorian Excel date. Enter Bikram Sambat dates as text, "
            "for example 2080-01-01 or 01/01/2080."
        )
    raw = str(val).strip()
    if not raw:
        return None, None
    parsed = _split_ymd(raw)
    if parsed is None:
        return None, f"Invalid BS date '{raw}'. Use YYYY-MM-DD or DD/MM/YYYY."
    year, month, day = parsed
    try:
        return bs_to_ad(year, month, day), None
    except CalendarRangeError as exc:
        return None, str(exc)


def _split_ymd(raw: str) -> Optional[Tuple[int, int, int]]:
    match = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", raw)
    if match:
        return int(match.group(1)), int(match.group(2)), int(match.group(3))
    match = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", raw)
    if match:
        return int(match.group(3)), int(match.group(2)), int(match.group(1))
    return None


def _parse_gregorian_date(val: Any) -> Tuple[Optional[datetime.date], Optional[str]]:
    """Strictly parses Gregorian (AD) calendar dates.

    Supports:
    - YYYY-MM-DD
    - DD/MM/YYYY
    - YYYY/MM/DD
    - DD-MM-YYYY
    - native datetime/date from openpyxl

    Bikram Sambat (BS) is explicitly rejected with a clear message.
    """
    if val is None or val == "":
        return None, None

    if isinstance(val, datetime.date):
        if isinstance(val, datetime.datetime):
            return val.date(), None
        return val, None

    raw = str(val).strip()
    if not raw:
        return None, None

    # Check for Bikram Sambat indicators (years 2070-2100 or common BS patterns)
    m_bs = re.match(r"^(20[7-9]\d|2100)[-/.]", raw)
    if m_bs:
        return (
            None,
            f"Date '{raw}' appears to be in Bikram Sambat (BS {m_bs.group(1)}). Only Gregorian (AD) dates are supported (e.g. YYYY-MM-DD or DD/MM/YYYY).",
        )

    # 1. Standard ISO YYYY-MM-DD
    iso_date = parse_date(raw)
    if iso_date:
        return iso_date, None

    # 2. DD/MM/YYYY or DD-MM-YYYY
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.datetime.strptime(raw, fmt).date(), None
        except ValueError:
            pass

    return (
        None,
        f"Invalid date '{raw}'. Please use AD format YYYY-MM-DD or DD/MM/YYYY.",
    )


def parse_decimal(val: Any, default: Optional[Decimal] = None) -> Tuple[Optional[Decimal], Optional[str]]:
    """Parses decimal string safely, removing commas and currency symbols."""
    if val is None or val == "":
        return default, None
    s = str(val).replace(",", "").replace("NPR", "").replace("Rs.", "").replace("Rs", "").strip()
    if not s:
        return default, None
    try:
        return Decimal(s), None
    except (InvalidOperation, ValueError):
        return None, f"Invalid numeric amount '{val}'"


def parse_integer(val: Any, default: Optional[int] = None) -> Tuple[Optional[int], Optional[str]]:
    if val is None or val == "":
        return default, None
    s = str(val).replace(",", "").strip()
    if not s:
        return default, None
    try:
        return int(float(s)), None
    except ValueError:
        return None, f"Invalid integer value '{val}'"


def normalize_header(name: str) -> str:
    """Normalizes header string: 'Customer Phone No.' -> 'customer_phone_no'."""
    s = str(name).strip().lower()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", "_", s)
    return s


def _xlsx_cell_text(v: Any) -> Any:
    """Excel stores dates as datetimes and whole numbers (phones, amounts) as floats.

    Date cells stay as ``datetime.date`` so a BS import can reject them. Excel
    dates are Gregorian; a BS file must type the Bikram Sambat date as text.
    """
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        if v.time() == datetime.time.min:
            return v.date()
        return v.isoformat()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def parse_file_rows(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parses CSV (UTF-8, UTF-8 with BOM, Latin-1) or XLSX file into row dictionaries."""
    lower_name = filename.lower()
    rows: List[Dict[str, Any]] = []

    if len(file_bytes) > MAX_IMPORT_FILE_BYTES:
        raise ValidationError(
            f"The file is {len(file_bytes) / (1024 * 1024):.1f} MB, which exceeds the {MAX_IMPORT_FILE_BYTES // (1024 * 1024)} MB upload limit. Please split the file."
        )

    if lower_name.endswith(".xlsx"):
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            return []
        raw_headers = [str(h or "").strip() for h in all_rows[0]]
        headers = [normalize_header(h) for h in raw_headers]

        for idx, row in enumerate(all_rows[1:], start=2):
            if not any(row):
                continue
            row_dict: Dict[str, Any] = {"_row_num": idx}
            for h, v in zip(headers, row):
                if h:
                    row_dict[h] = _xlsx_cell_text(v)
            rows.append(row_dict)

    elif lower_name.endswith(".csv"):
        # Detect encoding
        text = None
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = file_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            text = file_bytes.decode("utf-8", errors="replace")

        reader = csv.reader(io.StringIO(text))
        all_rows = list(reader)
        if not all_rows:
            return []

        raw_headers = [str(h or "").strip() for h in all_rows[0]]
        headers = [normalize_header(h) for h in raw_headers]

        for idx, row in enumerate(all_rows[1:], start=2):
            if not any(row):
                continue
            row_dict = {"_row_num": idx}
            for h, v in zip(headers, row):
                if h:
                    row_dict[h] = str(v).strip()
            rows.append(row_dict)
    else:
        raise ValidationError(
            f"Unsupported file format for '{filename}'. Only .csv and .xlsx files are allowed."
        )

    if len(rows) > MAX_IMPORT_ROWS:
        raise ValidationError(
            f"The file contains {len(rows)} rows, which exceeds the maximum limit of {MAX_IMPORT_ROWS} rows. Please split the file."
        )

    return rows


# ----------------------------------------------------------------------
# Validation & Dry Run Engine
# ----------------------------------------------------------------------

class _RowErrors(list):
    """Per-row error list that records the offending column with each message."""

    def append(self, message: str, column: str = "") -> None:  # type: ignore[override]
        super().append((column, message))

    def messages(self) -> List[str]:
        return [f"{col}: {msg}" if col else msg for col, msg in self]

    def emit(self, errors: List[Dict[str, Any]], row_num: int, row: Dict[str, Any]) -> None:
        for col, msg in self:
            errors.append({
                "row": row_num,
                "field": col,
                "message": msg,
                "value": str(row.get(normalize_header(col), "")) if col else "",
            })


def _get_val(row: Dict[str, Any], *aliases: str, default: str = "") -> str:
    """Retrieves value from row dict trying normalized aliases in order."""
    for a in aliases:
        norm = normalize_header(a)
        if norm in row and row[norm] != "":
            value = row[norm]
            if isinstance(value, (datetime.date, datetime.datetime)):
                return value
            return str(value).strip()
    return default


def validate_customers(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_natural_keys: set = set()

    for r in rows:
        r_num = r["_row_num"]
        name = _get_val(r, "name", "customer_name", "full_name")
        phone = _get_val(r, "phone", "phone_number", "mobile", "mobile_no")
        email = _get_val(r, "email", "email_address")
        cust_type_raw = _get_val(r, "customer_type", "type", default="Individual")
        company = _get_val(r, "company_name", "company")
        pan = _get_val(r, "pan_number", "pan", "pan_vat_number", "vat")
        address = _get_val(r, "address", "street", "street_address")
        district_raw = _get_val(r, "district")
        province_raw = _get_val(r, "province")
        dealer_raw = _get_val(r, "dealer", "dealer_name")
        reg_date_raw = _get_val(r, "registration_date", "created_at", "date")
        notes = _get_val(r, "notes", "remarks")

        row_errors = _RowErrors()

        if not name:
            row_errors.append("Customer name is required.", "name")

        # Phone and email validation
        phone_norm = normalize_nepal_phone(phone) if phone else ""
        if phone and not NEPAL_PHONE_RE.match(phone_norm):
            row_errors.append(f"Invalid Nepal phone number '{phone}'.", "phone")
            phone_norm = ""

        # Natural key is phone (if valid) or PAN/VAT or email or name+address
        nat_key = (
            phone_norm
            or (pan.lower() if pan else None)
            or (email.lower() if email else None)
            or f"{name.lower()}::{address.lower()}"
        )
        if nat_key in seen_natural_keys:
            row_errors.append(f"Duplicate customer record within this file (matched on '{nat_key}').", "phone")
        else:
            seen_natural_keys.add(nat_key)

        # Nepal geography validation
        canon_dist, canon_prov, geo_err = normalize_district_and_province(
            district_raw or None, province_raw or None
        )
        if geo_err:
            row_errors.append(geo_err, "district" if district_raw else "province")

        dealer_obj, dealer_err = _resolve_dealer(dealer_raw)
        if dealer_err:
            row_errors.append(dealer_err, "dealer")

        # Date validation
        reg_date, date_err = parse_ad_date(reg_date_raw)
        if date_err:
            row_errors.append(date_err, "registration_date")

        # Check existing customer in database (phone or PAN/VAT)
        existing_cust = None
        if phone_norm:
            existing_cust = Customer.objects.filter(
                phone_normalized=phone_norm, is_deleted=False
            ).first()
        if not existing_cust and pan:
            existing_cust = Customer.objects.filter(
                pan_vat_number__iexact=pan, is_deleted=False
            ).first()
        if not existing_cust and email:
            existing_cust = Customer.objects.filter(
                email__iexact=email, is_deleted=False
            ).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing_cust:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "name": name,
                "phone": phone,
                "phone_normalized": phone_norm,
                "email": email,
                "customer_type": cust_type_raw.title(),
                "company": company,
                "pan_vat_number": pan,
                "address": address,
                "district": canon_dist or "",
                "province": canon_prov or "",
                "dealer_id": dealer_obj.id if dealer_obj else None,
                "registration_date": reg_date.isoformat() if reg_date else None,
                "notes": notes,
                "existing_id": existing_cust.id if existing_cust else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


def validate_shipments(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_keys: set = set()

    for r in rows:
        r_num = r["_row_num"]
        shipment_no = _get_val(r, "shipment_no", "batch_no", "consignment_no")
        supplier = _get_val(r, "supplier_exporter", "supplier", "origin", default="China Factory")
        container_bl = _get_val(r, "container_bl_no", "bl_no", "container_no")
        carrier = _get_val(r, "carrier_name", "carrier", "shipping_line")
        origin = _get_val(r, "origin", default="China")
        status_raw = _get_val(r, "status", default="RECEIVED").upper()
        etd_raw = _get_val(r, "etd", "shipped_date")
        eta_raw = _get_val(r, "eta", "eta_date")
        arrival_raw = _get_val(r, "actual_arrival_date", "arrival_date", "arrived_date")
        customs_raw = _get_val(r, "customs_clearance_date")
        warehouse_raw = _get_val(r, "warehouse_received_date")
        notes = _get_val(r, "notes", "remarks")

        row_errors = _RowErrors()

        if not shipment_no:
            row_errors.append("Shipment number (shipment_no) is required.", "shipment_no")

        if shipment_no in seen_keys:
            row_errors.append(f"Duplicate shipment_no '{shipment_no}' within file.", "shipment_no")
        else:
            seen_keys.add(shipment_no)

        etd, err_etd = parse_ad_date(etd_raw)
        if err_etd: row_errors.append(err_etd, "etd")
        eta, err_eta = parse_ad_date(eta_raw)
        if err_eta: row_errors.append(err_eta, "eta")
        arrival, err_arr = parse_ad_date(arrival_raw)
        if err_arr: row_errors.append(err_arr, "actual_arrival_date")
        customs, err_cus = parse_ad_date(customs_raw)
        if err_cus: row_errors.append(err_cus, "customs_clearance_date")
        warehouse, err_wh = parse_ad_date(warehouse_raw)
        if err_wh: row_errors.append(err_wh, "warehouse_received_date")

        existing = ImportBatch.objects.filter(
            shipment_no=shipment_no, is_deleted=False
        ).first() or ImportBatch.objects.filter(
            batch_no=shipment_no, is_deleted=False
        ).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "shipment_no": shipment_no,
                "supplier_exporter": supplier,
                "container_bl_no": container_bl,
                "carrier_name": carrier,
                "origin": origin,
                "status": status_raw,
                "etd": etd.isoformat() if etd else None,
                "eta": eta.isoformat() if eta else None,
                "actual_arrival_date": arrival.isoformat() if arrival else None,
                "customs_clearance_date": customs.isoformat() if customs else None,
                "warehouse_received_date": warehouse.isoformat() if warehouse else None,
                "notes": notes,
                "existing_id": existing.id if existing else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


def validate_units(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_vins: set = set()

    for r in rows:
        r_num = r["_row_num"]
        vin = _get_val(r, "vin_chassis_no", "vin", "chassis_no")
        model_code = _get_val(r, "model_code", "model_name", "model")
        variant_name = _get_val(r, "variant_name", "variant")
        color = _get_val(r, "color")
        motor_no = _get_val(r, "motor_no")
        battery_no = _get_val(r, "battery_no")
        mfg_date_raw = _get_val(r, "manufacture_date")
        odometer_raw = _get_val(r, "odometer_km", default="0")
        unit_status_raw = _get_val(r, "status", default="IN_STOCK").upper()
        shipment_no = _get_val(r, "shipment_no", "batch_no")
        arrival_raw = _get_val(r, "arrival_date", "arrived_date", "warehouse_received_date")
        dealer_raw = _get_val(r, "dealer", "dealer_name")
        location = _get_val(r, "stockyard_location", "location")
        p_cost_raw = _get_val(r, "purchase_cost")
        l_cost_raw = _get_val(r, "landed_cost")
        s_price_raw = _get_val(r, "selling_price")

        row_errors = _RowErrors()

        if not vin:
            row_errors.append("VIN / Chassis number is required.", "vin_chassis_no")

        if vin in seen_vins:
            row_errors.append(f"Duplicate VIN '{vin}' within file.", "vin_chassis_no")
        else:
            seen_vins.add(vin)

        # Model validation
        model_obj = None
        if not model_code:
            row_errors.append("Vehicle model (model_code or name) is required.", "model_code")
        else:
            model_obj = VehicleModel.objects.filter(
                model_name__iexact=model_code
            ).first() or VehicleModel.objects.filter(
                brand__iexact="VT", model_name__icontains=model_code
            ).first()
            if not model_obj:
                row_errors.append(f"Unknown vehicle model '{model_code}'. Must match existing catalog model.", "model_code")

        # Variant validation — never auto-create
        variant_obj = None
        if model_obj and variant_name:
            variant_obj = VehicleVariant.objects.filter(
                vehicle_model=model_obj, name__iexact=variant_name
            ).first()
            if not variant_obj:
                row_errors.append(
                    f"Unknown variant '{variant_name}' for model '{model_obj.model_name}'. Variants must already exist.",
                    "variant_name",
                )

        # Shipment reference
        shipment_obj = None
        if shipment_no:
            shipment_obj = ImportBatch.objects.filter(
                shipment_no=shipment_no, is_deleted=False
            ).first() or ImportBatch.objects.filter(
                batch_no=shipment_no, is_deleted=False
            ).first()
            if not shipment_obj:
                row_errors.append(
                    f"Shipment '{shipment_no}' not found. Import shipments first.",
                    "shipment_no",
                )

        dealer_obj, dealer_err = _resolve_dealer(dealer_raw)
        if dealer_err:
            row_errors.append(dealer_err, "dealer")

        mfg_date, err_mfg = parse_ad_date(mfg_date_raw)
        if err_mfg: row_errors.append(err_mfg, "manufacture_date")

        arrival_date, err_arr = parse_ad_date(arrival_raw)
        if err_arr: row_errors.append(err_arr, "arrival_date")

        odometer, err_odo = parse_integer(odometer_raw, default=0)
        if err_odo: row_errors.append(err_odo, "odometer_km")

        p_cost, err_p = parse_decimal(p_cost_raw)
        if err_p: row_errors.append(err_p, "purchase_cost")
        l_cost, err_l = parse_decimal(l_cost_raw)
        if err_l: row_errors.append(err_l, "landed_cost")
        s_price, err_s = parse_decimal(s_price_raw)
        if err_s: row_errors.append(err_s, "selling_price")

        existing = VehicleUnit.objects.filter(
            vin_chassis_no=vin, is_deleted=False
        ).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "vin_chassis_no": vin,
                "model_id": model_obj.id if model_obj else None,
                "model_name": model_obj.model_name if model_obj else model_code,
                "variant_id": variant_obj.id if variant_obj else None,
                "variant_name": variant_obj.name if variant_obj else variant_name,
                "color": color,
                "motor_no": motor_no,
                "battery_no": battery_no,
                "manufacture_date": mfg_date.isoformat() if mfg_date else None,
                "odometer_km": odometer or 0,
                "status": unit_status_raw,
                "shipment_id": shipment_obj.id if shipment_obj else None,
                "shipment_no": shipment_no,
                "arrival_date": arrival_date.isoformat() if arrival_date else None,
                "dealer_id": dealer_obj.id if dealer_obj else None,
                "stockyard_location": location,
                "purchase_cost": str(p_cost) if p_cost else None,
                "landed_cost": str(l_cost) if l_cost else None,
                "selling_price": str(s_price) if s_price else None,
                "existing_id": existing.id if existing else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


def validate_sales(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_invoices: set = set()

    for r in rows:
        r_num = r["_row_num"]
        invoice_no = _get_val(r, "tax_invoice_no", "invoice_no", "sale_invoice_no", "bill_no")
        vin = _get_val(r, "vin_chassis_no", "vin", "chassis_no")
        cust_phone = _get_val(r, "customer_phone", "phone", "mobile")
        cust_pan = _get_val(r, "customer_pan_vat", "pan_vat", "pan_number", "pan")
        cust_name = _get_val(r, "customer_name", "customer")
        sale_date_raw = _get_val(r, "sale_date", "date")
        price_raw = _get_val(r, "selling_price", "sale_price", "price")
        discount_raw = _get_val(r, "discount")
        down_raw = _get_val(r, "down_payment", "advance")
        payment_mode_raw = _get_val(r, "payment_mode", default="CASH").upper()
        bank_name = _get_val(r, "bank_name", "bank")
        dealer_raw = _get_val(r, "dealer", "dealer_name")
        salesperson = _get_val(r, "salesperson_name", "salesperson", "sales_rep")
        notes = _get_val(r, "notes", "remarks")

        row_errors = _RowErrors()

        if not invoice_no:
            row_errors.append("Tax invoice number is required.", "tax_invoice_no")

        if invoice_no in seen_invoices:
            row_errors.append(f"Duplicate invoice number '{invoice_no}' within file.", "tax_invoice_no")
        else:
            seen_invoices.add(invoice_no)

        # VIN validation
        unit_obj = None
        if not vin:
            row_errors.append("VIN / Chassis number is required.", "vin_chassis_no")
        else:
            unit_obj = VehicleUnit.objects.filter(vin_chassis_no=vin, is_deleted=False).first()
            if not unit_obj:
                row_errors.append(f"Vehicle unit with VIN '{vin}' not found in database. Import units first.", "vin_chassis_no")

        # Customer validation — phone or PAN/VAT
        cust_obj = None
        phone_norm = normalize_nepal_phone(cust_phone) if cust_phone else ""
        if phone_norm:
            cust_obj = Customer.objects.filter(phone_normalized=phone_norm, is_deleted=False).first()
        if not cust_obj and cust_pan:
            cust_obj = Customer.objects.filter(pan_vat_number__iexact=cust_pan, is_deleted=False).first()
        if not cust_obj and cust_name:
            cust_obj = Customer.objects.filter(name__iexact=cust_name, is_deleted=False).first()

        if not cust_obj:
            row_errors.append(
                f"Customer with phone/PAN '{cust_phone or cust_pan or cust_name}' not found. Import customers first.",
                "customer_phone" if cust_phone else "customer_pan_vat",
            )

        dealer_obj, dealer_err = _resolve_dealer(dealer_raw)
        if dealer_err:
            row_errors.append(dealer_err, "dealer")

        # Date validation
        sale_date, err_date = parse_ad_date(sale_date_raw)
        if not sale_date:
            row_errors.append(err_date or "Sale date is required.", "sale_date")

        # Price validation
        price, err_price = parse_decimal(price_raw)
        if price is None or price <= 0:
            row_errors.append(err_price or "Valid selling price is required.", "selling_price")

        discount, err_disc = parse_decimal(discount_raw)
        if err_disc: row_errors.append(err_disc, "discount")

        down_payment, err_down = parse_decimal(down_raw)
        if err_down: row_errors.append(err_down, "down_payment")

        # Natural key: existing sale for this VIN, else tax invoice
        existing = None
        if unit_obj:
            existing = Sale.objects.filter(unit=unit_obj, is_deleted=False).first()
        if not existing and invoice_no:
            existing = Sale.objects.filter(tax_invoice_no=invoice_no, is_deleted=False).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "tax_invoice_no": invoice_no,
                "vin": vin,
                "unit_id": unit_obj.id if unit_obj else None,
                "customer_id": cust_obj.id if cust_obj else None,
                "customer_name": cust_obj.name if cust_obj else cust_name,
                "sale_date": sale_date.isoformat() if sale_date else None,
                "selling_price": str(price) if price else "0",
                "discount": str(discount) if discount else "0",
                "down_payment": str(down_payment) if down_payment else None,
                "payment_mode": payment_mode_raw if payment_mode_raw in PaymentMode.values else PaymentMode.CASH,
                "bank": bank_name,
                "dealer_id": dealer_obj.id if dealer_obj else None,
                "salesperson_name": salesperson,
                "notes": notes,
                "existing_id": existing.id if existing else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


def validate_servicing(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_job_cards: set = set()

    for r in rows:
        r_num = r["_row_num"]
        job_card = _get_val(r, "job_card_no", "vro_no", "record_no")
        vin = _get_val(r, "vin_chassis_no", "vin", "chassis_no")
        cust_phone = _get_val(r, "customer_phone", "phone")
        date_recv_raw = _get_val(r, "date_received", "service_date", "date")
        date_comp_raw = _get_val(r, "date_completed", "completion_date")
        job_type = _get_val(r, "job_type", "service_type", default="Routine Service")
        odo_raw = _get_val(r, "odometer_reading", "odometer_km", "mileage")
        technician = _get_val(r, "technician_name", "technician")
        status_raw = _get_val(r, "status", default="completed").lower()
        labour_raw = _get_val(r, "labour_cost", default="0")
        parts_raw = _get_val(r, "parts_cost", default="0")
        notes = _get_val(r, "notes", "complaints", "action_taken")

        row_errors = _RowErrors()

        if not job_card:
            row_errors.append("Job card / VRO number is required.", "job_card_no")

        if job_card in seen_job_cards:
            row_errors.append(f"Duplicate job card number '{job_card}' within file.", "job_card_no")
        else:
            seen_job_cards.add(job_card)

        # VIN validation
        unit_obj = None
        if not vin:
            row_errors.append("VIN / Chassis number is required.", "vin_chassis_no")
        else:
            unit_obj = VehicleUnit.objects.filter(vin_chassis_no=vin, is_deleted=False).first()
            if not unit_obj:
                row_errors.append(f"Vehicle unit with VIN '{vin}' not found. Import units first.", "vin_chassis_no")

        # Customer matching (optional)
        cust_obj = None
        if cust_phone:
            phone_norm = normalize_nepal_phone(cust_phone)
            if phone_norm:
                cust_obj = Customer.objects.filter(phone_normalized=phone_norm, is_deleted=False).first()

        date_recv, err_recv = parse_ad_date(date_recv_raw)
        if not date_recv:
            row_errors.append(err_recv or "Received date is required.", "date_received")

        date_comp, err_comp = parse_ad_date(date_comp_raw)
        if err_comp: row_errors.append(err_comp, "date_completed")

        odo, err_odo = parse_integer(odo_raw)
        if err_odo: row_errors.append(err_odo, "odometer_reading")

        labour, err_lab = parse_decimal(labour_raw, default=Decimal(0))
        if err_lab: row_errors.append(err_lab, "labour_cost")
        parts, err_parts = parse_decimal(parts_raw, default=Decimal(0))
        if err_parts: row_errors.append(err_parts, "parts_cost")

        existing = ServiceRecord.objects.filter(vro_no=job_card, is_deleted=False).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "vro_no": job_card,
                "vin": vin,
                "unit_id": unit_obj.id if unit_obj else None,
                "customer_id": cust_obj.id if cust_obj else (unit_obj.customer_id if unit_obj else None),
                "date_received": date_recv.isoformat() if date_recv else None,
                "date_completed": date_comp.isoformat() if date_comp else None,
                "job_type": job_type,
                "odometer_reading": odo,
                "technician_name": technician,
                "status": status_raw if status_raw in [s[0] for s in ServiceRecord.Status.choices] else "completed",
                "labour_cost": str(labour) if labour is not None else "0",
                "parts_cost": str(parts) if parts is not None else "0",
                "notes": notes,
                "existing_id": existing.id if existing else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


def validate_shipment_costs(
    rows: List[Dict[str, Any]], update_existing: bool
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    validated: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    seen_keys: set = set()

    for r in rows:
        r_num = r["_row_num"]
        shipment_no = _get_val(r, "shipment_no", "batch_no")
        cost_type_raw = _get_val(r, "cost_type", "cost_type_code", "type")
        amount_raw = _get_val(r, "amount", "cost_amount")
        currency = _get_val(r, "currency", default="NPR").upper()
        rate_raw = _get_val(r, "exchange_rate", "rate")
        description = _get_val(r, "description", "notes")

        row_errors = _RowErrors()

        shipment_obj = None
        if not shipment_no:
            row_errors.append("Shipment number is required.", "shipment_no")
        else:
            shipment_obj = ImportBatch.objects.filter(
                shipment_no=shipment_no, is_deleted=False
            ).first() or ImportBatch.objects.filter(
                batch_no=shipment_no, is_deleted=False
            ).first()
            if not shipment_obj:
                row_errors.append(f"Shipment '{shipment_no}' not found. Import shipments first.", "shipment_no")

        cost_type_obj = None
        if not cost_type_raw:
            row_errors.append("Cost type is required.", "cost_type")
        else:
            cost_type_obj = ShipmentCostType.objects.filter(
                code__iexact=cost_type_raw
            ).first() or ShipmentCostType.objects.filter(name__iexact=cost_type_raw).first()
            if not cost_type_obj:
                row_errors.append(
                    f"Unknown cost type '{cost_type_raw}'. Cost types must already exist (code or name).",
                    "cost_type",
                )

        amount, err_amt = parse_decimal(amount_raw)
        if amount is None or amount <= 0:
            row_errors.append(err_amt or "A positive amount is required.", "amount")

        if not re.match(r"^[A-Z]{3}$", currency):
            row_errors.append(f"Invalid currency '{currency}'. Use a 3-letter code such as NPR, USD or CNY.", "currency")

        rate, err_rate = parse_decimal(rate_raw)
        if err_rate:
            row_errors.append(err_rate, "exchange_rate")
        elif rate is None:
            if currency == "NPR":
                rate = Decimal("1")
            else:
                row_errors.append(f"Exchange rate to NPR is required for {currency} amounts.", "exchange_rate")
        elif rate <= 0:
            row_errors.append("Exchange rate must be greater than zero.", "exchange_rate")

        nat_key = (shipment_no.lower(), cost_type_raw.lower(), str(amount), currency, description.lower())
        if nat_key in seen_keys:
            row_errors.append("Duplicate cost line within this file.", "amount")
        else:
            seen_keys.add(nat_key)

        existing = None
        if shipment_obj and cost_type_obj and amount is not None:
            existing = ShipmentCost.objects.filter(
                shipment=shipment_obj, cost_type=cost_type_obj, amount=amount, currency=currency
            ).first()

        status = "CREATE"
        if row_errors:
            status = "ERROR"
            row_errors.emit(errors, r_num, r)
        elif existing:
            status = "UPDATE" if update_existing else "SKIP"

        validated.append({
            "row": r_num,
            "status": status,
            "data": {
                "shipment_no": shipment_no,
                "shipment_id": shipment_obj.id if shipment_obj else None,
                "cost_type": cost_type_raw,
                "cost_type_id": cost_type_obj.id if cost_type_obj else None,
                "amount": str(amount) if amount is not None else None,
                "currency": currency,
                "exchange_rate": str(rate) if rate is not None else None,
                "description": description,
                "existing_id": existing.id if existing else None,
            },
            "errors": row_errors.messages(),
        })

    return validated, errors


VALIDATORS = {
    ImportJob.ImportType.CUSTOMERS: validate_customers,
    ImportJob.ImportType.SHIPMENTS: validate_shipments,
    ImportJob.ImportType.UNITS: validate_units,
    ImportJob.ImportType.SALES: validate_sales,
    ImportJob.ImportType.SERVICING: validate_servicing,
    ImportJob.ImportType.SHIPMENT_COSTS: validate_shipment_costs,
}


# ----------------------------------------------------------------------
# Public Orchestrator: Dry Run, Commit, Rollback, Error CSV
# ----------------------------------------------------------------------

def execute_dry_run(
    import_type: str,
    file_bytes: bytes,
    filename: str,
    options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Parses and validates file without writing any persistent records."""
    opts = options or {}
    update_existing = bool(opts.get("update_existing", False))

    raw_rows = parse_file_rows(file_bytes, filename)
    file_sha256 = hashlib.sha256(file_bytes).hexdigest()

    validator = VALIDATORS.get(import_type)
    if not validator:
        raise ValidationError(f"Unsupported import type '{import_type}'.")

    with use_import_calendar(opts.get("calendar")):
        validated_rows, all_errors = validator(raw_rows, update_existing)

    total_read = len(validated_rows)
    count_create = sum(1 for r in validated_rows if r["status"] == "CREATE")
    count_update = sum(1 for r in validated_rows if r["status"] == "UPDATE")
    count_skip = sum(1 for r in validated_rows if r["status"] == "SKIP")
    count_error = sum(1 for r in validated_rows if r["status"] == "ERROR")

    return {
        "import_type": import_type,
        "filename": filename,
        "file_sha256": file_sha256,
        "rows_read": total_read,
        "rows_create": count_create,
        "rows_update": count_update,
        "rows_skip": count_skip,
        "rows_error": count_error,
        "can_commit": (count_error == 0),
        "preview_rows": validated_rows[:50],  # Return first 50 rows for table preview
        "errors": all_errors,
    }


def execute_commit(
    import_type: str,
    file_bytes: bytes,
    filename: str,
    user: Any,
    options: Optional[Dict[str, Any]] = None,
    skip_invalid: bool = False,
) -> ImportJob:
    """Commits validated rows into database in a single atomic transaction."""
    opts = options or {}
    update_existing = bool(opts.get("update_existing", False))

    dry_run_res = execute_dry_run(import_type, file_bytes, filename, opts)
    if not skip_invalid and dry_run_res["rows_error"] > 0:
        raise ValidationError(
            f"Cannot commit: file has {dry_run_res['rows_error']} invalid row(s). Fix errors or select 'Skip invalid rows'."
        )

    # Re-run validator to get full row set
    raw_rows = parse_file_rows(file_bytes, filename)
    with use_import_calendar(opts.get("calendar")):
        validated_rows, all_errors = VALIDATORS[import_type](raw_rows, update_existing)

    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0
    previous_unit_status: Dict[str, str] = {}

    with transaction.atomic(), suppress_audit_signal():
        job = ImportJob.objects.create(
            import_type=import_type,
            original_filename=filename,
            file_sha256=dry_run_res["file_sha256"],
            uploaded_by=user if getattr(user, "is_authenticated", False) else None,
            status=ImportJob.Status.COMMITTED,
            rows_read=len(validated_rows),
            options_used=opts,
            error_summary=all_errors[:100],  # store up to 100 errors in summary
            started_at=timezone.now(),
        )

        for row_item in validated_rows:
            r_status = row_item["status"]
            data = row_item["data"]

            if r_status == "ERROR":
                error_count += 1
                continue

            if r_status == "SKIP":
                skipped_count += 1
                continue

            # ------------------------------------------------------------------
            # 1. Customers
            # ------------------------------------------------------------------
            if import_type == ImportJob.ImportType.CUSTOMERS:
                if r_status == "CREATE":
                    c = Customer.objects.create(
                        name=data["name"],
                        phone=data["phone"],
                        phone_normalized=data["phone_normalized"],
                        email=data["email"],
                        type=data["customer_type"] if data["customer_type"] in Customer.Type.values else Customer.Type.INDIVIDUAL,
                        company=data["company"],
                        pan_vat_number=data["pan_vat_number"],
                        address=data["address"],
                        district=data["district"],
                        province=data["province"],
                        dealer_id=data.get("dealer_id"),
                        notes=data["notes"],
                        source="historical import",
                        import_job=job,
                        created_by=user if getattr(user, "is_authenticated", False) else None,
                    )
                    # Preserve original registration date if provided
                    if data["registration_date"]:
                        d = (
                            parse_date(data["registration_date"])
                            if isinstance(data["registration_date"], str)
                            else data["registration_date"]
                        )
                        if d:
                            reg_dt = timezone.make_aware(
                                datetime.datetime.combine(d, datetime.time.min)
                            )
                            Customer.objects.filter(pk=c.pk).update(created_at=reg_dt)
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = Customer.objects.filter(pk=data["existing_id"]).first()
                    if existing:
                        updates = {}
                        if not existing.email and data["email"]: updates["email"] = data["email"]
                        if not existing.company and data["company"]: updates["company"] = data["company"]
                        if not existing.pan_vat_number and data["pan_vat_number"]: updates["pan_vat_number"] = data["pan_vat_number"]
                        if not existing.address and data["address"]: updates["address"] = data["address"]
                        if not existing.district and data["district"]: updates["district"] = data["district"]
                        if not existing.province and data["province"]: updates["province"] = data["province"]
                        if not existing.notes and data["notes"]: updates["notes"] = data["notes"]
                        if updates:
                            Customer.objects.filter(pk=existing.pk).update(**updates)
                            updated_count += 1
                        else:
                            skipped_count += 1

            # ------------------------------------------------------------------
            # 2. Shipments
            # ------------------------------------------------------------------
            elif import_type == ImportJob.ImportType.SHIPMENTS:
                if r_status == "CREATE":
                    b = ImportBatch.objects.create(
                        shipment_no=data["shipment_no"],
                        batch_no=data["shipment_no"],
                        supplier_exporter=data["supplier_exporter"],
                        container_bl_no=data["container_bl_no"],
                        carrier_name=data["carrier_name"],
                        origin=data["origin"],
                        status=data["status"] if data["status"] in ImportBatch.ShipmentStatus.values else ImportBatch.ShipmentStatus.RECEIVED,
                        etd=data["etd"] or None,
                        eta=data["eta"] or None,
                        actual_arrival_date=data["actual_arrival_date"] or None,
                        customs_clearance_date=data["customs_clearance_date"] or None,
                        warehouse_received_date=data["warehouse_received_date"] or None,
                        notes=data["notes"],
                        source="historical import",
                        import_job=job,
                        created_by=user if getattr(user, "is_authenticated", False) else None,
                    )
                    # Advance sequence if format matches SHP-YYYY-NNNNNN
                    ShipmentSequence.record_external_shipment_no(data["shipment_no"])
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = ImportBatch.objects.filter(pk=data["existing_id"]).first()
                    if existing:
                        updates = {}
                        if not existing.supplier_exporter and data["supplier_exporter"]: updates["supplier_exporter"] = data["supplier_exporter"]
                        if not existing.container_bl_no and data["container_bl_no"]: updates["container_bl_no"] = data["container_bl_no"]
                        if not existing.carrier_name and data["carrier_name"]: updates["carrier_name"] = data["carrier_name"]
                        if not existing.notes and data["notes"]: updates["notes"] = data["notes"]
                        if updates:
                            ImportBatch.objects.filter(pk=existing.pk).update(**updates)
                            updated_count += 1
                        else:
                            skipped_count += 1

            # ------------------------------------------------------------------
            # 3. Units
            # ------------------------------------------------------------------
            elif import_type == ImportJob.ImportType.UNITS:
                if r_status == "CREATE":
                    model_obj = VehicleModel.objects.get(pk=data["model_id"])
                    variant_obj = VehicleVariant.objects.filter(pk=data["variant_id"]).first() if data["variant_id"] else None
                    shipment_obj = ImportBatch.objects.filter(pk=data["shipment_id"]).first() if data["shipment_id"] else None

                    STATUS_MAP = {
                        "IN_STOCK": VehicleUnit.Status.READY_FOR_SALE,
                        "STOCK": VehicleUnit.Status.READY_FOR_SALE,
                        "READY": VehicleUnit.Status.READY_FOR_SALE,
                        "AVAILABLE": VehicleUnit.Status.READY_FOR_SALE,
                        "WAREHOUSE": VehicleUnit.Status.IN_WAREHOUSE,
                        "IN_WAREHOUSE": VehicleUnit.Status.IN_WAREHOUSE,
                        "SOLD": VehicleUnit.Status.SOLD,
                        "RESERVED": VehicleUnit.Status.RESERVED,
                        "IN_TRANSIT": VehicleUnit.Status.IN_TRANSIT,
                    }
                    raw_st = (data["status"] or "").upper()
                    final_status = STATUS_MAP.get(raw_st, raw_st if raw_st in VehicleUnit.Status.values else VehicleUnit.Status.READY_FOR_SALE)

                    if not shipment_obj:
                        shipment_obj, _ = ImportBatch.objects.get_or_create(
                            shipment_no="SHP-HISTORICAL-LEGACY",
                            defaults={
                                "batch_no": "SHP-HISTORICAL-LEGACY",
                                "source": "historical import",
                                "status": ImportBatch.ShipmentStatus.CLOSED,
                                "notes": "System consignment for historical units without an explicit shipment.",
                            },
                        )

                    unit = VehicleUnit.objects.create(
                        vin_chassis_no=data["vin_chassis_no"],
                        vehicle_model=model_obj,
                        variant=variant_obj,
                        color=data["color"] or "",
                        motor_no=data["motor_no"] or "",
                        battery_no=data["battery_no"] or "",
                        manufacture_date=data["manufacture_date"] or None,
                        odometer_km=data["odometer_km"] or 0,
                        status=final_status,
                        import_batch=shipment_obj,
                        dealer_id=data.get("dealer_id"),
                        purchase_cost=Decimal(data["purchase_cost"]) if data["purchase_cost"] else None,
                        landed_cost=Decimal(data["landed_cost"]) if data["landed_cost"] else None,
                        selling_price=Decimal(data["selling_price"]) if data["selling_price"] else None,
                        source="historical import",
                        import_job=job,
                        created_by=user if getattr(user, "is_authenticated", False) else None,
                    )

                    # Exactly one opening stock movement if in stock / warehouse
                    if unit.status in (VehicleUnit.Status.READY_FOR_SALE, VehicleUnit.Status.IN_WAREHOUSE):
                        StockMovement.objects.create(
                            vehicle=unit,
                            movement_type=StockMovement.MovementType.IMPORTED,
                            quantity=1,
                            reference_note=f"Historical import (Job #{job.id})",
                            created_by=user if getattr(user, "is_authenticated", False) else None,
                        )
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = VehicleUnit.objects.filter(pk=data["existing_id"]).first()
                    if existing:
                        updates = {}
                        if not existing.motor_no and data["motor_no"]: updates["motor_no"] = data["motor_no"]
                        if not existing.battery_no and data["battery_no"]: updates["battery_no"] = data["battery_no"]
                        if not existing.color and data["color"]: updates["color"] = data["color"]
                        if not existing.purchase_cost and data["purchase_cost"]: updates["purchase_cost"] = Decimal(data["purchase_cost"])
                        if not existing.landed_cost and data["landed_cost"]: updates["landed_cost"] = Decimal(data["landed_cost"])
                        if updates:
                            VehicleUnit.objects.filter(pk=existing.pk).update(**updates)
                            updated_count += 1
                        else:
                            skipped_count += 1

            # ------------------------------------------------------------------
            # 4. Sales
            # ------------------------------------------------------------------
            elif import_type == ImportJob.ImportType.SALES:
                if r_status == "CREATE":
                    unit_obj = VehicleUnit.objects.get(pk=data["unit_id"])
                    cust_obj = Customer.objects.get(pk=data["customer_id"])

                    s = Sale.objects.create(
                        unit=unit_obj,
                        customer=cust_obj,
                        variant=unit_obj.variant,
                        tax_invoice_no=data["tax_invoice_no"],
                        sale_date=data["sale_date"],
                        selling_price=Decimal(data["selling_price"]),
                        discount=Decimal(data["discount"]) if data.get("discount") else Decimal("0"),
                        down_payment=Decimal(data["down_payment"]) if data["down_payment"] else None,
                        payment_mode=data["payment_mode"],
                        bank=data["bank"],
                        dealer_id=data.get("dealer_id") or getattr(unit_obj, "dealer_id", None),
                        salesperson_name=data["salesperson_name"],
                        notes=data["notes"],
                        source="historical import",
                        import_job=job,
                        created_by=user if getattr(user, "is_authenticated", False) else None,
                    )
                    previous_unit_status[str(unit_obj.pk)] = unit_obj.status
                    unit_updates = {"status": VehicleUnit.Status.SOLD}
                    if not unit_obj.sold_date:
                        unit_updates["sold_date"] = data["sale_date"]
                    if not unit_obj.customer_id:
                        unit_updates["customer"] = cust_obj
                    VehicleUnit.objects.filter(pk=unit_obj.pk).update(**unit_updates)
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = Sale.objects.filter(pk=data["existing_id"]).first()
                    if existing:
                        updates = {}
                        if not existing.bank and data["bank"]: updates["bank"] = data["bank"]
                        if not existing.salesperson_name and data["salesperson_name"]: updates["salesperson_name"] = data["salesperson_name"]
                        if not existing.notes and data["notes"]: updates["notes"] = data["notes"]
                        if updates:
                            Sale.objects.filter(pk=existing.pk).update(**updates)
                            updated_count += 1
                        else:
                            skipped_count += 1

            # ------------------------------------------------------------------
            # 5. Servicing
            # ------------------------------------------------------------------
            elif import_type == ImportJob.ImportType.SERVICING:
                if r_status == "CREATE":
                    unit_obj = VehicleUnit.objects.get(pk=data["unit_id"])
                    cust_obj = Customer.objects.filter(pk=data["customer_id"]).first() if data["customer_id"] else None

                    sr = ServiceRecord.objects.create(
                        vro_no=data["vro_no"],
                        chassis_number=unit_obj.vin_chassis_no,
                        vehicle_unit=unit_obj,
                        customer=cust_obj,
                        customer_name=cust_obj.name if cust_obj else "",
                        customer_mobile=cust_obj.phone if cust_obj else "",
                        date_received=data["date_received"],
                        date_completed=data["date_completed"] or None,
                        job_type=data["job_type"],
                        odometer_reading=data["odometer_reading"],
                        technician_name=data["technician_name"],
                        status=data["status"],
                        labour_cost=Decimal(data["labour_cost"]),
                        parts_cost=Decimal(data["parts_cost"]),
                        service_notes=data["notes"],
                        source="historical import",
                        import_job=job,
                    )
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = ServiceRecord.objects.filter(pk=data["existing_id"]).first()
                    if existing:
                        updates = {}
                        if not existing.technician_name and data["technician_name"]: updates["technician_name"] = data["technician_name"]
                        if not existing.service_notes and data["notes"]: updates["service_notes"] = data["notes"]
                        if updates:
                            ServiceRecord.objects.filter(pk=existing.pk).update(**updates)
                            updated_count += 1
                        else:
                            skipped_count += 1

            # ------------------------------------------------------------------
            # 6. Shipment cost lines
            # ------------------------------------------------------------------
            elif import_type == ImportJob.ImportType.SHIPMENT_COSTS:
                if r_status == "CREATE":
                    ShipmentCost.objects.create(
                        shipment_id=data["shipment_id"],
                        cost_type_id=data["cost_type_id"],
                        amount=Decimal(data["amount"]),
                        currency=data["currency"],
                        exchange_rate=Decimal(data["exchange_rate"]),
                        description=data["description"],
                        source="historical import",
                        import_job=job,
                        created_by=user if getattr(user, "is_authenticated", False) else None,
                    )
                    created_count += 1

                elif r_status == "UPDATE" and data["existing_id"]:
                    existing = ShipmentCost.objects.filter(pk=data["existing_id"]).first()
                    if existing and not existing.description and data["description"]:
                        ShipmentCost.objects.filter(pk=existing.pk).update(description=data["description"])
                        updated_count += 1
                    else:
                        skipped_count += 1

        # Finalize job statistics
        job.rows_created = created_count
        job.rows_skipped = skipped_count
        job.rows_error = error_count
        job.finished_at = timezone.now()
        if previous_unit_status:
            job.options_used = {**(job.options_used or {}), "previous_unit_status": previous_unit_status}
        job.save(update_fields=["rows_created", "rows_skipped", "rows_error", "finished_at", "options_used"])

        # Exactly 1 audit log entry per import job
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(ImportJob),
            object_id=str(job.id),
            action=AuditLog.Action.CREATE,
            changed_by=user if getattr(user, "is_authenticated", False) else None,
            source="HISTORICAL_IMPORT",
            summary=f"Historical import committed ({import_type}): {created_count} created, {updated_count} updated, {skipped_count} skipped, {error_count} error",
            new_value=json.dumps({
                "action": "HISTORICAL_IMPORT_COMMITTED",
                "job_id": job.id,
                "import_type": import_type,
                "filename": filename,
                "rows_created": created_count,
                "rows_updated": updated_count,
                "rows_skipped": skipped_count,
                "rows_error": error_count,
            }),
        )

    return job


def execute_rollback(job_id: int, user: Any) -> ImportJob:
    """Rolls back a committed import job within 7 days if unedited and unlinked."""
    from accounts.models import user_is_super_admin

    if not (getattr(user, "is_superuser", False) or user_is_super_admin(user)):
        raise ValidationError("Only Super Admin can roll back historical import jobs.")

    job = ImportJob.objects.filter(pk=job_id).first()
    if not job:
        raise ValidationError(f"Import job #{job_id} not found.")

    if job.status != ImportJob.Status.COMMITTED:
        raise ValidationError(f"Import job #{job_id} cannot be rolled back (status is {job.get_status_display()}).")

    # 7-day rule
    now = timezone.now()
    age = now - job.created_at
    if age > datetime.timedelta(days=7):
        msg = f"Rollback window expired. Job was imported {age.days} days ago (allowed limit: 7 days)."
        job.rollback_blocked_reason = msg
        job.save(update_fields=["rollback_blocked_reason"])
        raise ValidationError(msg)

    # Check for downstream blockers
    blockers: List[str] = []
    imported_until = job.finished_at or job.created_at

    def _edited(obj: Any) -> bool:
        updated_at = getattr(obj, "updated_at", None)
        return bool(updated_at and updated_at > imported_until)

    if job.import_type == ImportJob.ImportType.CUSTOMERS:
        for cust in job.imported_customers.filter(is_deleted=False):
            if _edited(cust):
                blockers.append(f"Customer '{cust.name}' was edited after import.")
                continue
            has_sales = cust.sales.exclude(import_job=job).filter(is_deleted=False).exists()
            has_services = cust.service_records.filter(is_deleted=False).exists()
            has_td = cust.test_drives.exists()
            has_quotes = cust.quotations.exists() if hasattr(cust, "quotations") else False
            if has_sales or has_services or has_td or has_quotes:
                blockers.append(f"Customer '{cust.name}' is linked to newer sales, servicing, quotations or test drives.")

    elif job.import_type == ImportJob.ImportType.SHIPMENTS:
        for shp in job.imported_shipments.filter(is_deleted=False):
            if _edited(shp):
                blockers.append(f"Shipment '{shp.shipment_no}' was edited after import.")
                continue
            non_imported_units = shp.units.exclude(import_job=job).filter(is_deleted=False).exists()
            if non_imported_units:
                blockers.append(f"Shipment '{shp.shipment_no}' has vehicle units attached.")
            elif shp.costs.exists():
                blockers.append(f"Shipment '{shp.shipment_no}' has cost lines attached.")

    elif job.import_type == ImportJob.ImportType.UNITS:
        for unit in job.imported_units.filter(is_deleted=False):
            if _edited(unit):
                blockers.append(f"Vehicle unit '{unit.vin_chassis_no}' was edited after import.")
                continue
            has_live_sales = unit.sales.exclude(import_job=job).filter(is_deleted=False).exists()
            has_services = unit.service_records.exclude(import_job=job).filter(is_deleted=False).exists()
            has_inspections = unit.pdi_inspections.exists() if hasattr(unit, "pdi_inspections") else False
            if has_live_sales or has_services or has_inspections:
                blockers.append(f"Vehicle unit '{unit.vin_chassis_no}' has subsequent sales, service or inspection records.")

    elif job.import_type == ImportJob.ImportType.SALES:
        for sale in job.imported_sales.filter(is_deleted=False):
            if sale.status == Sale.Status.CANCELLED:
                blockers.append(f"Sale '{sale.tax_invoice_no}' was already cancelled.")
            elif _edited(sale):
                blockers.append(f"Sale '{sale.tax_invoice_no}' was edited after import.")

    elif job.import_type == ImportJob.ImportType.SERVICING:
        for sr in job.imported_services.filter(is_deleted=False):
            if _edited(sr):
                blockers.append(f"Service record '{sr.vro_no}' was edited after import.")

    elif job.import_type == ImportJob.ImportType.SHIPMENT_COSTS:
        for cost in job.imported_shipment_costs.select_related("shipment"):
            if _edited(cost):
                blockers.append(f"Cost line #{cost.id} on '{cost.shipment.shipment_no}' was edited after import.")

    if blockers:
        blocker_msg = "; ".join(blockers[:5])
        job.rollback_blocked_reason = blocker_msg
        job.save(update_fields=["rollback_blocked_reason"])
        raise ValidationError(f"Rollback blocked: {blocker_msg}")

    # Clean rollback execution
    with transaction.atomic(), suppress_audit_signal():
        if job.import_type == ImportJob.ImportType.CUSTOMERS:
            job.imported_customers.update(is_deleted=True)

        elif job.import_type == ImportJob.ImportType.SHIPMENTS:
            job.imported_shipments.update(is_deleted=True)

        elif job.import_type == ImportJob.ImportType.UNITS:
            # Revert units and delete opening stock movements
            for u in job.imported_units.all():
                StockMovement.objects.filter(
                    vehicle=u, reference_note=f"Historical import (Job #{job.id})"
                ).delete()
            job.imported_units.update(is_deleted=True, status="SCRAPPED")

        elif job.import_type == ImportJob.ImportType.SALES:
            previous = (job.options_used or {}).get("previous_unit_status", {})
            for s in job.imported_sales.all():
                prior = previous.get(str(s.unit_id))
                if prior:
                    VehicleUnit.objects.filter(pk=s.unit_id).update(status=prior)
            job.imported_sales.update(is_deleted=True, status=Sale.Status.CANCELLED, is_current=False)

        elif job.import_type == ImportJob.ImportType.SERVICING:
            job.imported_services.update(is_deleted=True)

        elif job.import_type == ImportJob.ImportType.SHIPMENT_COSTS:
            job.imported_shipment_costs.all().delete()

        job.status = ImportJob.Status.ROLLED_BACK
        job.rolled_back_at = timezone.now()
        job.rolled_back_by = user
        job.save(update_fields=["status", "rolled_back_at", "rolled_back_by"])

        # Exactly 1 audit log entry for the rollback
        AuditLog.objects.create(
            content_type=ContentType.objects.get_for_model(ImportJob),
            object_id=str(job.id),
            action=AuditLog.Action.DELETE,
            changed_by=user,
            source="HISTORICAL_IMPORT",
            summary=f"Historical import rolled back (Job #{job.id}, {job.import_type})",
            new_value=json.dumps({
                "action": "HISTORICAL_IMPORT_ROLLED_BACK",
                "job_id": job.id,
                "import_type": job.import_type,
            }),
        )

    return job


def generate_error_csv(errors: List[Dict[str, Any]]) -> bytes:
    """Generates downloadable CSV for validation errors."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Row", "Column", "Value", "Error"])
    for e in errors:
        writer.writerow([
            e.get("row", ""),
            e.get("field", ""),
            e.get("value", ""),
            e.get("message", ""),
        ])
    return buffer.getvalue().encode("utf-8-sig")
