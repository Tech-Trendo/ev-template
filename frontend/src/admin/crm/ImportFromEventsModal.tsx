import { useCallback, useEffect, useState } from "react";
import { Search, ChevronDown, ChevronLeft, CheckSquare, Square, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import {
  fetchEvents,
  fetchInterestLevels,
  fetchVisitors,
  type Event,
  type EventVisitor,
  type InterestLevel,
} from "@/lib/events";
import type { Vehicle } from "@/lib/vehicles";
import { crm } from "./data";
import { Modal, Pagination, ghostBtnCls, primaryBtnCls, selectCls } from "./ui";

const PAGE_SIZE = 10;

type VisitorsPage = {
  results: EventVisitor[];
  count: number;
  page: number;
  total_pages: number;
};

export default function ImportFromEventsModal({
  onClose,
  onImported,
  onMetaRefresh,
}: {
  onClose: () => void;
  onImported: (msg: string) => void;
  onMetaRefresh?: () => void;
}) {
  // Step 1: events
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsSearch, setEventsSearch] = useState("");
  const [eventId, setEventId] = useState<number | null>(null);
  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  // Step 2: visitors (server-side filters + pagination)
  const [interestLevels, setInterestLevels] = useState<InterestLevel[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState("");
  const [interestF, setInterestF] = useState("all");
  const [vehicleF, setVehicleF] = useState("all");
  const [dateF, setDateF] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VisitorsPage>({ results: [], count: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Selection: manual ids + "select all matching on server"
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const [importing, setImporting] = useState<"selected" | "all" | null>(null);
  const [result, setResult] = useState<{
    created: number;
    total: number;
    skipped_count: number;
    failed: number;
    skipped: { visitor_id: number; name: string; reason: string }[];
    errors: { visitor_id?: number; name?: string; error?: string }[];
  } | null>(null);

  const loadEvents = useCallback(() => {
    setEventsLoading(true);
    fetchEvents(eventsSearch.trim() || undefined)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [eventsSearch]);

  useEffect(() => {
    const t = setTimeout(loadEvents, 300);
    return () => clearTimeout(t);
  }, [loadEvents]);

  useEffect(() => {
    fetchInterestLevels().then((l) => setInterestLevels(l.filter((x) => x.is_active))).catch(() => {});
    api<Vehicle[]>("/api/vehicles/?all=1").then(setVehicles).catch(() => setVehicles([]));
  }, []);

  const loadVisitors = useCallback(() => {
    if (eventId == null) return;
    setLoading(true);
    setError("");
    fetchVisitors(eventId, {
      search: search.trim() || undefined,
      interest_level: interestF === "all" ? undefined : interestF,
      vehicle: vehicleF === "all" ? undefined : vehicleF,
      date: dateF || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        if (Array.isArray(res)) {
          setData({ results: res, count: res.length, page: 1, total_pages: 1 });
        } else {
          setData({ results: res.results, count: res.count, page: res.page, total_pages: res.total_pages });
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load visitors"))
      .finally(() => setLoading(false));
  }, [eventId, search, interestF, vehicleF, dateF, page]);

  useEffect(() => {
    if (eventId == null) return;
    const t = setTimeout(loadVisitors, 300);
    return () => clearTimeout(t);
  }, [loadVisitors, eventId]);

  // Reset page + selection when filters change (but not on plain page change)
  const onFilterChange = (apply: () => void) => {
    apply();
    setPage(1);
    setSelected(new Set());
    setSelectAllMatching(false);
    setResult(null);
  };

  const pickEvent = (id: number) => {
    setEventId(id);
    setSearch("");
    setInterestF("all");
    setVehicleF("all");
    setDateF("");
    setPage(1);
    setSelected(new Set());
    setSelectAllMatching(false);
    setResult(null);
    setError("");
  };

  const toggleOne = (id: number) => {
    setSelectAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = data.results.map((v) => v.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setSelectAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const filtersPayload = {
    search: search.trim(),
    interestLevel: interestF === "all" ? "" : interestF,
    vehicle: vehicleF === "all" ? "" : vehicleF,
    date: dateF,
  };

  const doImport = async (mode: "selected" | "all") => {
    if (eventId == null) return;
    if (mode === "selected" && !selectAllMatching && selected.size === 0) return;
    setImporting(mode);
    setError("");
    setResult(null);
    try {
      const res = await crm.importFromEvent(
        mode === "all" || selectAllMatching
          ? { eventId, selectAll: true, ...filtersPayload }
          : { eventId, visitorIds: [...selected], selectAll: false },
      );
      setResult({
        created: res.created,
        total: res.total,
        skipped_count: res.skipped_count,
        failed: res.failed,
        skipped: res.skipped,
        errors: res.errors,
      });
      if (res.created > 0) {
        onImported(`Imported ${res.created} lead${res.created === 1 ? "" : "s"} from ${res.event.name}.`);
        onMetaRefresh?.();
        setSelected(new Set());
        setSelectAllMatching(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

  const selectedCount = selectAllMatching ? data.count : selected.size;

  return (
    <Modal title="Import Leads from Events" onClose={onClose} wide>
      {eventId == null ? (
        <div>
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
            <input
              value={eventsSearch}
              onChange={(e) => setEventsSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full pl-10 pr-4 py-2.5 text-[13px] font-medium focus:outline-none focus:border-[#00AAEB] transition-colors border border-[#E8E8E5] rounded-xl bg-white text-[#04314A] placeholder:text-[#B0B0AA]"
            />
          </div>
          {eventsLoading ? (
            <p className="py-10 text-center text-[13px] text-[#737373]">Loading events…</p>
          ) : events.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[#737373]">No events found.</p>
          ) : (
            <ul className="border border-[#E8E8E5] rounded-xl overflow-hidden divide-y divide-[#F0F0ED]">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => pickEvent(e.id)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[#FAFAF8] transition-colors"
                  >
                    <span>
                      <span className="block text-[13px] font-bold text-[#04314A]">{e.name}</span>
                      <span className="block text-[11px] text-[#737373] mt-0.5">
                        {e.start_date} → {e.end_date} · {e.visitors_count} visitor{e.visitors_count === 1 ? "" : "s"} · {e.status}
                      </span>
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#00AAEB]">Select →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <button
            onClick={() => {
              setEventId(null);
              setSelected(new Set());
              setSelectAllMatching(false);
              setResult(null);
              setError("");
            }}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#04314A] mb-4"
          >
            <ChevronLeft size={14} /> All events
          </button>
          <h3 className="text-[15px] font-black text-[#04314A]">
            {selectedEvent?.name ?? `Event #${eventId}`}
            <span className="ml-2 text-[11px] font-semibold text-[#737373]">
              {data.count} visitor{data.count === 1 ? "" : "s"}
              {search || interestF !== "all" || vehicleF !== "all" || dateF ? " matching filters" : ""}
            </span>
          </h3>

          {/* Filters — server-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 mb-3">
            <div className="relative lg:col-span-2">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
              <input
                value={search}
                onChange={(e) => onFilterChange(() => setSearch(e.target.value))}
                placeholder="Search name, phone, email, company…"
                className="w-full pl-10 pr-4 py-2.5 text-[13px] font-medium focus:outline-none focus:border-[#00AAEB] transition-colors border border-[#E8E8E5] rounded-xl bg-white text-[#04314A] placeholder:text-[#B0B0AA]"
              />
            </div>
            <div className="relative">
              <select value={interestF} onChange={(e) => onFilterChange(() => setInterestF(e.target.value))} className={selectCls}>
                <option value="all">All Interest</option>
                {interestLevels.map((l) => (
                  <option key={l.id} value={String(l.id)}>{l.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
            </div>
            <div className="relative">
              <select value={vehicleF} onChange={(e) => onFilterChange(() => setVehicleF(e.target.value))} className={selectCls}>
                <option value="all">All Vehicles</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={String(v.id)}>{v.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="date"
              value={dateF}
              onChange={(e) => onFilterChange(() => setDateF(e.target.value))}
              title="Filter by visit date"
              className={selectCls}
            />
            {(search || interestF !== "all" || vehicleF !== "all" || dateF) && (
              <button
                onClick={() => onFilterChange(() => {
                  setSearch("");
                  setInterestF("all");
                  setVehicleF("all");
                  setDateF("");
                })}
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#00AAEB] hover:text-[#04314A]"
              >
                Clear filters
              </button>
            )}
            <span className="ml-auto text-[11px] font-semibold text-[#737373]">
              {selectedCount > 0 ? `${selectedCount} selected` : "None selected"}
            </span>
          </div>

          {/* Select-all banner (server-side, not just this page) */}
          {!selectAllMatching && data.count > 0 && (
            <button
              onClick={() => setSelectAllMatching(true)}
              className="mb-3 w-full px-4 py-2.5 rounded-xl bg-[#00AAEB]/5 border border-[#00AAEB]/30 text-[12px] font-semibold text-[#04314A] hover:bg-[#00AAEB]/10 transition-colors"
            >
              Select all {data.count} visitor{data.count === 1 ? "" : "s"} matching current filters (across all pages)
            </button>
          )}
          {selectAllMatching && (
            <div className="mb-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#04314A] text-white text-[12px] font-semibold">
              <span>All {data.count} matching visitors selected</span>
              <button onClick={() => { setSelectAllMatching(false); setSelected(new Set()); }} className="inline-flex items-center gap-1 text-white/80 hover:text-white">
                <X size={13} /> Clear
              </button>
            </div>
          )}

          <div className="border border-[#E8E8E5] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[720px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                    <th className="px-4 py-3 w-10">
                      <button onClick={togglePage} aria-label="Select page" className="text-[#04314A]">
                        {selectAllMatching || allPageSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </th>
                    {["Name", "Phone", "Company", "Interest", "Vehicle"].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px] text-[#737373]">Loading visitors…</td></tr>
                  ) : error && data.results.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px] text-[#00AAEB]">{error}</td></tr>
                  ) : data.results.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px] text-[#737373]">No visitors match your filters.</td></tr>
                  ) : (
                    data.results.map((v) => {
                      const checked = selectAllMatching || selected.has(v.id);
                      return (
                        <tr key={v.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                          <td className="px-4 py-3">
                            <button onClick={() => toggleOne(v.id)} aria-label={`Select ${v.name}`} className="text-[#04314A]">
                              {checked ? <CheckSquare size={16} className="text-[#00AAEB]" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-[13px] font-bold text-[#04314A]">{v.name}</td>
                          <td className="px-4 py-3 text-[12px] text-[#737373] whitespace-nowrap">{v.phone || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[#737373] max-w-[140px] truncate">{v.company || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[#737373]">{v.interest_level_detail?.name || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[#737373]">{v.vehicle_detail?.name || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page - 1} pageCount={Math.max(1, data.total_pages)} onPage={(p) => setPage(p + 1)} total={data.count} />
          </div>

          {error && data.results.length > 0 && (
            <p className="mt-3 text-[12px] font-medium text-[#00AAEB]">{error}</p>
          )}

          {result && (
            <div className="mt-4 border border-[#E8E8E5] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F7F7F5] border-b border-[#E8E8E5] text-[12px] font-bold text-[#04314A]">
                Imported {result.created} of {result.total}
                {result.skipped_count > 0 && <span className="text-[#737373]"> · {result.skipped_count} skipped (already leads)</span>}
                {result.failed > 0 && <span className="text-[#00AAEB]"> · {result.failed} failed</span>}
              </div>
              {(result.skipped.length > 0 || result.errors.length > 0) && (
                <ul className="max-h-[160px] overflow-y-auto divide-y divide-[#F0F0ED]">
                  {result.skipped.slice(0, 20).map((s) => (
                    <li key={`s-${s.visitor_id}`} className="px-4 py-2 text-[12px] text-[#737373]">
                      {s.name} — {s.reason}
                    </li>
                  ))}
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={`e-${i}`} className="px-4 py-2 text-[12px] text-[#00AAEB]">
                      {e.name || `Visitor ${e.visitor_id}`} — {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div data-modal-actions className="mt-5 flex flex-wrap justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors">
              Close
            </button>
            <button
              onClick={() => doImport("all")}
              disabled={importing != null || data.count === 0}
              className={ghostBtnCls}
            >
              <Upload size={14} /> {importing === "all" ? "Importing…" : `Import all ${data.count > 0 ? `(${data.count})` : ""}`}
            </button>
            <button
              onClick={() => doImport("selected")}
              disabled={importing != null || selectedCount === 0}
              className={primaryBtnCls}
            >
              {importing === "selected" ? "Importing…" : `Import selected (${selectedCount})`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
