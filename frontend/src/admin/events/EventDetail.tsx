import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, Eye, X, Search, ChevronDown, Calendar, Users, Filter, Mail, Phone, Upload, Download, FileText } from "lucide-react";
import { api, ApiError, API_BASE, getValidAccessToken } from "@/lib/api";
import { Pagination } from "../crm/ui";
import type { Event, EventVisitor, InterestLevel, EventStats, BulkImportResult } from "@/lib/events";
import { fetchEvent, fetchVisitors, createVisitor, updateVisitor, deleteVisitor, fetchInterestLevels, deleteEvent, updateEvent, fetchEventStats, bulkImportVisitors } from "@/lib/events";
import type { Vehicle } from "@/lib/vehicles";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    upcoming: "rounded-full bg-[#00AAEB] text-white",
    ongoing: "rounded-full bg-[#04314A] text-white",
    completed: "rounded-full bg-[#F0F0ED] text-[#737373]",
  };
  return (
    <span className={`inline-block px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase ${styles[status] ?? styles.completed}`}>
      {status}
    </span>
  );
}

function interestBadge(level?: string | null) {
  const normalized = (level || "unknown").toLowerCase();
  const styles: Record<string, string> = {
    hot: "bg-[#E53935] text-white",
    warm: "bg-[#FB8C00] text-white",
    cold: "bg-[#039BE5] text-white",
    "normal inquiry": "bg-[#43A047] text-white",
  };
  const cls = styles[normalized] ?? "bg-[#F0F0ED] text-[#04314A]";
  return (
    <span className={`inline-block px-2.5 py-1 text-[9px] font-bold tracking-[0.08em] uppercase rounded-full ${cls}`}>
      {level || "—"}
    </span>
  );
}

function formatDate(d: string) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}
function formatDateTimeLocal(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function EditEventInline({ event, onClose, onSaved }: { event: Event; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: event.name, start_date: event.start_date, end_date: event.end_date });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB] transition-colors";
  const label = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name required");
    if (form.end_date < form.start_date) return setError("End date cannot be before start date.");
    setBusy(true);
    try {
      await updateEvent(event.id, form);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white w-full max-w-[520px] border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
          <h3 className="text-[14px] font-black tracking-[0.06em] uppercase text-[#04314A]">Edit Event</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5]"><X size={14} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={label}>Event Name *</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Start Date *</label><input type="date" className={input} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className={label}>End Date *</label><input type="date" className={input} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          {error && <p className="text-[12px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button type="submit" disabled={busy} className="flex-1 py-3 rounded-full bg-[#04314A] text-white text-[13px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50">{busy ? "Saving…" : "Save Changes"}</button>
          <button type="button" onClick={onClose} className="px-6 py-3 border border-[#E8E8E5] rounded-full bg-white text-[13px] font-semibold text-[#737373]">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// Visitor Form - reusable for create/edit
function VisitorForm({
  eventId,
  initial,
  onClose,
  onSaved,
}: {
  eventId: number;
  initial: EventVisitor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [interestLevels, setInterestLevels] = useState<InterestLevel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(initial?.photo_display || "");
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    company: initial?.company ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
    interest_level: initial?.interest_level ? String(initial.interest_level) : "",
    vehicle: initial?.vehicle ? String(initial.vehicle) : "",
    visited_at: initial?.visited_at ? new Date(initial.visited_at).toISOString().slice(0, 16) : "",
  });

  useEffect(() => {
    fetchInterestLevels().then((levels) => {
      setInterestLevels(levels.filter((l) => l.is_active));
      // default to Hot if creating and no selection
      if (!initial) {
        const hot = levels.find((l) => l.name.toLowerCase() === "hot" && l.is_active);
        if (hot) setForm((f) => ({ ...f, interest_level: String(hot.id) }));
        else if (levels[0]) setForm((f) => ({ ...f, interest_level: String(levels[0].id) }));
      } else if (initial?.interest_level && !levels.find((l) => String(l.id) === String(initial.interest_level))) {
        // if initial has inactive level, include it
        api<InterestLevel>(`/api/interest-levels/${initial.interest_level}/`).then((lvl) => {
          setInterestLevels((prev) => [...prev, lvl]);
        }).catch(() => {});
      }
    }).catch(() => {});
    api<Vehicle[]>("/api/vehicles/?all=1").then(setVehicles).catch(() => setVehicles([]));
  }, [initial]);

  const input =
    "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors";
  const labelCls = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";
  const selectCls = `${input} cursor-pointer appearance-none pr-9`;

  const handlePhoto = (f: File | null) => {
    if (f) {
      setPhotoFile(f);
      setPhotoPreview(URL.createObjectURL(f));
      setRemovePhoto(false);
    } else {
      setPhotoFile(null);
      setPhotoPreview("");
      setRemovePhoto(true);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    if (!form.name.trim()) {
      setFieldErrors({ name: "Name is required." });
      return;
    }
    setBusy(true);
    try {
      let visited: string | null = form.visited_at || null;
      if (visited && visited.length === 16) visited += ":00";

      const hasFile = !!photoFile;

      if (hasFile) {
        const fd = new FormData();
        fd.append("name", form.name.trim());
        if (form.phone) fd.append("phone", form.phone.trim());
        if (form.email) fd.append("email", form.email.trim());
        if (form.company) fd.append("company", form.company.trim());
        if (form.address) fd.append("address", form.address.trim());
        if (form.notes) fd.append("notes", form.notes.trim());
        if (form.interest_level) fd.append("interest_level", form.interest_level);
        if (form.vehicle) fd.append("vehicle", form.vehicle);
        if (visited) fd.append("visited_at", visited);
        fd.append("photo", photoFile as File);
        if (initial) {
          await updateVisitor(eventId, initial.id, fd);
        } else {
          await createVisitor(eventId, fd);
        }
      } else if (removePhoto && initial) {
        // Clear photo via JSON patch (photo: null) plus other fields
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          phone: form.phone.trim() || "",
          email: form.email.trim() || "",
          company: form.company.trim() || "",
          address: form.address.trim() || "",
          notes: form.notes.trim() || "",
        };
        if (visited) payload.visited_at = visited;
        if (form.interest_level) payload.interest_level = Number(form.interest_level);
        else payload.interest_level = null;
        if (form.vehicle) payload.vehicle = Number(form.vehicle);
        else payload.vehicle = null;
        // clear photo
        payload.photo = null;
        await api(`/api/events/${eventId}/visitors/${initial.id}/`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        // No file, use JSON for simplicity (supports clearing via null if needed)
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          phone: form.phone.trim() || "",
          email: form.email.trim() || "",
          company: form.company.trim() || "",
          address: form.address.trim() || "",
          notes: form.notes.trim() || "",
        };
        if (visited) payload.visited_at = visited;
        else if (!initial) {
          // omit on create so backend defaults to now
        } else {
          // omit on edit to keep existing value unless explicitly cleared?
          // If the field was cleared, leave it out to preserve existing date.
        }
        if (form.interest_level) payload.interest_level = Number(form.interest_level);
        if (form.vehicle) payload.vehicle = Number(form.vehicle);
        // For create without file, use FormData anyway to support backend defaults; but JSON also works for create
        if (initial) {
          await api(`/api/events/${eventId}/visitors/${initial.id}/`, { method: "PATCH", body: JSON.stringify(payload) });
        } else {
          // For create, we can use JSON as well - backend handles it
          // But createVisitor expects FormData; we replicate via api with JSON
          await api(`/api/events/${eventId}/visitors/`, { method: "POST", body: JSON.stringify(payload) });
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.detail && typeof err.detail === "object") {
        const detail = err.detail as Record<string, unknown>;
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(detail)) {
          fe[k] = Array.isArray(v) ? String(v[0]) : String(v);
        }
        setFieldErrors(fe);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-3">
      <form onSubmit={submit} className="bg-white w-full max-w-[680px] border border-[#E8E8E5] rounded-xl overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E8E5]">
          <h2 className="text-[16px] font-black tracking-tight text-[#04314A]">{initial ? "Edit Visitor" : "Add Visitor"}</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5]"><X size={15} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Photo */}
          <div>
            <label className={labelCls}>Visitor Photo</label>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 bg-[#F7F7F5] border border-[#E8E8E5] rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-[#B0B0AA]">No photo</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/*" className={input} onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
                {photoPreview && (
                  <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(""); setRemovePhoto(true); if (fileRef.current) fileRef.current.value = ""; }} className="text-[11px] font-semibold text-[#00AAEB] hover:text-[#04314A]">Remove image</button>
                )}
                <p className="text-[11px] text-[#B0B0AA]">Supported: JPG, PNG. Max 5MB (validated by server).</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name *</label>
              <input className={`${input} ${fieldErrors.name ? "border-[#00AAEB]" : ""}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ram Sharma" required />
              {fieldErrors.name && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.name}</p>}
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Your City, Your Country" />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input className={input} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="ABC Motors" />
              {fieldErrors.company && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.company}</p>}
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9800000000/9800000001" />
              {fieldErrors.phone && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ram@example.com" />
              {fieldErrors.email && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.email}</p>}
            </div>
            <div>
              <label className={labelCls}>Interest Level</label>
              <div className="relative">
                <select className={`${selectCls} ${fieldErrors.interest_level ? "border-[#00AAEB]" : ""}`} value={form.interest_level} onChange={(e) => setForm({ ...form, interest_level: e.target.value })}>
                  <option value="">Select…</option>
                  {interestLevels.map((lvl) => (
                    <option key={lvl.id} value={String(lvl.id)}>{lvl.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
              </div>
              {fieldErrors.interest_level && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.interest_level}</p>}
            </div>
            <div>
              <label className={labelCls}>Interested Vehicle Model</label>
              <div className="relative">
                <select className={selectCls} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                  <option value="">Select vehicle…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={String(v.id)}>{v.name}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
              </div>
              {fieldErrors.vehicle && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.vehicle}</p>}
            </div>
            <div>
              <label className={labelCls}>Visited At</label>
              <input type="datetime-local" className={`${input} ${fieldErrors.visited_at ? "border-[#00AAEB]" : ""}`} value={form.visited_at} onChange={(e) => setForm({ ...form, visited_at: e.target.value })} />
              {fieldErrors.visited_at && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.visited_at}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea className={`${input} min-h-[72px] resize-y`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes about this visitor…" rows={3} />
              {fieldErrors.notes && <p className="mt-1 text-[11px] text-[#00AAEB]">{fieldErrors.notes}</p>}
            </div>
          </div>
          {error && !Object.keys(fieldErrors).length && (
            <p className="text-[12px] font-medium text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>
          )}
          {fieldErrors.non_field_errors && <p className="text-[11px] text-[#00AAEB]">{fieldErrors.non_field_errors}</p>}
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button type="submit" disabled={busy} className="flex-1 py-3.5 rounded-full bg-[#04314A] text-white text-[13px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50">
            {busy ? "Saving…" : initial ? "Save Visitor" : "Add Visitor"}
          </button>
          <button type="button" onClick={onClose} className="px-8 py-3.5 border border-[#E8E8E5] rounded-full bg-white text-[13px] font-semibold text-[#737373]">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function VisitorDetailModal({ visitor, onClose, onEdit, onDelete }: { visitor: EventVisitor; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-[640px] border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E8E5]">
          <h3 className="text-[16px] font-black text-[#04314A]">Visitor Details</h3>
          <button onClick={onClose} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5]"><X size={14} /></button>
        </div>
        <div className="p-6">
          <div className="flex gap-4 mb-6">
            <div className="w-20 h-20 bg-[#F7F7F5] border border-[#E8E8E5] rounded-xl overflow-hidden flex items-center justify-center shrink-0">
              {visitor.photo_display ? <img src={visitor.photo_display} alt={visitor.name} className="w-full h-full object-cover" /> : <Users size={20} className="text-[#B0B0AA]" />}
            </div>
            <div>
              <div className="text-[18px] font-black text-[#04314A]">{visitor.name}</div>
              <div className="mt-1">{interestBadge(visitor.interest_level_detail?.name)}</div>
              <div className="text-[12px] text-[#737373] mt-1">{visitor.event_detail?.name}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Phone</span><span className="text-[#04314A] font-medium flex items-center gap-1"><Phone size={12} />{visitor.phone || "—"}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Email</span><span className="text-[#04314A] font-medium flex items-center gap-1"><Mail size={12} />{visitor.email || "—"}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Company</span><span className="text-[#04314A]">{visitor.company || "—"}</span></div>
            <div className="sm:col-span-2"><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Address</span><span className="text-[#04314A]">{visitor.address || "—"}</span></div>
            <div className="sm:col-span-2"><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Notes</span><span className="text-[#04314A] whitespace-pre-wrap">{visitor.notes || "—"}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Interested Vehicle</span><span className="text-[#04314A] font-semibold">{visitor.vehicle_detail?.name || "—"}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Visited At</span><span className="text-[#04314A]">{formatDateTimeLocal(visitor.visited_at)}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Created At</span><span className="text-[#737373] text-[12px]">{formatDateTimeLocal(visitor.created_at)}</span></div>
            <div><span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block">Updated At</span><span className="text-[#737373] text-[12px]">{formatDateTimeLocal(visitor.updated_at)}</span></div>
          </div>
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button onClick={onEdit} className="flex-1 py-2.5 rounded-full bg-[#04314A] text-white text-[12px] font-semibold flex items-center justify-center gap-2"><Pencil size={13} /> Edit</button>
          <button onClick={onDelete} className="px-6 py-2.5 border border-[#E8E8E5] rounded-full bg-white text-[12px] font-semibold text-[#00AAEB] flex items-center gap-2"><Trash2 size={13} /> Delete</button>
          <button onClick={onClose} className="px-6 py-2.5 border border-[#E8E8E5] rounded-full bg-white text-[12px] font-semibold text-[#737373]">Close</button>
        </div>
      </div>
    </div>
  );
}

function interestLevelColor(level?: string | null) {
  const normalized = (level || "").toLowerCase();
  const colors: Record<string, string> = {
    hot: "#E53935",
    warm: "#FB8C00",
    cold: "#039BE5",
    "normal inquiry": "#43A047",
  };
  return colors[normalized] ?? "#B0B0AA";
}

function BulkImportModal({
  eventId,
  interestLevels,
  vehicles,
  onClose,
  onImported,
}: {
  eventId: number;
  interestLevels: InterestLevel[];
  vehicles: Vehicle[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | null) => {
    setError("");
    setResult(null);
    setPreviewRows([]);
    if (!f) {
      setFile(null);
      return;
    }
    const okExt = /\.(csv|xlsx|xls)$/i.test(f.name);
    if (!okExt) {
      setError("Please choose a .csv file (or .xlsx).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File is too large (max 5MB).");
      return;
    }
    setFile(f);
    // quick CSV preview (first 6 lines)
    if (/\.csv$/i.test(f.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "").replace(/\r/g, "");
          const lines = text.split("\n").filter((l) => l.trim() !== "").slice(0, 6);
          setPreviewRows(lines.map((l) => l.split(",").map((c) => c.trim().slice(0, 32))));
        } catch {
          /* ignore preview errors */
        }
      };
      reader.readAsText(f);
    }
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    setError("");
    try {
      const token = await getValidAccessToken();
      const res = await fetch(`${API_BASE}/api/events/${eventId}/visitors/bulk-template/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "visitor-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      throw new Error("template endpoint unavailable");
    } catch {
      // fallback: generate template client-side
      const levelExample = interestLevels[0]?.name ?? "Hot";
      const header = "name,phone,email,company,address,notes,interest_level,vehicle,visited_at";
      const row1 = `Ram Sharma,9801234567/9812345678,ram@example.com,ABC Motors,"Your City, Your Country",,${levelExample},,2026-09-10 10:00`;
      const csv = [header, row1].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "visitor-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const upload = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await bulkImportVisitors(eventId, file);
      setResult(data);
      if (data.created > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-3">
      <div className="bg-white w-full max-w-[640px] border border-[#E8E8E5] rounded-xl overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E8E5]">
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-[#04314A]">Bulk Import Visitors</h2>
            <p className="text-[12px] text-[#737373] mt-0.5">Upload a CSV with columns: name*, phone (use / for 2 numbers), email, company, address, notes, interest_level, vehicle, visited_at (optional)</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5] shrink-0"><X size={15} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={downloadTemplate}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#04314A] hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors disabled:opacity-50"
            >
              <Download size={13} /> {downloading ? "Preparing…" : "Download CSV template"}
            </button>
            <span className="text-[11px] text-[#B0B0AA]">
              interest_level accepts {interestLevels.length > 0 ? interestLevels.map((l) => l.name).join(", ") : "Hot, Warm, Cold"} · vehicle accepts model name
            </span>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#E8E8E5] rounded-xl p-6 text-center cursor-pointer hover:border-[#00AAEB] transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <FileText size={22} className="mx-auto mb-2 text-[#B0B0AA]" />
            {file ? (
              <div>
                <p className="text-[13px] font-bold text-[#04314A]">{file.name}</p>
                <p className="text-[11px] text-[#737373] mt-0.5">{(file.size / 1024).toFixed(1)} KB · click to choose a different file</p>
              </div>
            ) : (
              <div>
                <p className="text-[13px] font-bold text-[#04314A]">Click to choose a CSV file</p>
                <p className="text-[11px] text-[#B0B0AA] mt-0.5">.csv (or .xlsx) · max 5MB · max 2000 rows</p>
              </div>
            )}
          </div>

          {previewRows.length > 0 && (
            <div className="border border-[#E8E8E5] rounded-xl overflow-hidden">
              <p className="px-4 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] bg-[#F7F7F5] border-b border-[#E8E8E5]">Preview (first {previewRows.length} lines)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[520px]">
                  <tbody>
                    {previewRows.map((cols, i) => (
                      <tr key={i} className={i === 0 ? "bg-[#04314A]/5 font-bold" : "border-t border-[#F0F0ED]"}>
                        {cols.map((c, j) => (
                          <td key={j} className="px-3 py-1.5 text-[11px] text-[#04314A] whitespace-nowrap max-w-[160px] truncate">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vehicles.length > 0 && (
            <p className="text-[11px] text-[#B0B0AA]">Available vehicles: {vehicles.slice(0, 8).map((v) => v.name).join(", ")}{vehicles.length > 8 ? ` +${vehicles.length - 8} more` : ""}</p>
          )}

          {error && <p className="text-[12px] font-medium text-[#E53935] bg-[#E53935]/5 border-l-2 border-[#E53935] px-3 py-2">{error}</p>}

          {result && (
            <div className="border border-[#E8E8E5] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F7F7F5] border-b border-[#E8E8E5] text-[12px] font-bold text-[#04314A]">
                Imported {result.created} of {result.total} row{result.total === 1 ? "" : "s"}
                {result.failed > 0 && <span className="text-[#E53935]"> · {result.failed} failed</span>}
              </div>
              {result.errors.length > 0 ? (
                <div className="max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#E8E8E5]">
                        <th className="px-4 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">Row</th>
                        <th className="px-4 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">Name</th>
                        <th className="px-4 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.slice(0, 50).map((e, i) => (
                        <tr key={i} className="border-b border-[#F0F0ED] last:border-0">
                          <td className="px-4 py-2 text-[12px] font-bold text-[#04314A]">{e.row}</td>
                          <td className="px-4 py-2 text-[12px] text-[#04314A]">{e.name || "—"}</td>
                          <td className="px-4 py-2 text-[11px] text-[#E53935]">{Object.entries(e.errors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.errors.length > 50 && <p className="px-4 py-2 text-[11px] text-[#B0B0AA]">Showing first 50 of {result.errors.length} errors.</p>}
                </div>
              ) : (
                <p className="px-4 py-3 text-[12px] text-[#43A047] font-semibold">All rows imported successfully.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button
            onClick={upload}
            disabled={busy || !file}
            className="flex-1 py-3.5 rounded-full bg-[#04314A] text-white text-[13px] font-semibold hover:bg-[#00AAEB] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Upload size={14} /> {busy ? "Importing…" : result ? "Import again" : "Import visitors"}
          </button>
          <button onClick={onClose} className="px-8 py-3.5 border border-[#E8E8E5] rounded-full bg-white text-[13px] font-semibold text-[#737373]">Close</button>
        </div>
      </div>
    </div>
  );
}

function StatBreakdownCard({ title, subtitle, rows, total }: { title: string; subtitle: string; rows: { id: number | null; name: string; count: number }[]; total: number }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[12px] font-black tracking-[0.08em] uppercase text-[#04314A]">{title}</h3>
          <p className="text-[11px] text-[#B0B0AA] mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[11px] font-bold text-[#737373] bg-[#F7F7F5] border border-[#E8E8E5] rounded-full px-3 py-1">{total} total</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-[#737373] py-2">No data yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const pct = row.count > 0 ? Math.max(Math.round((row.count / max) * 100), 4) : 0;
            const color = interestLevelColor(row.name);
            const share = total > 0 ? Math.round((row.count / total) * 100) : 0;
            return (
              <li key={`${row.id ?? "none"}-${row.name}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-[#04314A] truncate pr-3">{row.name}</span>
                  <span className="text-[12px] font-bold text-[#737373] shrink-0">{row.count} <span className="font-medium text-[#B0B0AA]">· {share}%</span></span>
                </div>
                <div className="h-1.5 bg-[#F0F0ED] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function EventDetail({ eventId, onNavigate }: { eventId: string; onNavigate: (p: string) => void }) {
  const [event, setEvent] = useState<Event | null>(null);
  const [visitors, setVisitors] = useState<EventVisitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [interestLevels, setInterestLevels] = useState<InterestLevel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showAddVisitor, setShowAddVisitor] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingVisitor, setEditingVisitor] = useState<EventVisitor | null>(null);
  const [viewingVisitor, setViewingVisitor] = useState<EventVisitor | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterInterest, setFilterInterest] = useState("all");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [stats, setStats] = useState<EventStats | null>(null);

  const loadEvent = () => {
    setLoading(true);
    fetchEvent(eventId).then(setEvent).catch((e) => setError(e instanceof Error ? e.message : "Event not found")).finally(() => setLoading(false));
  };
  const loadVisitors = () => {
    const filters: Record<string, string | number> = {};
    if (filterSearch.trim()) filters.search = filterSearch.trim();
    if (filterDate) filters.date = filterDate;
    if (filterInterest !== "all") filters.interest_level = filterInterest;
    if (filterVehicle !== "all") filters.vehicle = filterVehicle;
    filters.page = page;
    filters.page_size = pageSize;

    fetchVisitors(eventId, filters as any).then((data) => {
      if (Array.isArray(data)) {
        setVisitors(data);
        setTotalCount(data.length);
        setTotalPages(Math.ceil(data.length / pageSize) || 1);
      } else {
        setVisitors(data.results);
        setTotalCount(data.count);
        setTotalPages(data.total_pages);
      }
      // also refresh event visitor count
      if (event) {
        // fetch event to update count? visitors length is filtered, not total. So need total unfiltered count.
        // We'll fetch event separately on mount or after visitor change without filters
      }
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load visitors"));
  };

  const loadMeta = () => {
    fetchInterestLevels().then(setInterestLevels).catch(() => {});
    api<Vehicle[]>("/api/vehicles/?all=1").then(setVehicles).catch(() => {});
  };

  useEffect(() => {
    loadEvent();
    loadMeta();
  }, [eventId]);

  useEffect(() => {
    loadVisitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch, filterDate, filterInterest, filterVehicle, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterSearch, filterDate, filterInterest, filterVehicle]);

  // Also load total visitors count separately (unfiltered) for header
  const [totalVisitorsUnfiltered, setTotalVisitorsUnfiltered] = useState<number | null>(null);
  useEffect(() => {
    // refresh stats (vehicle + interest level counts) whenever visitors change
    fetchEventStats(eventId).then(setStats).catch(() => {});
    // fetch without filters but page 1
    fetchVisitors(eventId, { page: 1, page_size: 1 }).then((data) => {
      if (Array.isArray(data)) setTotalVisitorsUnfiltered(data.length);
      else setTotalVisitorsUnfiltered(data.count);
    }).catch(() => {});
    // also fetch event to get visitors_count (annotated)
    fetchEvent(eventId).then((ev) => setTotalVisitorsUnfiltered(ev.visitors_count)).catch(() => {});
  }, [visitors]);

  const handleDeleteEvent = async () => {
    if (!event) return;
    if (!window.confirm(`Delete Event?\n\nAre you sure you want to delete "${event.name}"?`)) return;
    try {
      await deleteEvent(event.id);
      onNavigate("events");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleDeleteVisitor = async (v: EventVisitor) => {
    if (!window.confirm(`Delete Visitor?\n\nAre you sure you want to remove this visitor from the event?`)) return;
    try {
      await deleteVisitor(eventId, v.id);
      setViewingVisitor(null);
      setEditingVisitor(null);
      loadVisitors();
      loadEvent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) return <div className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</div>;
  if (!event) return <div className="p-6"><p className="text-[13px] text-[#00AAEB]">{error || "Event not found"}</p><button onClick={() => onNavigate("events")} className="mt-4 text-[12px] font-semibold text-[#04314A]">← Back to Events</button></div>;

  const inputCls = "border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors w-full";
  const selectCls = `${inputCls} cursor-pointer appearance-none pr-9`;

  return (
    <div>
      {/* Header */}
      <button onClick={() => onNavigate("events")} className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#737373] hover:text-[#04314A] mb-4">
        <ArrowLeft size={14} /> Back to Events
      </button>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-6 sm:px-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h1 className="text-[24px] font-black tracking-tight text-[#04314A]">{event.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] text-[#737373]">
                <span className="inline-flex items-center gap-1.5"><Calendar size={13} />{formatDate(event.start_date)} — {formatDate(event.end_date)}</span>
                <span>{statusBadge(event.status)}</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#04314A]"><Users size={13} />{totalVisitorsUnfiltered ?? event.visitors_count ?? visitors.length} Visitors</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowEditEvent(true)} className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#04314A] hover:border-[#04314A] transition-colors"><Pencil size={13} /> Edit Event</button>
              <button onClick={() => setShowAddVisitor(true)} className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors"><Plus size={13} /> Add Visitor</button>
              <button onClick={() => setShowBulkImport(true)} className="inline-flex items-center gap-2 px-5 py-2 border border-[#04314A] rounded-full bg-white text-[#04314A] text-[12px] font-semibold hover:bg-[#04314A] hover:text-white transition-colors"><Upload size={13} /> Bulk Import</button>
              <button onClick={handleDeleteEvent} className="inline-flex items-center gap-2 px-4 py-2 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors"><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-[13px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>}

      {/* Stats: interest by vehicle + by level */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <StatBreakdownCard
            title="Interest by Vehicle"
            subtitle="Visitor count per interested vehicle model"
            rows={stats.by_vehicle}
            total={stats.total_visitors}
          />
          <StatBreakdownCard
            title="Interest by Level"
            subtitle="Visitor count per interest level"
            rows={stats.by_interest_level}
            total={stats.total_visitors}
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-black tracking-[0.08em] uppercase text-[#04314A]">Visitors</h3>
          <button onClick={() => setFilterDrawerOpen(!filterDrawerOpen)} className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E8E8E5] rounded-full text-[11px] font-semibold text-[#04314A]"><Filter size={12} /> Filters</button>
        </div>

        <div className={`${filterDrawerOpen ? "block" : "hidden"} lg:block`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            {/* Search */}
            <div className="lg:col-span-5 relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
              <input
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search visitors… (name, phone, email, notes)"
                className={`${inputCls} pl-9`}
              />
            </div>
            {/* Date - single exact date filter */}
            <div className="lg:col-span-2">
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={inputCls} title="Filter by date - visitors who arrived on this date" />
            </div>
            {/* Interest */}
            <div className="lg:col-span-2 relative">
              <select value={filterInterest} onChange={(e) => setFilterInterest(e.target.value)} className={selectCls}>
                <option value="all">All Interest</option>
                {interestLevels.map((lvl) => (
                  <option key={lvl.id} value={String(lvl.id)}>{lvl.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
            </div>
            <div className="lg:col-span-3 relative">
              <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} className={selectCls}>
                <option value="all">All Vehicles</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={String(v.id)}>{v.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { loadVisitors(); }}
              className="px-4 py-2 rounded-full bg-[#04314A] text-white text-[11px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00AAEB] transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={() => { setFilterSearch(""); setFilterDate(""); setFilterInterest("all"); setFilterVehicle("all"); setPage(1); }}
              className="px-4 py-2 border border-[#E8E8E5] rounded-full text-[11px] font-semibold tracking-[0.06em] uppercase text-[#737373] hover:border-[#04314A] hover:text-[#04314A] transition-colors"
            >
              Reset
            </button>
            <span className="ml-auto text-[11px] font-semibold text-[#737373] self-center">{totalCount} visitor{totalCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      {/* Visitor Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1320px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {["Photo", "Name", "Phone", "Email", "Company", "Address", "Notes", "Interest Level", "Interested Vehicle", "Arrival Date/Time", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visitors.length === 0 ? (
                <tr><td colSpan={11} className="px-5 py-14 text-center"><Users size={22} className="mx-auto mb-3 text-[#B0B0AA]" /><p className="text-[13px] text-[#737373]">No visitors match your filters.</p></td></tr>
              ) : (
                visitors.map((v) => (
                  <tr key={v.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#F7F7F5] border border-[#E8E8E5] flex items-center justify-center">
                        {v.photo_display ? <img src={v.photo_display} alt={v.name} className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold text-[#B0B0AA]">{v.name.slice(0, 1).toUpperCase()}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-bold text-[#04314A]">{v.name}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] whitespace-nowrap">{v.phone || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373]">{v.email || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] max-w-[140px] truncate" title={v.company || ""}>{v.company || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] max-w-[150px] truncate">{v.address || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] max-w-[180px] truncate" title={v.notes || ""}>{v.notes || "—"}</td>
                    <td className="px-4 py-3">{interestBadge(v.interest_level_detail?.name)}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] whitespace-nowrap">{v.vehicle_detail?.name || "—"}</td>
                    <td className="px-4 py-3 text-[12px] text-[#737373] whitespace-nowrap">{formatDateTimeLocal(v.visited_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setViewingVisitor(v)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors" title="View"><Eye size={13} /></button>
                        <button onClick={() => setEditingVisitor(v)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#04314A] hover:bg-[#04314A] hover:text-white transition-colors" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => handleDeleteVisitor(v)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page - 1} pageCount={totalPages} onPage={(p) => setPage(p + 1)} total={totalCount} />
      </div>

      {showEditEvent && <EditEventInline event={event} onClose={() => setShowEditEvent(false)} onSaved={() => loadEvent()} />}
      {showAddVisitor && <VisitorForm eventId={event.id} initial={null} onClose={() => setShowAddVisitor(false)} onSaved={() => { loadVisitors(); loadEvent(); }} />}
      {showBulkImport && (
        <BulkImportModal
          eventId={event.id}
          interestLevels={interestLevels}
          vehicles={vehicles}
          onClose={() => setShowBulkImport(false)}
          onImported={() => { loadVisitors(); loadEvent(); }}
        />
      )}
      {editingVisitor && <VisitorForm eventId={event.id} initial={editingVisitor} onClose={() => setEditingVisitor(null)} onSaved={() => { loadVisitors(); loadEvent(); }} />}
      {viewingVisitor && (
        <VisitorDetailModal
          visitor={viewingVisitor}
          onClose={() => setViewingVisitor(null)}
          onEdit={() => { setEditingVisitor(viewingVisitor); setViewingVisitor(null); }}
          onDelete={() => handleDeleteVisitor(viewingVisitor)}
        />
      )}
    </div>
  );
}
