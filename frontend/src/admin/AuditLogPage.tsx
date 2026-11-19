"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  ArrowRight,
  RefreshCw,
  Globe,
} from "lucide-react";
import { api } from "@/lib/api";
import { DEFAULT_PAGE_SIZE, isPagedResponse } from "@/lib/pagination";
import { AuditLogEntry } from "./components/AuditHistoryModal";
import { LazySelect } from "./components/pickers/LazySelect";
import { Pagination } from "./crm/ui";

type StaffOption = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email?: string;
  is_active?: boolean;
};

function staffLabel(user: StaffOption) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name ? `${name} (@${user.username})` : user.username;
}

export default function AuditLogPage({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modelFilter, setModelFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState<number | null>(null);
  const [staffSelected, setStaffSelected] = useState<StaffOption | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchStaffPage = useCallback(async (_query: string, pageNum: number, size: number) => {
    const params = new URLSearchParams();
    params.set("page", String(pageNum));
    params.set("page_size", String(size));

    const res = await api<{
      results?: StaffOption[];
      total_pages?: number;
      count?: number;
    } | StaffOption[]>(`/api/users/?${params.toString()}`);

    if (Array.isArray(res)) {
      return { results: res, totalPages: 1, count: res.length };
    }
    return {
      results: res.results || [],
      totalPages: res.total_pages || 1,
      count: res.count ?? (res.results ? res.results.length : 0),
    };
  }, []);

  const fetchStaffById = useCallback(async (id: string | number) => {
    try {
      return await api<StaffOption>(`/api/users/${id}/`);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [modelFilter, actionFilter, sourceFilter, staffFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (modelFilter) params.set("model", modelFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (staffFilter) params.set("user", String(staffFilter));
    if (searchQuery) params.set("search", searchQuery);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("page", String(page + 1));
    params.set("page_size", String(pageSize));

    api<{ count: number; results: AuditLogEntry[] } | AuditLogEntry[]>(
      `/api/audit-logs/?${params.toString()}`,
    )
      .then((res) => {
        if (cancelled) return;
        if (isPagedResponse<AuditLogEntry>(res)) {
          setLogs(res.results);
          setTotal(res.count);
        } else if (Array.isArray(res)) {
          setLogs(res);
          setTotal(res.length);
        } else {
          setLogs([]);
          setTotal(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLogs([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    modelFilter,
    actionFilter,
    sourceFilter,
    staffFilter,
    searchQuery,
    dateFrom,
    dateTo,
    page,
    pageSize,
    reloadKey,
  ]);

  const handleEntityClick = (model: string, objectId: string) => {
    const m = (model || "").toLowerCase();
    if (m === "customer") {
      onNavigate(`crm-customers/${objectId}`);
    } else if (m === "vehicleunit" || m === "unit") {
      onNavigate(`units/${objectId}`);
    } else if (m === "quotation") {
      onNavigate(`crm-quotations/${objectId}`);
    } else if (m === "lead") {
      onNavigate(`crm-leads/${objectId}`);
    } else if (m === "servicerecord") {
      onNavigate(`servicing?view=${objectId}`);
    } else if (m === "sale") {
      onNavigate(`crm-sales`);
    } else if (m === "dealer") {
      onNavigate("dealers");
    } else if (m === "user") {
      onNavigate("users");
    }
  };

  const getActionBadgeClass = (action: string | undefined) => {
    switch (action?.toUpperCase()) {
      case "CREATE":
        return "bg-[#04314A] text-white";
      case "UPDATE":
        return "bg-[#FAFAF8] text-[#04314A] border border-[#E8E8E5]";
      case "DELETE":
        return "bg-[#DC2626] text-white";
      case "LOGIN":
        return "bg-[#00AAEB] text-white";
      case "LOGOUT":
        return "bg-[#737373] text-white";
      default:
        return "bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5]";
    }
  };

  const pageCount = Math.ceil(total / pageSize) || 1;
  const staffActivityLabel =
    staffSelected && !loading
      ? `${total.toLocaleString()} ${total === 1 ? "activity" : "activities"} by ${staffLabel(staffSelected)}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#04314A]">Staff Activity & Audit Trail</h1>
          <p className="text-[13px] text-[#737373]">
            Tamper-evident log of staff logins, logouts, record creations, field-level corrections, and deletions.
          </p>
        </div>
        <button
          onClick={() => setReloadKey((key) => key + 1)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#04314A] hover:bg-[#FAFAF8] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search summary, field, value, user, object ID..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E8E8E5] text-[12px] text-[#04314A] placeholder-[#737373] focus:outline-none focus:border-[#00AAEB]"
          />
        </div>

        <div className="min-w-[220px] w-[240px]">
          <LazySelect<StaffOption>
            value={staffFilter}
            onChange={(id, item) => {
              setStaffFilter(id !== null ? Number(id) : null);
              setStaffSelected(item);
            }}
            fetchPage={fetchStaffPage}
            fetchById={fetchStaffById}
            getItemId={(user) => user.id}
            getItemLabel={staffLabel}
            placeholder="All staff"
            hideSearch
            compact
            allowClear
            pageSize={10}
            emptyMessage="No staff accounts found."
            renderItem={(user) => (
              <div className="min-w-0">
                <span className="block text-[12px] font-medium text-[#04314A] truncate">
                  {[user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username}
                </span>
                <span className="block text-[10px] text-[#737373] truncate">@{user.username}</span>
              </div>
            )}
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E8E8E5] bg-white text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
        >
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="LOGOUT">Logout</option>
          <option value="CREATE">Create</option>
          <option value="UPDATE">Update</option>
          <option value="DELETE">Delete</option>
        </select>

        <select
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E8E8E5] bg-white text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
        >
          <option value="">All Models</option>
          <option value="customer">Customer</option>
          <option value="lead">Lead</option>
          <option value="quotation">Quotation</option>
          <option value="vehicleunit">Vehicle Unit</option>
          <option value="sale">Sale</option>
          <option value="servicerecord">Service Record</option>
          <option value="dealer">Dealer</option>
          <option value="user">User Account</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#E8E8E5] bg-white text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
        >
          <option value="">All Sources</option>
          <option value="STAFF_ACTIVITY">Staff Activity</option>
          <option value="AUTH">Authentication</option>
          <option value="SERVICING">Servicing Desk</option>
          <option value="SALE_EDIT">Sale Edit</option>
          <option value="SALE_CANCEL">Sale Cancel</option>
          <option value="REGISTRATION_CHANGE">Registration Change</option>
        </select>

        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-[#737373]">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 px-2 rounded-lg border border-[#E8E8E5] bg-white text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-[#737373]">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 px-2 rounded-lg border border-[#E8E8E5] bg-white text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
          />
        </div>
      </div>

      {staffActivityLabel ? (
        <div className="rounded-xl border border-[#E6F7FD] bg-[#F7FCFE] px-4 py-3 text-[13px] text-[#04314A]">
          <span className="font-semibold tabular-nums">{staffActivityLabel}</span>
          <span className="text-[#737373]"> matching the current filters.</span>
        </div>
      ) : null}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAFAF8] border-b border-[#E8E8E5] text-[11px] font-bold tracking-[0.08em] uppercase text-[#737373]">
                <th className="px-5 py-3">Timestamp / IP</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Summary / Change</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5] text-[12px]">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#737373]">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin text-[#00AAEB]" />
                      Loading activity entries...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-[#737373]">
                    No activity records match the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((entry) => {
                  const dateStr = new Date(entry.timestamp).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  const hasDiff = entry.field_name && (entry.old_value || entry.new_value);

                  return (
                    <tr key={entry.id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-[#737373] text-[11px]">
                        <div>{dateStr}</div>
                        {entry.ip_address && (
                          <div className="text-[10px] text-[#B0B0AA] flex items-center gap-1 mt-0.5">
                            <Globe size={10} /> {entry.ip_address}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.06em] uppercase ${getActionBadgeClass(
                            entry.action,
                          )}`}
                        >
                          {entry.action || "UPDATE"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {entry.model_name && entry.object_id ? (
                          <button
                            type="button"
                            onClick={() => handleEntityClick(entry.model_name, entry.object_id)}
                            className="font-bold text-[#00AAEB] hover:underline"
                          >
                            {entry.model_name} #{entry.object_id}
                          </button>
                        ) : (
                          <span className="text-[#737373] text-[11px]">System / Auth</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 max-w-md">
                        {entry.summary ? (
                          <div className="font-medium text-[#04314A] text-[12px]">{entry.summary}</div>
                        ) : null}
                        {hasDiff && (
                          <div className="mt-1 flex items-center gap-2 font-medium text-[11px] bg-[#F7F7F5] rounded p-1.5 border border-[#E8E8E5]">
                            <span className="text-[#737373] font-semibold mr-1">
                              {entry.field_name}:
                            </span>
                            <span className="line-through text-[#DC2626] truncate max-w-[120px]">
                              {entry.old_value || "(empty)"}
                            </span>
                            <ArrowRight size={12} className="text-[#737373] flex-shrink-0" />
                            <span className="text-[#16A34A] font-bold truncate max-w-[120px]">
                              {entry.new_value || "(empty)"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.06em] uppercase bg-[#FAFAF8] border border-[#E8E8E5] text-[#737373]">
                          {entry.source}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[#04314A]">
                        <div className="font-semibold">{entry.changed_by_name}</div>
                        {entry.changed_by_username &&
                          entry.changed_by_username !== entry.changed_by_name && (
                            <div className="text-[10px] text-[#737373]">
                              @{entry.changed_by_username}
                            </div>
                          )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && !loading && (
          <Pagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={total}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        )}
      </div>
    </div>
  );
}
