import { api } from "./api";

// Event types
export type Event = {
  id: number;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  status: "upcoming" | "ongoing" | "completed";
  visitors_count: number;
  visitors?: unknown[];
  created_at: string;
  updated_at: string;
};

export type InterestLevel = {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EventStats = {
  total_visitors: number;
  by_interest_level: { id: number | null; name: string; count: number }[];
  by_vehicle: { id: number | null; name: string; count: number }[];
};

export type EventVisitor = {
  id: number;
  event: number;
  event_detail?: { id: number; name: string };
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  notes: string;
  remarks: string;
  interest_level: number | null;
  interest_level_detail?: InterestLevel | null;
  vehicle: number | null;
  vehicle_detail?: { id: number; name: string; slug: string } | null;
  photo: string | null;
  photo_display: string;
  visited_at: string | null;
  created_at: string;
  updated_at: string;
};

// Helpers for derived status
export function deriveStatus(start: string, end: string): "upcoming" | "ongoing" | "completed" {
  const today = new Date().toISOString().slice(0, 10);
  if (today < start) return "upcoming";
  if (today > end) return "completed";
  return "ongoing";
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

// API helpers
export async function fetchEvents(search?: string): Promise<Event[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  const data = await api<Event[] | { results: Event[] }>(`/api/events/${q}`);
  if (Array.isArray(data)) return data;
  // if paginated (future)
  if (data && typeof data === "object" && "results" in data) return (data as { results: Event[] }).results;
  return [];
}

export async function fetchEvent(id: number | string): Promise<Event> {
  return api<Event>(`/api/events/${id}/`);
}

export async function fetchEventStats(id: number | string): Promise<EventStats> {
  return api<EventStats>(`/api/events/${id}/stats/`);
}

export async function createEvent(payload: { name: string; start_date: string; end_date: string }): Promise<Event> {
  return api<Event>("/api/events/", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateEvent(id: number | string, payload: Partial<{ name: string; start_date: string; end_date: string }>): Promise<Event> {
  return api<Event>(`/api/events/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteEvent(id: number | string): Promise<void> {
  return api<void>(`/api/events/${id}/`, { method: "DELETE" });
}

export async function fetchInterestLevels(params?: { is_active?: boolean; all?: boolean }): Promise<InterestLevel[]> {
  let q = "";
  if (params?.is_active !== undefined) q += `?is_active=${params.is_active ? "true" : "false"}`;
  const data = await api<InterestLevel[] | { results: InterestLevel[] }>(`/api/interest-levels/${q}`);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "results" in data) return (data as { results: InterestLevel[] }).results;
  return [];
}

export async function createInterestLevel(payload: { name: string; is_active?: boolean }): Promise<InterestLevel> {
  return api<InterestLevel>("/api/interest-levels/", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateInterestLevel(id: number, payload: Partial<InterestLevel>): Promise<InterestLevel> {
  return api<InterestLevel>(`/api/interest-levels/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteInterestLevel(id: number): Promise<void> {
  return api<void>(`/api/interest-levels/${id}/`, { method: "DELETE" });
}

// Visitors
export type VisitorFilters = {
  search?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  interest_level?: string | number;
  vehicle?: string | number;
  page?: number;
  page_size?: number;
};

export async function fetchVisitors(eventId: number | string, filters: VisitorFilters = {}): Promise<EventVisitor[] | { results: EventVisitor[]; count: number; page: number; total_pages: number }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.date) params.set("date", filters.date);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.interest_level !== undefined && filters.interest_level !== "" && filters.interest_level !== "all") params.set("interest_level", String(filters.interest_level));
  if (filters.vehicle !== undefined && filters.vehicle !== "" && filters.vehicle !== "all") params.set("vehicle", String(filters.vehicle));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.page_size) params.set("page_size", String(filters.page_size));
  const q = params.toString() ? `?${params.toString()}` : "";
  const data = await api<EventVisitor[] | { results: EventVisitor[]; count: number; page: number; total_pages: number }>(`/api/events/${eventId}/visitors/${q}`);
  return data;
}

export async function fetchVisitor(eventId: number | string, visitorId: number | string): Promise<EventVisitor> {
  return api<EventVisitor>(`/api/events/${eventId}/visitors/${visitorId}/`);
}

export async function createVisitor(eventId: number | string, formData: FormData): Promise<EventVisitor> {
  return api<EventVisitor>(`/api/events/${eventId}/visitors/`, { method: "POST", body: formData });
}

export async function updateVisitor(eventId: number | string, visitorId: number | string, formData: FormData | string): Promise<EventVisitor> {
  return api<EventVisitor>(`/api/events/${eventId}/visitors/${visitorId}/`, { method: "PATCH", body: formData as BodyInit });
}

export async function deleteVisitor(eventId: number | string, visitorId: number | string): Promise<void> {
  return api<void>(`/api/events/${eventId}/visitors/${visitorId}/`, { method: "DELETE" });
}

export type BulkImportError = { row: number; name: string; errors: Record<string, string> };
export type BulkImportResult = { total: number; created: number; failed: number; errors: BulkImportError[] };

export async function bulkImportVisitors(eventId: number | string, file: File): Promise<BulkImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  return api<BulkImportResult>(`/api/events/${eventId}/visitors/bulk-import/`, { method: "POST", body: fd });
}

export function bulkTemplateUrl(eventId: number | string): string {
  // Direct download needs auth header, so prefer fetch+blob; this helper builds the path.
  return `/api/events/${eventId}/visitors/bulk-template/`;
}
