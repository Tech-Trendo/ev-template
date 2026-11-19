import { api, getValidAccessToken, ApiError, API_BASE } from "./api";

export type UnitStatus =
  | "IN_TRANSIT" | "IN_WAREHOUSE" | "PDI_PENDING" | "PDI_PASSED" | "PDI_FAILED"
  | "READY_FOR_SALE" | "RESERVED" | "SOLD" | "RETURNED" | "SCRAPPED";

export type PdiStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "COMPLETED" | "LOCKED";
export type InspectionType = "PDI" | "VEI";
export type CheckResult = "OK" | "NOT_OK" | "NA";
export type OverallRating = "VERY_GOOD" | "GOOD" | "POOR";
export type ReportType = "PRE_DELIVERY" | "AT_DELIVERY" | "SERVICE" | "RESALE_INSPECTION";

export type VehicleBodyType = {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type VehicleVariant = {
  id: number;
  vehicle_model: number;
  vehicle_model_name?: string;
  vehicle_model_detail?: { id: number; brand: string; model_name: string };
  body_type: number | null;
  body_type_detail?: { id: number; name: string } | null;
  name: string;
  product_code?: string;
  price_override: string | number | null;
  battery_kw_override?: string | number | null;
  motor_kw_override?: string | number | null;
  range_km_override?: string | number | null;
  payload_kg_override?: string | number | null;
  spec_text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type VehicleModel = {
  id: number;
  brand: string;
  model_name: string;
  battery_power_kw: string | null;
  motor_power_kw: string | null;
  seating_capacity: number | null;
  charger_type: string;
  default_color_options: string[];
  low_stock_threshold: number;
  is_active: boolean;
  units_in_stock?: number;
  vehicle_warranty_months?: number | null;
  vehicle_warranty_km?: number | null;
  battery_warranty_months?: number | null;
  battery_warranty_km?: number | null;
  motor_warranty_months?: number | null;
  variants?: VehicleVariant[];
  has_active_variants?: boolean;
};

export const getModelDisplayName = (
  m: { brand?: string; model_name?: string } | undefined | null,
  variantName?: string | null,
): string => {
  if (!m) return variantName ? variantName.trim() : "";
  const brand = (m.brand || "").trim();
  const model = (m.model_name || "").trim();
  let base = "";
  if (!brand) base = model;
  else if (!model) base = brand;
  else if (model.toLowerCase().startsWith(brand.toLowerCase())) base = model;
  else base = `${brand} ${model}`;

  if (variantName && variantName.trim()) {
    return `${base} (${variantName.trim()})`;
  }
  return base;
};

export type TransportStatus =
  | "ORDERED"
  | "IN_TRANSIT"
  | "BORDER_CUSTOMS"
  | "CUSTOMS_CLEARED"
  | "ARRIVED"
  | string;

export const TRANSPORT_STATUS_LABELS: Record<string, string> = {
  ORDERED: "Dispatched from China Factory",
  IN_TRANSIT: "In Transit (China to Border)",
  BORDER_CUSTOMS: "At border customs",
  CUSTOMS_CLEARED: "Customs Cleared & En Route",
  ARRIVED: "Arrived at Stockyard",
};

export type ShipmentStatus =
  | "ORDERED"
  | "IN_TRANSIT"
  | "AT_PORT"
  | "CUSTOMS_CLEARANCE"
  | "RECEIVED"
  | "CLOSED";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ORDERED: "Ordered",
  IN_TRANSIT: "In Transit",
  AT_PORT: "At Port / Border",
  CUSTOMS_CLEARANCE: "Customs Clearance",
  RECEIVED: "Received at Warehouse",
  CLOSED: "Closed",
};

export type ShipmentCostType = {
  id: number;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
};

export type ShipmentCost = {
  id: number;
  shipment: number;
  cost_type: number;
  cost_type_code?: string;
  cost_type_name?: string;
  description: string;
  amount: string | number;
  currency: string;
  exchange_rate: string | number;
  amount_npr: string | number;
  created_at: string;
  updated_at: string;
};

export type ShipmentProgressSummary = {
  units_expected: number;
  units_received: number;
  vei_done: number;
  vei_with_issues: number;
};

export type RequiredDocumentChecklistItem = {
  code: string;
  name: string;
  category: string;
  is_attached: boolean;
  document_id: number | null;
  document_title: string | null;
  document_file_url: string | null;
};

export type RequiredDocumentsChecklist = {
  all_attached: boolean;
  total_required: number;
  attached_count: number;
  items: RequiredDocumentChecklistItem[];
};

export const BORDER_CROSSINGS = [
  "Rasuwagadhi (Kerung)",
  "Tatopani (Kodari)",
  "Birgunj Dry Port (ICD)",
  "Bhairahawa (Belahiya)",
  "Other",
];

export type TransportStatusOption = {
  id: number;
  name: string;
  label: string;
  description?: string;
  is_active: boolean;
  batch_count: number;
  created_at: string;
  updated_at: string;
};

export type BorderCrossing = {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  batch_count: number;
  created_at: string;
  updated_at: string;
};

export type DestinationWarehouse = {
  id: number;
  name: string;
  location?: string;
  contact_person?: string;
  phone?: string;
  is_active: boolean;
  batch_count: number;
  created_at: string;
  updated_at: string;
};

export type InventoryMeta = {
  transport_statuses: { name: string; label: string }[];
  border_crossings: string[];
  destination_warehouses: string[];
};

export type ImportBatch = {
  id: number;
  shipment_no: string;
  batch_no: string;
  supplier_exporter?: string;
  container_bl_no?: string;
  vessel_transport_mode?: string;
  port_of_loading?: string;
  port_of_arrival?: string;
  etd?: string | null;
  eta?: string | null;
  actual_arrival_date?: string | null;
  customs_clearance_date?: string | null;
  warehouse_received_date?: string | null;
  status: ShipmentStatus;
  status_display?: string;
  origin: string;
  transport_status: TransportStatus;
  transport_status_display?: string;
  border_crossing: string;
  customs_declaration_no: string;
  container_or_truck_no: string;
  carrier_name: string;
  destination_warehouse: string;
  lc_number: string;
  shipped_date: string | null;
  eta_date: string | null;
  arrived_date: string | null;
  invoice_no: string;
  total_units: number;
  units_count: number;
  sold_count: number;
  remaining_count: number;
  progress_summary?: ShipmentProgressSummary;
  costs?: ShipmentCost[];
  total_landed_cost_npr?: string | number | null;
  average_cost_per_unit_npr?: string | number | null;
  required_documents_checklist?: RequiredDocumentsChecklist;
  notes: string;
  is_deleted?: boolean;
  deletion_reason?: string;
  created_by: number | null;
  created_by_name: string;
  updated_by_name?: string;
  created_at: string;
  updated_at?: string;
};

export type ModelRef = { id: number; brand: string; model_name: string };

export type UnitListItem = {
  id: number;
  vin_chassis_no: string;
  vehicle_model: number;
  model_detail: ModelRef;
  variant?: number | null;
  variant_name?: string | null;
  variant_detail?: {
    id: number;
    name: string;
    body_type_name?: string;
    body_type_detail?: { id: number; name: string } | null;
    spec_text?: string;
    price_override?: string | number | null;
  } | null;
  import_batch: number;
  batch_no: string;
  shipment_no?: string | null;
  shipment_arrival_date?: string | null;
  color: string;
  motor_no?: string;
  battery_no?: string;
  status: UnitStatus;
  manufacture_date: string | null;
  odometer_km: number;
  pdi_status: PdiStatus | null;
  pdi_no: string;
  open_pdi_id?: number | null;
  selling_price: string | null;
  sold_price?: string | number | null;
  sold_date: string | null;
  payment_mode?: string | null;
  finance_bank_name?: string | null;
  tax_invoice_no?: string | null;
  customer_name?: string | null;
  sold_to_customer?: number | null;
  sold_to_lead?: number | null;
  warranty_end_date?: string | null;
  warranty_end?: string | null;
  warranty_status?: string | null;
  vehicle_warranty_status?: string | null;
  vehicle_warranty_end?: string | null;
  battery_warranty_status?: string | null;
  battery_warranty_end?: string | null;
  next_service_due?: {
    status: "overdue" | "due_soon" | "ok" | "not_configured" | "none";
    due_date: string | null;
    due_km: number | null;
    days_until_due: number | null;
    km_until_due: number | null;
    is_overdue: boolean;
    overdue_by_date: boolean;
    overdue_by_km: boolean;
    last_service_date: string | null;
    last_service_km: number | null;
  };
  created_by_name?: string | null;
  updated_by_name?: string | null;
  has_pdi_for_sale?: boolean;
  pdi_sale_warning?: string;
  vei_status?: string | null;
  vei_no?: string | null;
  vei_badge?: "NOT_DONE" | "PENDING" | "PASSED" | "ISSUES" | "FAILED" | "LEGACY";
  pdi_badge?: "NOT_DONE" | "PENDING" | "PASSED" | "ISSUES" | "FAILED" | "LEGACY";
  source?: string;
  open_inspection_issues_count?: number;
  open_inspection_issues?: InspectionIssue[];
  created_at: string;
};

export type Movement = {
  id: number;
  movement_type: string;
  quantity: number;
  reference_note: string;
  created_by: number | null;
  created_by_name: string;
  created_at: string;
};

export type PdiHistoryItem = {
  id: number;
  inspection_type?: InspectionType;
  inspection_type_display?: string;
  pdi_no: string;
  inspection_date: string;
  overall_rating: OverallRating | null;
  checked_by: string;
  status: PdiStatus;
  not_ok_count: number;
  submitted_at: string | null;
  is_locked?: boolean;
};

/** Route to an open draft/submitted inspection, or null when a new one should be started. */
export function openInspectionPath(
  unitId: number | string,
  type: InspectionType,
  history: Pick<PdiHistoryItem, "id" | "inspection_type" | "status">[] | null | undefined,
): string | null {
  const open = (history ?? []).find(
    (h) => (h.inspection_type || "PDI") === type && (h.status === "DRAFT" || h.status === "SUBMITTED"),
  );
  if (!open) return null;
  const kind = type === "VEI" ? "vei" : "pdi";
  return `units/${unitId}/${kind}/${open.id}${open.status === "DRAFT" ? "/edit" : ""}`;
}

export type ConditionHistoryItem = {
  id: number;
  report_no?: string;
  report_type: ReportType;
  report_date?: string;
  odometer_km?: number;
  overall_rating?: OverallRating | null;
  overall_condition?: OverallRating | null;
  inspected_by: string;
  photo_count?: number;
  created_at?: string;
};

export type ReceiveEntityCondition = {
  id?: number;
  entity?: string;
  entity_name?: string;
  condition?: "Good" | "Bad" | "N/C" | "N/A" | "N/W" | "N/P" | string;
  status_condition?: "GOOD" | "BAD" | "OK" | "NC" | "NA" | "NW" | "NP" | string;
  remarks?: string;
  condition_remarks?: string;
};

export type ReceiveToolkitItem = {
  id?: number;
  item?: string;
  item_no?: number;
  item_name?: string;
  present?: boolean;
  is_present?: boolean;
  remarks?: string;
};

export type VehicleReceiveCheckList = {
  id: number;
  receive_no: string;
  vehicle: number;
  service_record?: number | null;
  vro_no?: string;
  vehicle_vin: string;
  vehicle_model_name?: string;
  import_batch?: number | null;
  batch_no?: string;
  receive_date: string;
  driver_name: string;
  driver_contact: string;
  driver_signature: string;
  rep_signature: string;
  ev_company: string;
  vehicle_run_km: number;
  ev_seater: string;
  battery_power_kw: string | null;
  ev_charge_percent: number;
  vehicle_color: string;
  vehicle_parked_yard: string;
  any_other_information: string;
  legend_notes: string;
  port_transport_remarks?: string;
  entity_conditions: ReceiveEntityCondition[];
  toolkit_items: ReceiveToolkitItem[];
  overall_status: string;
  created_by?: number | null;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
};

export type UnitDetail = UnitListItem & {
  motor_no: string;
  battery_no?: string;
  battery_power_kw: string | null;
  motor_power_kw: string | null;
  effective_battery_kw: string | null;
  effective_motor_kw: string | null;
  purchase_cost: string | null;
  landed_cost: string | null;
  sold_price: string | null;
  customer: number | null;
  customer_name: string;
  customer_detail?: { id: number; name: string; company: string; phone: string };
  lead: number | null;
  lead_detail?: { id: number; name: string; company: string; phone: string };
  quotation: number | null;
  quotation_detail?: {
    id: number;
    display_id: string;
    total: number;
    quotation_no?: string;
    total_amount?: number;
  };
  payment_mode?: "CASH" | "BANK_FINANCE" | "PARTIAL_FINANCE";
  finance_bank_name?: string;
  down_payment?: string | null;
  loan_amount?: string | null;
  loan_tenure_months?: number | null;
  interest_rate?: string | null;
  monthly_emi?: string | null;
  finance_status?: string;
  tax_invoice_no?: string;
  receipt_voucher_no?: string;
  salesperson_name?: string;
  delivery_notes?: string;
  sale_id?: number | null;
  batch_detail: { id: number; batch_no: string; origin: string };
  movements: Movement[];
  pdi_history: PdiHistoryItem[];
  condition_history: ConditionHistoryItem[];
  service_records?: Array<{
    id: number;
    vro_no: string;
    chassis_number: string;
    status: string;
    date_received: string;
    time_received?: string;
    date_completed?: string | null;
    actual_delivered_at?: string | null;
    duration_display?: string;
    technician_name?: string;
    job_description?: string;
    action_taken?: string;
    total_cost?: number;
    labour_cost?: string | number;
    parts_cost?: string | number;
    service_date?: string;
    service_type?: string;
    notes?: string;
  }>;
  receive_checklists?: VehicleReceiveCheckList[];
  updated_at: string;
};

export type InspectionIssue = {
  id: number;
  inspection?: number;
  inspection_id?: number;
  inspection_no: string;
  inspection_type: InspectionType;
  item: number | null;
  item_label: string;
  item_section: string;
  result: number | null;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: number | null;
  resolved_by_name: string;
  resolution_notes: string;
  created_at: string;
  updated_at: string;
};

export type InspectionPhoto = {
  id: number;
  inspection: number;
  photo: string;
  photo_display: string;
  caption: string;
  created_at: string;
};

export type ChecklistItem = {
  id: number;
  section: string;
  sub_section: string | null;
  label: string;
  sort_order: number;
};

export type ChecklistTemplate = {
  id: number;
  name?: string;
  inspection_type?: InspectionType;
  inspection_type_display?: string;
  vehicle_model?: number | null;
  vehicle_model_name?: string;
  variant?: number | null;
  variant_name?: string;
  version_no: number;
  is_active: boolean;
  items: ChecklistItem[];
  section_labels: Record<string, string>;
  created_at: string;
};

export type PdiResult = {
  id: number;
  item: number;
  label: string;
  label_snapshot: string;
  section_snapshot: string;
  sub_section_snapshot: string;
  result: CheckResult;
  remark: string;
  photo: string | null;
  photo_display: string;
};

export type PdiInspection = {
  id: number;
  inspection_type: InspectionType;
  inspection_type_display?: string;
  is_locked?: boolean;
  can_reopen?: boolean;
  pdi_no: string;
  vehicle: number;
  vehicle_vin: string;
  variant_name?: string;
  import_batch?: number | null;
  import_batch_detail?: {
    id: number;
    batch_no: string;
    transport_status: string;
    invoice_no: string;
    border_crossing: string;
    origin: string;
    container_or_truck_no: string;
    departure_date: string | null;
    estimated_arrival_date: string | null;
    actual_arrival_date: string | null;
    destination_warehouse: string;
  } | null;
  template: number;
  template_version: number;
  inspection_date: string;
  ev_company_name?: string;
  vin_chassis_no: string;
  model_snapshot: string;
  battery_power_snapshot: string;
  motor_power_snapshot: string;
  motor_no_snapshot: string;
  manufacture_date_snapshot: string | null;
  color_snapshot: string;
  odometer_km_snapshot: number;
  overall_rating: OverallRating | null;
  checked_by: string;
  status: PdiStatus;
  signature: string | null;
  signature_display: string;
  submitted_at: string | null;
  not_ok_count: number;
  open_issues_count?: number;
  issues?: InspectionIssue[];
  general_photos?: InspectionPhoto[];
  results: PdiResult[];
};

export type ConditionPhoto = {
  id: number;
  image: string;
  image_display: string;
  caption: string;
  sort_order: number;
};

export type ConditionReport = {
  id: number;
  vehicle: number;
  vehicle_vin: string;
  template: number;
  template_version: number;
  report_type: ReportType;
  report_date: string;
  odometer_km: number;
  overall_rating: OverallRating | null;
  inspected_by: string;
  notes: string;
  results: PdiResult[];
  photos: ConditionPhoto[];
};

export type Paged<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
};

export type StockSummary = {
  kpis: Record<string, number>;
  by_model: {
    id: number; brand: string; model_name: string; imported: number; sold: number;
    remaining: number; reserved: number; threshold: number; low_stock: boolean;
  }[];
  by_color: { color: string; count: number }[];
  trend: { month: string; imported: number; sold: number }[];
  low_stock_alerts: { id: number; brand: string; model_name: string; remaining: number; threshold: number }[];
};

const BASE = "/api/inventory";

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/* Models */
export const fetchModels = (p?: Record<string, string | number>) =>
  api<VehicleModel[]>(`${BASE}/models/${qs(p)}`);
export const createModel = (b: unknown) =>
  api<VehicleModel>(`${BASE}/models/`, { method: "POST", body: JSON.stringify(b) });
export const updateModel = (id: number, b: unknown) =>
  api<VehicleModel>(`${BASE}/models/${id}/`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteModel = (id: number) =>
  api(`${BASE}/models/${id}/`, { method: "DELETE" });

/* Batches / Shipments */
export const fetchBatches = (p?: Record<string, string | number>) =>
  api<ImportBatch[]>(`${BASE}/batches/${qs(p)}`);
export const fetchBatch = (id: string | number) =>
  api<ImportBatch>(`${BASE}/batches/${id}/`);
export const createBatch = (b: unknown) =>
  api<ImportBatch>(`${BASE}/batches/`, { method: "POST", body: JSON.stringify(b) });
export const updateBatch = (id: number, b: unknown) =>
  api<ImportBatch>(`${BASE}/batches/${id}/`, { method: "PATCH", body: JSON.stringify(b) });
export const deleteBatch = (id: number) =>
  api(`${BASE}/batches/${id}/`, { method: "DELETE" });
export const softDeleteShipment = (id: number, reason: string) =>
  api<{ detail: string }>(`${BASE}/batches/${id}/`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
export const changeShipmentStatus = (
  id: number,
  payload: {
    status: string;
    receive_units?: boolean;
    notes?: string;
    override_reason?: string;
    override_missing_documents?: boolean;
  },
) =>
  api<ImportBatch>(`${BASE}/batches/${id}/change-status/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const recordShipmentPrint = (
  id: number,
  payload?: { document_type?: string; notes?: string },
) =>
  api<{ detail: string; log_id: string }>(`${BASE}/batches/${id}/record-print/`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
export const exportShipmentsCsv = async (params?: Record<string, string>): Promise<Blob> => {
  const token = await getValidAccessToken();
  const q = qs(params);
  const res = await fetch(`${API_BASE}${BASE}/batches/export-csv/${q}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to export shipments CSV");
  return res.blob();
};
export const fetchShipmentCostTypes = (params?: { is_active?: string }) =>
  api<ShipmentCostType[]>(`${BASE}/cost-types/${qs(params)}`);
export const createShipmentCost = (payload: {
  shipment: number;
  cost_type: number;
  amount: number | string;
  currency: string;
  exchange_rate?: number | string;
  description?: string;
}) =>
  api<ShipmentCost>(`${BASE}/shipment-costs/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const deleteShipmentCost = (costId: number) =>
  api<void>(`${BASE}/shipment-costs/${costId}/`, { method: "DELETE" });
export const attachExistingUnitsToShipment = (id: number, unitIds: number[]) =>
  api<{ detail: string; count: number }>(`${BASE}/batches/${id}/add_units/`, {
    method: "POST",
    body: JSON.stringify({ unit_ids: unitIds }),
  });
export const addBatchUnits = (id: number, units: Record<string, unknown>[]) =>
  api<{ created: string[]; created_count: number; errors: string[] }>(
    `${BASE}/batches/${id}/add_units/`, { method: "POST", body: JSON.stringify({ units }) },
  );
export const importBatchCsv = (id: number, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<{ created: string[]; created_count: number; errors: string[] }>(
    `${BASE}/batches/${id}/import-csv/`, { method: "POST", body: fd },
  );
};
export const receiveBatchUnits = (id: number, note = "") =>
  api<{ moved_count: number; detail: string; batch: ImportBatch }>(
    `${BASE}/batches/${id}/receive-units/`,
    { method: "POST", body: JSON.stringify({ note }) },
  );

/* Units */
export function fetchUnits(p?: Record<string, string | number>): Promise<UnitListItem[] | Paged<UnitListItem>> {
  return api(`${BASE}/units/${qs(p)}`);
}
export const fetchUnit = (id: string | number) => api<UnitDetail>(`${BASE}/units/${id}/`);
export const deleteUnit = (id: number) => api(`${BASE}/units/${id}/`, { method: "DELETE" });
export const fetchUnitsSummary = (p?: Record<string, string | number>) =>
  api<Record<string, number>>(`${BASE}/units/summary/${qs(p)}`);

function transition(id: number, action: string, body?: unknown, keepalive = false): Promise<UnitDetail> {
  return api(`${BASE}/units/${id}/${action}/`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body ?? {}),
    keepalive,
  });
}
export const unitArrive = (id: number) => transition(id, "arrive");
export const unitMoveToReady = (id: number) => transition(id, "move_to_ready");
export const unitReserve = (id: number, b: { customer?: number | null; customer_name?: string; note?: string; lead?: number | null }) =>
  transition(id, "reserve", b);
export const unitRelease = (id: number, note?: string) => transition(id, "release", { note });
export type SoldFinancePayload = {
  sold_price: string;
  sold_date?: string;
  customer?: number | string | null;
  customer_name?: string;
  lead?: number | string | null;
  quotation?: number | string | null;
  payment_mode?: string;
  finance_bank_name?: string;
  down_payment?: string | number | null;
  loan_amount?: string | number | null;
  loan_tenure_months?: string | number | null;
  interest_rate?: string | number | null;
  monthly_emi?: string | number | null;
  finance_status?: string;
  tax_invoice_no?: string;
  receipt_voucher_no?: string;
  salesperson_name?: string;
  warranty_end_date?: string | null;
  delivery_notes?: string;
};

export const unitMarkSold = (id: number, b: SoldFinancePayload) =>
  transition(id, "mark_sold", b);
export const unitMarkReturned = (id: number, note?: string) => transition(id, "mark_returned", { note });
export const unitRestock = (id: number, note?: string) => transition(id, "restock", { note });
export const unitScrap = (id: number, note?: string) => transition(id, "scrap", { note });
export const unitStartPdi = (id: number, keepalive = false): Promise<PdiInspection> =>
  transition(id, "start_pdi", undefined, keepalive) as unknown as Promise<PdiInspection>;
export const unitStartVei = (id: number, keepalive = false): Promise<PdiInspection> =>
  transition(id, "start_vei", undefined, keepalive) as unknown as Promise<PdiInspection>;

/* Vehicle Receive Checklist (China delivery partner arrival) */
export const RECEIVE_ENTITIES = [
  "Body Dent",
  "Glass",
  "Mirror",
  "Keys",
  "Reflector 1 Pc",
  "Spare Tire 1 Pc",
  "Tool Box 1 Set",
  "Safety Hammer 1 Pc",
  "Fire Extinguisher 1 Pc",
  "Charger 1PC",
] as const;

export const RECEIVE_TOOLKIT_ITEMS = [
  "Screw Driver Set + & -",
  "Open Spanner (8/10mm)",
  "Open Spanner (12/14mm)",
  "Wheel Pana",
  "Tyre Lever",
  "Toeing Hook",
  "Reflector Jacket",
  "A/C Charger 7KW",
  "Safety Hammer",
  "Fire Extinguisher",
  "Jack",
  "Plier",
  "Jack Supporter",
  "Spare Tyre",
  "Any Other",
] as const;

export async function fetchReceiveChecklists(params?: Record<string, string | number>): Promise<VehicleReceiveCheckList[]> {
  const data = await api<VehicleReceiveCheckList[] | { results: VehicleReceiveCheckList[] }>(`${BASE}/receive-checklists/${qs(params)}`);
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function fetchReceiveChecklist(id: number | string): Promise<VehicleReceiveCheckList> {
  return api<VehicleReceiveCheckList>(`${BASE}/receive-checklists/${id}/`);
}

export async function createReceiveChecklist(data: Partial<VehicleReceiveCheckList>): Promise<VehicleReceiveCheckList> {
  return api<VehicleReceiveCheckList>(`${BASE}/receive-checklists/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateReceiveChecklist(id: number | string, data: Partial<VehicleReceiveCheckList>): Promise<VehicleReceiveCheckList> {
  return api<VehicleReceiveCheckList>(`${BASE}/receive-checklists/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/* PDI */
export const fetchPdi = (id: string | number) => api<PdiInspection>(`${BASE}/pdi/${id}/`);
export const savePdiDraft = (id: number, b: unknown, keepalive = false) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/`, { method: "PATCH", body: JSON.stringify(b), keepalive });
export const submitPdi = (id: number, b: unknown) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/submit/`, { method: "POST", body: JSON.stringify(b) });
export const completePdi = (
  id: number,
  b: {
    overall_rating?: string;
    checked_by?: string;
    results?: Array<{ item: number; result: string; remark?: string }>;
  },
) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/complete/`, {
    method: "POST",
    body: JSON.stringify(b),
  });
export const lockPdi = (id: number) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/lock/`, { method: "POST" });
export const reopenPdi = (id: number, note?: string) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/reopen/`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
export const recordPrintPdi = (id: number) =>
  api<{ detail: string; log_id: number }>(`${BASE}/pdi/${id}/record-print/`, {
    method: "POST",
  });
export const approvePdi = (id: number) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/approve/`, { method: "POST" });
export const rejectPdi = (id: number, note?: string) =>
  api<PdiInspection>(`${BASE}/pdi/${id}/reject/`, { method: "POST", body: JSON.stringify({ note }) });
export const deletePdi = (id: number) => api(`${BASE}/pdi/${id}/`, { method: "DELETE" });
export const uploadPdiResultPhoto = (pdiId: number, itemId: number, file: File) => {
  const fd = new FormData();
  fd.append("photo", file);
  return api<PdiResult>(`${BASE}/pdi/${pdiId}/results/${itemId}/photo/`, { method: "POST", body: fd });
};
export const clearPdiResultPhoto = (pdiId: number, itemId: number) =>
  api(`${BASE}/pdi/${pdiId}/results/${itemId}/photo/`, { method: "DELETE" });

/* Condition reports */
export const fetchConditionReport = (id: string | number) =>
  api<ConditionReport>(`${BASE}/condition-reports/${id}/`);
export const createConditionReport = (b: unknown) =>
  api<ConditionReport>(`${BASE}/condition-reports/`, { method: "POST", body: JSON.stringify(b) });
export const updateConditionReport = (id: number, b: unknown) =>
  api<ConditionReport>(`${BASE}/condition-reports/${id}/`, { method: "PATCH", body: JSON.stringify(b) });
export const uploadConditionPhotos = (id: number, files: File[], captions: string[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("photos", f));
  fd.append("captions", JSON.stringify(captions));
  return api<ConditionPhoto[]>(`${BASE}/condition-reports/${id}/photos/`, { method: "POST", body: fd });
};
export const deleteConditionPhoto = (id: number, photoId: number) =>
  api(`${BASE}/condition-reports/${id}/photos/${photoId}/`, { method: "DELETE" });
export const uploadConditionResultPhoto = (id: number, itemId: number, file: File) => {
  const fd = new FormData();
  fd.append("photo", file);
  return api<PdiResult>(`${BASE}/condition-reports/${id}/results/${itemId}/photo/`, { method: "POST", body: fd });
};
export const clearConditionResultPhoto = (id: number, itemId: number) =>
  api(`${BASE}/condition-reports/${id}/results/${itemId}/photo/`, { method: "DELETE" });

export const fetchActiveChecklist = (inspectionType: InspectionType = "PDI", p?: Record<string, string | number>) => {
  const params = new URLSearchParams({ inspection_type: inspectionType });
  if (p) {
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
  }
  return api<ChecklistTemplate>(`${BASE}/checklist/active/?${params.toString()}`);
};

export const fetchChecklistTemplates = (p?: Record<string, string | number>) => {
  const params = new URLSearchParams();
  if (p) {
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
    });
  }
  const qsStr = params.toString() ? `?${params.toString()}` : "";
  return api<ChecklistTemplate[]>(`${BASE}/checklist/${qsStr}`);
};

export const createChecklistTemplate = (body: Partial<ChecklistTemplate>) =>
  api<ChecklistTemplate>(`${BASE}/checklist/`, { method: "POST", body: JSON.stringify(body) });

export const updateChecklistTemplate = (id: number, body: Partial<ChecklistTemplate>) =>
  api<ChecklistTemplate>(`${BASE}/checklist/${id}/`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteChecklistTemplate = (id: number) =>
  api(`${BASE}/checklist/${id}/`, { method: "DELETE" });

export const addChecklistItem = (templateId: number, item: Partial<ChecklistItem>) =>
  api<ChecklistItem>(`${BASE}/checklist/${templateId}/items/`, { method: "POST", body: JSON.stringify(item) });

export const updateChecklistItem = (templateId: number, itemId: number, item: Partial<ChecklistItem>) =>
  api<ChecklistItem>(`${BASE}/checklist/${templateId}/items/${itemId}/`, { method: "PATCH", body: JSON.stringify(item) });

export const deleteChecklistItem = (templateId: number, itemId: number) =>
  api(`${BASE}/checklist/${templateId}/items/${itemId}/delete/`, { method: "DELETE" });

export const uploadInspectionGeneralPhoto = (pdiId: string | number, file: File, caption = "") => {
  const fd = new FormData();
  fd.append("photo", file);
  if (caption) fd.append("caption", caption);
  return api<InspectionPhoto>(`${BASE}/pdi/${pdiId}/photos/`, { method: "POST", body: fd });
};

export const resolveInspectionIssue = (pdiId: string | number, payload: { issue_id: number; notes?: string }) =>
  api<InspectionIssue>(`${BASE}/pdi/${pdiId}/resolve-issue/`, { method: "POST", body: JSON.stringify(payload) });
export const fetchStockSummary = (p?: Record<string, string | number>) =>
  api<StockSummary>(`${BASE}/stock/${qs(p)}`);
export const fetchStockBatches = () =>
  api<{ id: number; batch_no: string; origin: string; arrived_date: string | null; imported: number; sold: number; remaining: number; pct_sold: number }[]>(`${BASE}/stock/batches/`);
export const fetchStockAging = () =>
  api<{ warehouse: { id: number; vin_chassis_no: string; model: string; status: string; created_at: string; days_in_stock: number }[]; pdi_pending: { id: number; vin_chassis_no: string; model: string; status: string; created_at: string; days_in_stock: number }[] }>(`${BASE}/stock/aging/`);

/* Helpers */
const npr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "NPR",
  maximumFractionDigits: 0,
});

export function formatNPR(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return npr.format(n);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDate(value)} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export const UNIT_STATUSES: { value: UnitStatus; label: string }[] = [
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "IN_WAREHOUSE", label: "In Warehouse" },
  { value: "PDI_PENDING", label: "PDI Pending" },
  { value: "PDI_PASSED", label: "PDI Passed" },
  { value: "PDI_FAILED", label: "PDI Failed" },
  { value: "READY_FOR_SALE", label: "Ready for Sale" },
  { value: "RESERVED", label: "Reserved" },
  { value: "SOLD", label: "Sold" },
  { value: "RETURNED", label: "Returned" },
  { value: "SCRAPPED", label: "Scrapped" },
];

export const PDI_RATINGS: { value: OverallRating; label: string }[] = [
  { value: "VERY_GOOD", label: "Very Good" },
  { value: "GOOD", label: "Good" },
  { value: "POOR", label: "Poor" },
];

export const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "PRE_DELIVERY", label: "Pre-Delivery" },
  { value: "AT_DELIVERY", label: "At Delivery" },
  { value: "SERVICE", label: "Service" },
  { value: "RESALE_INSPECTION", label: "Resale Inspection" },
];

export async function downloadUnitsCsv(params?: Record<string, string | number>): Promise<void> {
  const token = await getValidAccessToken();
  const query = qs(params);
  const base = API_BASE;
  const res = await fetch(`${base}${BASE}/units/export/${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, (err as { detail?: string }).detail ?? "Export failed", err);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vehicle-units.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Dynamic transport status options
export async function fetchTransportStatuses(
  params?: Record<string, string | boolean>,
): Promise<TransportStatusOption[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  return api<TransportStatusOption[]>(`${BASE}/transport-statuses/${query ? `?${query}` : ""}`);
}

export async function createTransportStatus(payload: {
  name: string;
  label: string;
  description?: string;
  is_active?: boolean;
}): Promise<TransportStatusOption> {
  return api<TransportStatusOption>(`${BASE}/transport-statuses/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTransportStatus(
  id: number,
  patch: Partial<{ name: string; label: string; description: string; is_active: boolean }>,
): Promise<TransportStatusOption> {
  return api<TransportStatusOption>(`${BASE}/transport-statuses/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteTransportStatus(id: number): Promise<void> {
  await api<void>(`${BASE}/transport-statuses/${id}/`, { method: "DELETE" });
}

// Dynamic border crossings
export async function fetchBorderCrossings(
  params?: Record<string, string | boolean>,
): Promise<BorderCrossing[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  return api<BorderCrossing[]>(`${BASE}/border-crossings/${query ? `?${query}` : ""}`);
}

export async function createBorderCrossing(payload: {
  name: string;
  description?: string;
  is_active?: boolean;
}): Promise<BorderCrossing> {
  return api<BorderCrossing>(`${BASE}/border-crossings/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBorderCrossing(
  id: number,
  patch: Partial<{ name: string; description: string; is_active: boolean }>,
): Promise<BorderCrossing> {
  return api<BorderCrossing>(`${BASE}/border-crossings/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteBorderCrossing(id: number): Promise<void> {
  await api<void>(`${BASE}/border-crossings/${id}/`, { method: "DELETE" });
}

// Dynamic destination warehouses
export async function fetchDestinationWarehouses(
  params?: Record<string, string | boolean>,
): Promise<DestinationWarehouse[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  return api<DestinationWarehouse[]>(`${BASE}/destination-warehouses/${query ? `?${query}` : ""}`);
}

export async function createDestinationWarehouse(payload: {
  name: string;
  location?: string;
  contact_person?: string;
  phone?: string;
  is_active?: boolean;
}): Promise<DestinationWarehouse> {
  return api<DestinationWarehouse>(`${BASE}/destination-warehouses/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDestinationWarehouse(
  id: number,
  patch: Partial<{ name: string; location: string; contact_person: string; phone: string; is_active: boolean }>,
): Promise<DestinationWarehouse> {
  return api<DestinationWarehouse>(`${BASE}/destination-warehouses/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteDestinationWarehouse(id: number): Promise<void> {
  await api<void>(`${BASE}/destination-warehouses/${id}/`, { method: "DELETE" });
}

// Inventory meta options (all active dropdown choices in one request)
export async function fetchInventoryMeta(): Promise<InventoryMeta> {
  return api<InventoryMeta>(`${BASE}/meta/`);
}

// Vehicle body types
export async function fetchBodyTypes(
  params?: Record<string, string | boolean>,
): Promise<VehicleBodyType[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  return api<VehicleBodyType[]>(`${BASE}/body-types/${query ? `?${query}` : ""}`);
}

export async function createBodyType(payload: {
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}): Promise<VehicleBodyType> {
  return api<VehicleBodyType>(`${BASE}/body-types/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateBodyType(
  id: number,
  patch: Partial<{ name: string; description: string; sort_order: number; is_active: boolean }>,
): Promise<VehicleBodyType> {
  return api<VehicleBodyType>(`${BASE}/body-types/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteBodyType(id: number): Promise<void> {
  await api<void>(`${BASE}/body-types/${id}/`, { method: "DELETE" });
}

export type VehicleModelSpec = {
  id: number;
  vehicle_model: number;
  vehicle_model_name: string;
  kind: "battery" | "cargo_length";
  label: string;
  is_active: boolean;
  sort_order: number;
};

export async function fetchModelSpecs(
  params?: Record<string, string | boolean | number>,
): Promise<VehicleModelSpec[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  const data = await api<VehicleModelSpec[] | { results: VehicleModelSpec[] }>(
    `${BASE}/model-specs/${query ? `?${query}` : ""}`,
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function createModelSpec(payload: {
  vehicle_model: number;
  kind: "battery" | "cargo_length";
  label: string;
  is_active?: boolean;
}): Promise<VehicleModelSpec> {
  return api<VehicleModelSpec>(`${BASE}/model-specs/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateModelSpec(
  id: number,
  patch: Partial<{ vehicle_model: number; label: string; is_active: boolean }>,
): Promise<VehicleModelSpec> {
  return api<VehicleModelSpec>(`${BASE}/model-specs/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteModelSpec(id: number): Promise<void> {
  await api<void>(`${BASE}/model-specs/${id}/`, { method: "DELETE" });
}

// Vehicle variants
export async function fetchVariants(
  params?: Record<string, string | boolean | number>,
): Promise<VehicleVariant[]> {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) q.set(k, String(v));
    }
  }
  const query = q.toString();
  const data = await api<VehicleVariant[] | { results: VehicleVariant[] }>(
    `${BASE}/variants/${query ? `?${query}` : ""}`,
  );
  return Array.isArray(data) ? data : data.results ?? [];
}

export async function createVariant(payload: {
  vehicle_model: number;
  body_type?: number | null;
  name: string;
  product_code?: string;
  price_override?: number | string | null;
  battery_kw_override?: number | string | null;
  motor_kw_override?: number | string | null;
  range_km_override?: number | string | null;
  payload_kg_override?: number | string | null;
  spec_text?: string;
  sort_order?: number;
  is_active?: boolean;
}): Promise<VehicleVariant> {
  return api<VehicleVariant>(`${BASE}/variants/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateVariant(
  id: number,
  patch: Partial<{
    vehicle_model: number;
    body_type: number | null;
    name: string;
    product_code?: string;
    price_override: number | string | null;
    battery_kw_override: number | string | null;
    motor_kw_override: number | string | null;
    range_km_override: number | string | null;
    payload_kg_override: number | string | null;
    spec_text: string;
    sort_order: number;
    is_active: boolean;
  }>,
): Promise<VehicleVariant> {
  return api<VehicleVariant>(`${BASE}/variants/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteVariant(id: number): Promise<void> {
  await api<void>(`${BASE}/variants/${id}/`, { method: "DELETE" });
}

