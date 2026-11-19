import React, { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Search,
  User,
  Users,
  TrendingUp,
  Activity as ActivityIcon,
  ChevronRight,
  Clock,
  X,
  Building2,
} from "lucide-react";
import { api, API_BASE, getValidAccessToken } from "@/lib/api";
import { useAuth } from "../AuthContext";
import { Badge, Button, Input, Modal, useToast } from "@/components/ui";

interface PerformanceEmployee {
  id: number;
  username: string;
  full_name: string;
  role: string;
  dealer_id?: number | null;
  dealer_name?: string;
  counts: Record<string, number>;
  total_actions: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface DrilldownItem {
  id: number;
  timestamp: string;
  action: string;
  source: string;
  object_type: string;
  object_id: string;
  summary: string;
}

interface DealerOption {
  id: number;
  name: string;
}

export default function TeamPerformancePage({
  onNavigate,
}: {
  onNavigate?: (page: string) => void;
}) {
  const { me, hasPerm } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<"daily" | "range">("daily");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dailyDate, setDailyDate] = useState<string>(todayStr);

  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [rangeFrom, setRangeFrom] = useState<string>(thirtyDaysAgoStr);
  const [rangeTo, setRangeTo] = useState<string>(todayStr);

  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data
  const [employees, setEmployees] = useState<PerformanceEmployee[]>([]);
  const [totalActions, setTotalActions] = useState<number>(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [actionBreakdown, setActionBreakdown] = useState<Record<string, number>>({});

  // Drilldown Modal
  const [drilldownUser, setDrilldownUser] = useState<PerformanceEmployee | null>(null);
  const [drilldownItems, setDrilldownItems] = useState<DrilldownItem[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  // Load Dealers for filter dropdown
  useEffect(() => {
    api<{ results: DealerOption[] } | DealerOption[]>("/api/dealers/")
      .then((res) => {
        const list = Array.isArray(res) ? res : res.results ?? [];
        setDealers(list);
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "daily") {
        let url = `/api/performance/daily/?date=${dailyDate}`;
        if (selectedDealer) url += `&dealer=${selectedDealer}`;
        const res = await api<{
          date: string;
          users: PerformanceEmployee[];
          total_actions: number;
        }>(url);
        setEmployees(res.users || []);
        setTotalActions(res.total_actions || 0);
      } else {
        let url = `/api/performance/range/?date_from=${rangeFrom}&date_to=${rangeTo}`;
        if (selectedDealer) url += `&dealer=${selectedDealer}`;
        if (selectedRole) url += `&role=${encodeURIComponent(selectedRole)}`;
        const res = await api<{
          date_from: string;
          date_to: string;
          users: PerformanceEmployee[];
          trend: TrendPoint[];
          action_breakdown: Record<string, number>;
          total_actions: number;
        }>(url);
        setEmployees(res.users || []);
        setTotalActions(res.total_actions || 0);
        setTrend(res.trend || []);
        setActionBreakdown(res.action_breakdown || {});
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load team performance data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, dailyDate, rangeFrom, rangeTo, selectedDealer, selectedRole, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openDrilldown = async (emp: PerformanceEmployee) => {
    setDrilldownUser(emp);
    setLoadingDrilldown(true);
    setDrilldownItems([]);
    try {
      const url = `/api/performance/daily/?date=${dailyDate}&user_id=${emp.id}`;
      const res = await api<{ drilldown: DrilldownItem[] }>(url);
      setDrilldownItems(res.drilldown || []);
    } catch {
      toast.error("Failed to load employee activity breakdown");
    } finally {
      setLoadingDrilldown(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = await getValidAccessToken();
      let url = `${API_BASE}/api/performance/export-csv/?date_from=${
        mode === "daily" ? dailyDate : rangeFrom
      }&date_to=${mode === "daily" ? dailyDate : rangeTo}`;
      if (selectedDealer) url += `&dealer=${selectedDealer}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("CSV Export failed");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `team_performance_${mode === "daily" ? dailyDate : `${rangeFrom}_${rangeTo}`}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Team Performance CSV exported successfully");
    } catch {
      toast.error("Failed to export performance CSV");
    }
  };

  const filteredEmployees = employees.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      (e.dealer_name && e.dealer_name.toLowerCase().includes(q))
    );
  });

  const topPerformer = employees.length > 0 ? employees[0] : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E8E8E5] pb-5">
        <div>
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373] block mb-1">
            Productivity & Operational Audit
          </span>
          <h1 className="text-[24px] sm:text-[28px] font-black tracking-tight text-[#0B3D2B]">
            Team Performance
          </h1>
          <p className="text-[13px] text-[#737373] mt-1">
            Track daily employee contributions, countable CRM actions, and long-term dealership productivity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5"
          >
            <Download size={13} />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Mode Switcher Tabs & Filter Bar */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F0F0ED] pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("daily")}
              className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors ${
                mode === "daily"
                  ? "bg-[#0B3D2B] text-white"
                  : "bg-[#F7F7F5] text-[#737373] hover:text-[#0B3D2B]"
              }`}
            >
              Daily View
            </button>
            <button
              onClick={() => setMode("range")}
              className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-colors ${
                mode === "range"
                  ? "bg-[#0B3D2B] text-white"
                  : "bg-[#F7F7F5] text-[#737373] hover:text-[#0B3D2B]"
              }`}
            >
              Date Range View
            </button>
          </div>

          {/* Quick Date Shortcuts for Range */}
          {mode === "range" && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#737373]">
              <span>Quick:</span>
              <button
                onClick={() => {
                  setRangeFrom(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
                  setRangeTo(todayStr);
                }}
                className="px-2 py-1 bg-[#F7F7F5] hover:bg-[#E8E8E5] rounded text-[#0B3D2B]"
              >
                Last 7d
              </button>
              <button
                onClick={() => {
                  setRangeFrom(thirtyDaysAgoStr);
                  setRangeTo(todayStr);
                }}
                className="px-2 py-1 bg-[#F7F7F5] hover:bg-[#E8E8E5] rounded text-[#0B3D2B]"
              >
                Last 30d
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
                  setRangeFrom(firstDay);
                  setRangeTo(todayStr);
                }}
                className="px-2 py-1 bg-[#F7F7F5] hover:bg-[#E8E8E5] rounded text-[#0B3D2B]"
              >
                This Month
              </button>
            </div>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {mode === "daily" ? (
            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-[#737373] mb-1">
                Selected Date
              </label>
              <Input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-[#737373] mb-1">
                  From Date
                </label>
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-[#737373] mb-1">
                  To Date
                </label>
                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </div>
            </>
          )}

          {dealers.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-[#737373] mb-1">
                Dealership
              </label>
              <select
                value={selectedDealer}
                onChange={(e) => setSelectedDealer(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E8E8E5] bg-white px-3 text-[12px] font-medium text-[#0B3D2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              >
                <option value="">All Dealerships</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-[#737373] mb-1">
              Search Employee
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-[#737373]" />
              <input
                type="text"
                placeholder="Filter by name or role…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-medium text-[#0B3D2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#737373] mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase">Total Actions Logged</span>
            <ActivityIcon size={16} className="text-[#10B981]" />
          </div>
          <div className="text-[24px] font-black text-[#0B3D2B]">{totalActions.toLocaleString()}</div>
          <span className="text-[11px] text-[#737373] mt-1 block">
            {mode === "daily" ? `On ${dailyDate}` : `Across selected ${trend.length} days`}
          </span>
        </div>

        <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#737373] mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase">Active Staff Members</span>
            <Users size={16} className="text-[#0B3D2B]" />
          </div>
          <div className="text-[24px] font-black text-[#0B3D2B]">{employees.length}</div>
          <span className="text-[11px] text-[#737373] mt-1 block">Recorded operations</span>
        </div>

        <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#737373] mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase">Top Contributor</span>
            <TrendingUp size={16} className="text-[#0B3D2B]" />
          </div>
          <div className="text-[16px] font-black text-[#0B3D2B] truncate">
            {topPerformer ? topPerformer.full_name : "-"}
          </div>
          <span className="text-[11px] text-[#10B981] font-semibold mt-1 block">
            {topPerformer ? `${topPerformer.total_actions} actions (${topPerformer.role})` : "No activity"}
          </span>
        </div>

        <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between text-[#737373] mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase">Dealerships Scoped</span>
            <Building2 size={16} className="text-[#737373]" />
          </div>
          <div className="text-[18px] font-black text-[#0B3D2B] truncate">
            {selectedDealer
              ? dealers.find((d) => String(d.id) === String(selectedDealer))?.name || "Filtered"
              : "All Assigned"}
          </div>
          <span className="text-[11px] text-[#737373] mt-1 block">Audit verified</span>
        </div>
      </div>

      {/* Trend Bar Visualization (Range View) */}
      {mode === "range" && trend.length > 0 && (
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[12px] font-bold tracking-[0.1em] uppercase text-[#0B3D2B]">
                Activity Velocity Trend
              </h3>
              <p className="text-[11px] text-[#737373]">
                Daily aggregate actions performed across the network.
              </p>
            </div>
            <span className="text-[11px] font-bold text-[#10B981] bg-[#10B981]/10 px-2.5 py-1 rounded">
              {trend.length} Days Tracked
            </span>
          </div>

          {/* Simple Responsive Solid Bar Chart */}
          <div className="h-36 flex items-end gap-1 border-b border-[#E8E8E5] pb-2 overflow-x-auto">
            {(() => {
              const maxCount = Math.max(...trend.map((t) => t.count), 1);
              return trend.map((t) => {
                const heightPercent = Math.max(4, Math.round((t.count / maxCount) * 100));
                return (
                  <div
                    key={t.date}
                    className="flex-1 min-w-[12px] flex flex-col items-center group relative cursor-pointer"
                  >
                    {/* Tooltip */}
                    <div className="hidden group-hover:block absolute bottom-full mb-1 z-20 bg-[#0B3D2B] text-white text-[10px] font-bold py-1 px-2 rounded shadow-md whitespace-nowrap">
                      {t.date}: {t.count} actions
                    </div>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-[#10B981] rounded-t hover:bg-[#0B3D2B] transition-colors"
                    />
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-[#737373] mt-2">
            <span>{rangeFrom}</span>
            <span>{rangeTo}</span>
          </div>
        </div>
      )}

      {/* Main Employee Performance Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8E8E5] flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h3 className="text-[13px] font-bold text-[#0B3D2B]">Staff Productivity Matrix</h3>
            <p className="text-[11px] text-[#737373]">
              Breakdown of business entity creations, revisions, inspections, and customer engagements.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-[#737373]">
            Showing {filteredEmployees.length} of {employees.length} employees
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[13px] text-[#737373]">Loading activity rollups…</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-[#737373]">
            No activity records found for this period and filter selection.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[950px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5]">
                  <th className="px-4 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373]">Employee</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Leads</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Customers</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Quotations</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Sales</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Test Drives</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Servicing</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Inspections</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Units</th>
                  <th className="px-3 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-center">Logins</th>
                  <th className="px-4 py-3 text-[10px] font-bold tracking-[0.1em] uppercase text-[#737373] text-right">Total</th>
                  <th className="px-3 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => {
                  const leads = emp.counts["LEAD_CREATED"] || 0;
                  const customers = emp.counts["CUSTOMER_CREATED"] || 0;
                  const quotes = (emp.counts["QUOTATION_CREATED"] || 0) + (emp.counts["QUOTATION_REVISED"] || 0);
                  const sales = emp.counts["SALE_RECORDED"] || 0;
                  const testDrives = emp.counts["TEST_DRIVE_COMPLETED"] || 0;
                  const service = (emp.counts["SERVICE_CREATED"] || 0) + (emp.counts["SERVICE_COMPLETED"] || 0);
                  const inspections = emp.counts["INSPECTION_DONE"] || 0;
                  const units = emp.counts["UNIT_ENTERED"] || 0;
                  const logins = emp.counts["LOGIN"] || 0;

                  return (
                    <tr
                      key={emp.id}
                      className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-[12px] text-[#0B3D2B]">{emp.full_name}</div>
                        <div className="text-[11px] text-[#737373] flex items-center gap-1.5 mt-0.5">
                          <span>{emp.role}</span>
                          <span>·</span>
                          <span>{emp.dealer_name || "Central Office"}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {leads > 0 ? <span className="text-[#0B3D2B]">{leads}</span> : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {customers > 0 ? <span className="text-[#0B3D2B]">{customers}</span> : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {quotes > 0 ? <span className="text-[#0B3D2B]">{quotes}</span> : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {sales > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-[#10B981]/10 text-[#10B981] font-bold">
                            {sales}
                          </span>
                        ) : (
                          <span className="text-[#B0B0AA]">-</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {testDrives > 0 ? testDrives : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {service > 0 ? service : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {inspections > 0 ? inspections : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#0B3D2B]">
                        {units > 0 ? units : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-3 py-3 text-center text-[12px] font-semibold text-[#737373]">
                        {logins > 0 ? logins : <span className="text-[#B0B0AA]">-</span>}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className="text-[13px] font-black text-[#0B3D2B]">
                          {emp.total_actions}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        {mode === "daily" && (
                          <button
                            onClick={() => openDrilldown(emp)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
                          >
                            Drilldown <ChevronRight size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drilldown Timeline Modal */}
      {drilldownUser && (
        <Modal
          title={`Activity Drilldown: ${drilldownUser.full_name} (${dailyDate})`}
          onClose={() => setDrilldownUser(null)}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#FAFAF8] p-3 rounded-lg border border-[#E8E8E5]">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#737373] block">
                  Employee
                </span>
                <span className="text-[13px] font-bold text-[#0B3D2B]">
                  {drilldownUser.full_name} ({drilldownUser.username})
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[#737373] block">
                  Dealership
                </span>
                <span className="text-[12px] font-semibold text-[#0B3D2B]">
                  {drilldownUser.dealer_name || "Central Office"}
                </span>
              </div>
            </div>

            {loadingDrilldown ? (
              <p className="text-[12px] text-[#737373] py-6 text-center">Loading audit log events…</p>
            ) : drilldownItems.length === 0 ? (
              <p className="text-[12px] text-[#737373] py-6 text-center">
                No granular audit log events recorded for this user on {dailyDate}. (Actions may have been rolled up before log purge).
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                {drilldownItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border border-[#E8E8E5] rounded-lg bg-white flex items-start justify-between gap-3 text-[12px]"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#0B3D2B] text-white uppercase">
                          {item.action}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-[#737373]">
                          {item.object_type} #{item.object_id}
                        </span>
                      </div>
                      <p className="text-[#0B3D2B] font-medium">{item.summary}</p>
                    </div>
                    <div className="text-right text-[11px] text-[#737373] whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-[#E8E8E5]">
              <Button variant="secondary" onClick={() => setDrilldownUser(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
