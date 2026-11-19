import { Fragment, useEffect, useState } from "react";
import { Search, ChevronDown, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { StatusBadge } from "./Dashboard";
import { Pagination } from "./crm/ui";
import { useCrmMeta } from "./crm/useOptions";

type Enquiry = {
  id: number;
  name: string;
  company: string;
  phone: string;
  email: string;
  vehicle: string | null;
  enquiry_type: string;
  message: string;
  status: string;
  created_at: string;
  lead?: number | null;
  lead_display?: { id: number; name: string; status: string } | null;
};

type EnquiryPage = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: Enquiry[];
};

export default function EnquiriesManager({
  onNavigate,
}: {
  onNavigate?: (path: string) => void;
} = {}) {
  const meta = useCrmMeta();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search box so typing doesn't hammer the API.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page when filters change.
  useEffect(() => { setPage(0); }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page + 1), page_size: String(pageSize), exclude_type: "quote" });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("enquiry_type", typeFilter);
    api<EnquiryPage>(`/api/enquiries/?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setEnquiries(data.results ?? []);
        setTotal(data.count ?? 0);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, statusFilter, typeFilter, reloadKey]);

  const setStatus = async (e0: Enquiry, status: string) => {
    try {
      await api(`/api/enquiries/${e0.id}/`, { method: "PATCH", body: JSON.stringify({ status }) });
      setEnquiries((prev) => prev.map((e) => (e.id === e0.id ? { ...e, status } : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async (e0: Enquiry) => {
    if (!window.confirm(`Delete enquiry from ${e0.name}?`)) return;
    try {
      await api(`/api/enquiries/${e0.id}/`, { method: "DELETE" });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const select =
    "border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[12px] font-semibold text-[#04314A] focus:outline-none focus:border-[#00AAEB] cursor-pointer appearance-none";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[36px] font-black tracking-tight text-[#04314A]">Enquiries.</h1>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, company, email, phone…"
            className="w-full border border-[#E8E8E5] rounded-xl bg-white pl-10 pr-4 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors"
          />
        </div>
        {[
          { value: statusFilter, set: setStatusFilter, options: ["all", ...meta.enquiryStatuses], labels: ["All Statuses", ...meta.enquiryStatuses.map((s) => meta.enquiryStatusLabels[s] ?? s)] },
          { value: typeFilter, set: setTypeFilter, options: ["all", ...meta.enquiryTypes.filter((t) => t !== "quote")], labels: ["All Types", ...meta.enquiryTypes.filter((t) => t !== "quote").map((t) => meta.enquiryTypeLabels[t] ?? t)] },
        ].map((f, i) => (
          <div key={i} className="relative">
            <select
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className={`${select} pr-9 min-w-[150px]`}
            >
              {f.options.map((o, j) => (
                <option key={o} value={o}>{f.labels[j]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
          </div>
        ))}
        <span className="flex items-center px-2 text-[12px] font-semibold text-[#737373] whitespace-nowrap">
          {total} result{total === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {["Lead", "Type", "Vehicle", "Date", "Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td></tr>
              ) : enquiries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <Users size={22} className="mx-auto mb-3 text-[#B0B0AA]" />
                    <p className="text-[13px] text-[#737373]">No enquiries match your filters.</p>
                  </td>
                </tr>
              ) : (
                enquiries.map((e) => (
                  <Fragment key={e.id}>
                    <tr
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8] cursor-pointer"
                    >
                      <td className="px-5 py-3.5">
                        <div className="text-[13px] font-bold text-[#04314A]">{e.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {e.company && <span className="text-[11px] text-[#737373]">{e.company}</span>}
                          {e.lead_display && (
                            <a
                              href={`/dashboard/crm-leads/${e.lead_display.id}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (onNavigate && e.lead_display) {
                                  ev.preventDefault();
                                  onNavigate(`crm-leads/${e.lead_display.id}`);
                                }
                              }}
                              className="text-[11px] font-semibold text-[#00AAEB] hover:underline"
                            >
                              → Lead #{e.lead_display.id}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${e.enquiry_type === "test_drive" ? "text-[#00AAEB]" : "text-[#04314A]"}`}>
                          {meta.enquiryTypeLabels[e.enquiry_type] ?? e.enquiry_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#737373]">{e.vehicle ?? "-"}</td>
                      <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                        {new Date(e.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-3.5" onClick={(ev) => ev.stopPropagation()}>
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-5 py-3.5" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <select
                            value={e.status}
                            onChange={(ev) => setStatus(e, ev.target.value)}
                            className="border border-[#E8E8E5] rounded-xl bg-white px-2 py-1.5 text-[10px] font-bold tracking-[0.06em] uppercase text-[#04314A] focus:outline-none focus:border-[#00AAEB] cursor-pointer"
                          >
                            <option value="new">New</option>
                            <option value="in_progress">In Progress</option>
                            <option value="closed">Closed</option>
                          </select>
                          <button onClick={() => remove(e)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                    {expanded === e.id && (
                      <tr className="bg-[#FAFAF8] border-b border-[#F0F0ED]">
                        <td colSpan={6} className="px-5 py-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[900px]">
                            <div className="flex flex-col gap-2 text-[13px]">
                              <p><span className="font-semibold text-[#737373] text-[11px] tracking-[0.08em] uppercase block">Phone</span><a href={`tel:${e.phone}`} className="text-[#04314A] hover:text-[#00AAEB]">{e.phone}</a></p>
                              <p><span className="font-semibold text-[#737373] text-[11px] tracking-[0.08em] uppercase block">Email</span><a href={`mailto:${e.email}`} className="text-[#04314A] hover:text-[#00AAEB]">{e.email}</a></p>
                              {e.lead_display && (
                                <p className="pt-1">
                                  <span className="font-semibold text-[#737373] text-[11px] tracking-[0.08em] uppercase block">CRM Sales Pipeline</span>
                                  <a
                                    href={`/dashboard/crm-leads/${e.lead_display.id}`}
                                    onClick={(ev) => {
                                      if (onNavigate && e.lead_display) {
                                        ev.preventDefault();
                                        onNavigate(`crm-leads/${e.lead_display.id}`);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-[#04314A] text-white rounded-lg text-[11px] font-bold hover:bg-[#00AAEB] transition-colors"
                                  >
                                    Open Lead #{e.lead_display.id} ({e.lead_display.status}) in CRM →
                                  </a>
                                </p>
                              )}
                            </div>
                            <div>
                              <span className="font-semibold text-[#737373] text-[11px] tracking-[0.08em] uppercase block">Message</span>
                              <p className="text-[13px] text-[#04314A] leading-relaxed mt-1">{e.message || "-"}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
            )}
          </tbody>
        </table>
        </div>
        <Pagination
          page={page}
          pageCount={Math.ceil(total / pageSize) || 1}
          onPage={setPage}
          total={total}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>
    </div>
  );
}
