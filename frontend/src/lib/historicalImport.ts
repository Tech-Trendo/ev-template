import { API_BASE, ApiError, api, getValidAccessToken } from "./api";

const BASE = "/api/inventory/import-jobs";

export type ImportType =
  | "customers"
  | "shipments"
  | "units"
  | "sales"
  | "servicing"
  | "shipment_costs";

export type ImportJobStatus = "dry_run" | "committed" | "failed" | "rolled_back";

export type ImportJob = {
  id: number;
  import_type: ImportType;
  import_type_display: string;
  original_filename: string;
  file_sha256: string;
  uploaded_by: number | null;
  uploaded_by_name: string;
  status: ImportJobStatus;
  status_display: string;
  rows_read: number;
  rows_created: number;
  rows_skipped: number;
  rows_error: number;
  options_used: Record<string, unknown>;
  error_summary: Array<{ row?: number; field?: string; message?: string; value?: string }>;
  started_at: string | null;
  finished_at: string | null;
  rollback_blocked_reason: string;
  rolled_back_at: string | null;
  rolled_back_by: number | null;
  rolled_back_by_name: string;
  created_at: string;
  updated_at: string;
};

export type DryRunRow = {
  row: number;
  status: "CREATE" | "SKIP" | "UPDATE" | "ERROR";
  data: Record<string, unknown>;
  errors: string[];
};

export type DryRunResult = {
  import_type: ImportType;
  filename: string;
  file_sha256: string;
  rows_read: number;
  rows_create: number;
  rows_skip: number;
  rows_update: number;
  rows_error: number;
  can_commit: boolean;
  preview_rows: DryRunRow[];
  errors: Array<{ row: number; field: string; message: string; value?: string }>;
};

export const IMPORT_TYPE_HELP: Record<
  ImportType,
  { label: string; order: number; columns: string; help: string }
> = {
  customers: {
    label: "Customers",
    order: 1,
    columns:
      "name, phone, email, customer_type, company_name, pan_number, address, district, province, dealer, registration_date, notes",
    help: "Import first. Match existing by phone or PAN/VAT. District/province must match the reference lists. Dealers must already exist.",
  },
  shipments: {
    label: "Shipments",
    order: 2,
    columns:
      "shipment_no, supplier_exporter, container_bl_no, carrier_name, origin, status, etd, eta, actual_arrival_date, customs_clearance_date, warehouse_received_date, notes",
    help: "Import after customers. Keep old shipment numbers when provided; new SHP sequences will not collide.",
  },
  units: {
    label: "Units",
    order: 3,
    columns:
      "vin_chassis_no, model_code, variant_name, color, motor_no, battery_no, manufacture_date, odometer_km, status, shipment_no, arrival_date, dealer, stockyard_location, purchase_cost, landed_cost, selling_price",
    help: "Import after shipments. Models, variants, dealers and shipments must already exist — nothing is auto-created.",
  },
  sales: {
    label: "Sales",
    order: 4,
    columns:
      "tax_invoice_no, vin_chassis_no, customer_phone, customer_pan_vat, sale_date, selling_price, discount, down_payment, payment_mode, bank_name, dealer, salesperson_name, notes",
    help: "Import after units and customers. Matches customer by phone or PAN/VAT. Skips PDI requirement and marks units Legacy.",
  },
  servicing: {
    label: "Servicing history",
    order: 5,
    columns:
      "job_card_no, vin_chassis_no, customer_phone, date_received, date_completed, job_type, odometer_reading, technician_name, status, labour_cost, parts_cost, notes",
    help: "Import after sales. Matches unit by VIN; the job card number is the natural key, so re-imports skip existing jobs.",
  },
  shipment_costs: {
    label: "Shipment cost lines (optional)",
    order: 6,
    columns: "shipment_no, cost_type, amount, currency, exchange_rate, description",
    help: "Import after shipments. Cost type must match an existing cost type code or name. Exchange rate converts to NPR and is required for non-NPR currencies (NPR defaults to 1).",
  },
};

async function downloadBlob(path: string, filename: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token = await getValidAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) message = String(data.detail);
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchImportJobs(params?: Record<string, string>): Promise<ImportJob[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const data = await api.get<ImportJob[] | { results: ImportJob[] }>(`${BASE}/${qs}`);
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function dryRunImport(
  importType: ImportType,
  file: File,
  updateExisting = false,
  calendar: "ad" | "bs" = "ad",
): Promise<DryRunResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("import_type", importType);
  form.append("update_existing", updateExisting ? "true" : "false");
  form.append("calendar", calendar);
  return api.post<DryRunResult>(`${BASE}/dry-run/`, form);
}

export async function commitImport(
  importType: ImportType,
  file: File,
  options: { updateExisting?: boolean; skipInvalid?: boolean; calendar?: "ad" | "bs" } = {},
): Promise<ImportJob> {
  const form = new FormData();
  form.append("file", file);
  form.append("import_type", importType);
  form.append("update_existing", options.updateExisting ? "true" : "false");
  form.append("skip_invalid", options.skipInvalid ? "true" : "false");
  form.append("calendar", options.calendar ?? "ad");
  return api.post<ImportJob>(`${BASE}/commit/`, form);
}

export async function rollbackImportJob(id: number): Promise<ImportJob> {
  return api.post<ImportJob>(`${BASE}/${id}/rollback/`);
}

export async function downloadImportTemplate(importType: ImportType, format: "csv" | "xlsx") {
  await downloadBlob(
    `${BASE}/template/?import_type=${importType}&format=${format}`,
    `historical_${importType}_template.${format}`,
  );
}

export async function downloadImportErrors(
  errors: Array<{ row?: number; field?: string; message?: string; value?: string }>,
) {
  await downloadBlob(`${BASE}/download-errors/`, "import_validation_errors.csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ errors }),
  });
}
