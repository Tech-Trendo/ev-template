import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, Calendar, Users, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Pagination } from "../crm/ui";
import type { Event } from "@/lib/events";
import { fetchEvents, deleteEvent, createEvent, updateEvent } from "@/lib/events";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    upcoming: "rounded-full bg-[#10B981] text-white",
    ongoing: "rounded-full bg-[#0B3D2B] text-white",
    completed: "rounded-full bg-[#F0F0ED] text-[#737373]",
  };
  return (
    <span className={`inline-block px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase ${styles[status] ?? styles.completed}`}>
      {status}
    </span>
  );
}

function formatDateShort(d: string) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function EventForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Event | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: initial?.end_date ?? new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const input =
    "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";
  const label = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    if (!form.name.trim()) {
      setFieldErrors({ name: "Event name cannot be empty." });
      return;
    }
    if (!form.start_date || !form.end_date) {
      setFieldErrors({ dates: "Start and end dates are required." });
      return;
    }
    if (form.end_date < form.start_date) {
      setFieldErrors({ end_date: "End date cannot be before start date." });
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await updateEvent(initial.id, { name: form.name.trim(), start_date: form.start_date, end_date: form.end_date });
      } else {
        await createEvent({ name: form.name.trim(), start_date: form.start_date, end_date: form.end_date });
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="bg-white w-full max-w-[560px] border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E8E5]">
          <h2 className="text-[18px] font-black tracking-tight text-[#0B3D2B]">{initial ? "Edit Event" : "Create Event"}</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5] transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={label}>Event Name *</label>
            <input
              className={`${input} ${fieldErrors.name ? "border-[#10B981]" : ""}`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="VT EV Experience Kathmandu"
              required
            />
            {fieldErrors.name && <p className="mt-1 text-[11px] text-[#10B981]">{fieldErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Start Date *</label>
              <input
                type="date"
                className={`${input} ${fieldErrors.start_date ? "border-[#10B981]" : ""}`}
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
              {fieldErrors.start_date && <p className="mt-1 text-[11px] text-[#10B981]">{fieldErrors.start_date}</p>}
            </div>
            <div>
              <label className={label}>End Date *</label>
              <input
                type="date"
                className={`${input} ${fieldErrors.end_date ? "border-[#10B981]" : ""}`}
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                required
              />
              {fieldErrors.end_date && <p className="mt-1 text-[11px] text-[#10B981]">{fieldErrors.end_date}</p>}
            </div>
          </div>
          {fieldErrors.dates && <p className="text-[11px] text-[#10B981]">{fieldErrors.dates}</p>}
          {fieldErrors.non_field_errors && <p className="text-[11px] text-[#10B981]">{fieldErrors.non_field_errors}</p>}
          {error && !Object.keys(fieldErrors).length && (
            <p className="text-[12px] font-medium text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button type="submit" disabled={busy} className="flex-1 py-3.5 rounded-full bg-[#0B3D2B] text-white text-[13px] font-semibold tracking-[0.06em] hover:bg-[#10B981] transition-colors disabled:opacity-50">
            {busy ? "Saving…" : initial ? "Save Changes" : "Create Event"}
          </button>
          <button type="button" onClick={onClose} className="px-8 py-3.5 border border-[#E8E8E5] rounded-full bg-white text-[13px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const EVENTS_PER_PAGE = 10;

export default function EventsManager({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [page, setPage] = useState(0);

  const load = () => {
    setLoading(true);
    setError("");
    fetchEvents()
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (ev: Event) => {
    if (!window.confirm(`Delete Event?\n\nAre you sure you want to delete "${ev.name}"?`)) return;
    try {
      await deleteEvent(ev.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const pageCount = Math.ceil(events.length / EVENTS_PER_PAGE);
  const paginatedEvents = events.slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE);

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-black tracking-tight text-[#0B3D2B]">Events.</h1>
          <p className="text-[13px] text-[#737373] mt-1">Manage events and track visitors across all VT experiences.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors">
          <Plus size={14} /> Create Event
        </button>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[920px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {["Event Name", "Start Date", "End Date", "Visitors", "Status", "Created At", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-14 text-center"><Calendar size={22} className="mx-auto mb-3 text-[#B0B0AA]" /><p className="text-[13px] text-[#737373]">No events yet. Create your first event.</p></td></tr>
              ) : (
                paginatedEvents.map((ev) => (
                <tr key={ev.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5">
                    <button onClick={() => onNavigate(`events/${ev.id}`)} className="text-[13px] font-bold text-[#0B3D2B] hover:text-[#10B981] text-left">
                      {ev.name}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDateShort(ev.start_date)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDateShort(ev.end_date)}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0B3D2B]"><Users size={13} className="text-[#B0B0AA]" />{ev.visitors_count ?? 0}</span>
                  </td>
                  <td className="px-5 py-3.5">{statusBadge(ev.status)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDateShort(ev.created_at.slice(0, 10))}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => onNavigate(`events/${ev.id}`)} title="View" className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"><Eye size={13} /></button>
                      <button onClick={() => setEditing(ev)} title="Edit" className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => remove(ev)} title="Delete" className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"><Trash2 size={13} /></button>
                      <button onClick={() => onNavigate(`events/${ev.id}`)} title="Add Visitor" className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E8E8E5] rounded-full text-[11px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors">
                        <Plus size={12} /> Visitor
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onPage={setPage} total={events.length} />
      </div>

      {(creating || editing) && (
        <EventForm
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
