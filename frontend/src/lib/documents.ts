import { api, getValidAccessToken, ApiError, API_BASE } from "./api";

export type DocumentCategory =
  | "SHIPMENT"
  | "VEHICLE_UNIT"
  | "CUSTOMER"
  | "SALE"
  | "GENERAL";

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  SHIPMENT: "Shipment / Import",
  VEHICLE_UNIT: "Vehicle Unit",
  CUSTOMER: "Customer KYC / Docs",
  SALE: "Sale / Delivery",
  GENERAL: "General / Media",
};

export type DocumentTypeMaster = {
  id: number;
  name: string;
  code: string;
  category: DocumentCategory;
  is_required_for_shipment: boolean;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DocumentVersion = {
  id: number;
  version_no: number;
  file: string;
  file_name?: string;
  file_size: number;
  file_type: string;
  file_hash: string;
  uploaded_by_name?: string;
  change_note: string;
  created_at: string;
};

export type DocumentAttachment = {
  id: number;
  document: number;
  shipment: number | null;
  shipment_no?: string | null;
  unit: number | null;
  unit_vin?: string | null;
  customer: string | null;
  customer_name?: string | null;
  sale: number | null;
  sale_no?: string | null;
  target_summary: string;
  created_at: string;
};

export type ExpiryStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NOT_APPLICABLE";

export type VaultDocument = {
  id: number;
  title: string;
  name?: string;
  category: DocumentCategory;
  document_type_master: number | null;
  document_type_master_detail?: DocumentTypeMaster | null;
  document_type: string;
  file: string;
  file_url: string;
  download_url: string;
  preview_url: string;
  file_hash: string;
  file_size: number;
  file_type: string;
  expiry_date: string | null;
  expiry_status: ExpiryStatus;
  notes: string;
  is_deleted: boolean;
  deletion_reason?: string;
  customer?: string | null;
  lead?: number | null;
  quotation?: number | null;
  uploaded_by?: number | null;
  uploaded_by_name?: string;
  versions: DocumentVersion[];
  attachments: DocumentAttachment[];
  used_in: {
    type: "SHIPMENT" | "UNIT" | "CUSTOMER" | "SALE" | "OTHER";
    id: string | number;
    summary: string;
  }[];
  created_by?: number | null;
  created_by_name?: string;
  updated_by?: number | null;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
};

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || "B"}`;
}

const CRM_BASE = "/api/crm";

function qs(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export async function fetchDocumentTypes(
  params?: Record<string, string | number | boolean>,
): Promise<DocumentTypeMaster[]> {
  return api<DocumentTypeMaster[]>(`${CRM_BASE}/document-types/${qs(params)}`);
}

export async function fetchDocuments(
  params?: Record<string, string | number | boolean>,
): Promise<VaultDocument[]> {
  return api<VaultDocument[]>(`${CRM_BASE}/documents/${qs(params)}`);
}

export async function fetchDocument(id: string | number): Promise<VaultDocument> {
  return api<VaultDocument>(`${CRM_BASE}/documents/${id}/`);
}

export async function createDocument(formData: FormData): Promise<VaultDocument> {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${CRM_BASE}/documents/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.message || data?.detail || "Upload failed", data);
  }
  return data as VaultDocument;
}

export async function replaceDocumentFile(
  id: string | number,
  formData: FormData,
): Promise<VaultDocument> {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${CRM_BASE}/documents/${id}/replace-file/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.message || data?.detail || "Replace file failed", data);
  }
  return data as VaultDocument;
}

export async function updateDocument(
  id: string | number,
  payload: Partial<VaultDocument>,
): Promise<VaultDocument> {
  return api<VaultDocument>(`${CRM_BASE}/documents/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteDocument(
  id: string | number,
  reason: string,
  confirmInUse = false,
): Promise<{ detail?: string; in_use_warning?: boolean; usage_count?: number; used_in?: any[] }> {
  const token = await getValidAccessToken();
  const res = await fetch(`${API_BASE}${CRM_BASE}/documents/${id}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason, confirm_in_use: confirmInUse }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.message || data?.reason || "Delete failed", data);
  }
  return data;
}

export async function attachDocument(
  id: string | number,
  payload: { shipment?: number; unit?: number; customer?: string; sale?: number; employee?: number },
): Promise<{ detail: string; attachment_id?: number }> {
  return api<{ detail: string; attachment_id?: number }>(`${CRM_BASE}/documents/${id}/attach/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function detachDocument(
  id: string | number,
  payload: { attachment_id?: number; shipment?: number; unit?: number; customer?: string; sale?: number; employee?: number },
): Promise<{ detail: string }> {
  return api<{ detail: string }>(`${CRM_BASE}/documents/${id}/detach/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function recordDocumentPrint(
  id: string | number,
  payload?: { notes?: string },
): Promise<{ detail: string }> {
  return api<{ detail: string }>(`${CRM_BASE}/documents/${id}/record_print/`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}
