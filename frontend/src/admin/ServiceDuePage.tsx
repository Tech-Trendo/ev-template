import { useState, useEffect, useCallback } from "react";
import { Wrench, AlertTriangle, Clock, RefreshCw, Search, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { EntityLink } from "./components/pickers";

export type DueUnitItem = {
  unit_id: number;
  vin_chassis_no: string;
  registration_no: string;
  color: string;
  current_odometer: number;
  model_id: number;
  model_name: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  dealer_id: number | null;
  dealer_name: string;
  next_service_due: {
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
};

type DealerOption = {
  id: number;
  name: string;
};

export default function ServiceDuePage({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const [units, setUnits] = useState<DueUnitItem[]>([]);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false);
  const [filterDays, setFilterDays] = useState<string>("all");
  const [selectedDealer, setSelectedDealer] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterOverdueOnly) params.append("overdue_only", "true");
      if (filterDays !== "all") params.append("days_until_due", filterDays);
      if (selectedDealer) params.append("dealer", selectedDealer);

      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await api.get<DueUnitItem[]>(`/api/servicing/due/${qs}`);
      setUnits(res || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load service due records.");
    } finally {
      setLoading(false);
    }
  }, [filterOverdueOnly, filterDays, selectedDealer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    api
      .get<DealerOption[]>("/api/dealers/")
      .then((data) => {
        if (Array.isArray(data)) setDealers(data);
        else if (data && Array.isArray((data as any).results)) {
          setDealers((data as any).results);
        }
      })
      .catch(() => {
        // Dealer loading failed silently if unauthorized
      });
  }, []);

  const filteredUnits = units.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.vin_chassis_no.toLowerCase().includes(q) ||
      (item.registration_no && item.registration_no.toLowerCase().includes(q)) ||
      item.customer_name.toLowerCase().includes(q) ||
      item.customer_phone.toLowerCase().includes(q) ||
      item.model_name.toLowerCase().includes(q) ||
      item.dealer_name.toLowerCase().includes(q)
    );
  });

  const overdueCount = units.filter((u) => u.next_service_due.is_overdue).length;
  const dueSoonCount = units.filter((u) => u.next_service_due.status === "due_soon").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E8E8E5] pb-5">
        <div>
          <h1 className="text-[22px] font-bold text-[#04314A] tracking-tight">
            Service Due & Overdue
          </h1>
          <p className="text-[13px] text-[#737373] mt-0.5">
            Routine workshop service tracking based on elapsed months or mileage limit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E8E8E5] text-[12px] font-medium text-[#04314A] bg-white hover:bg-[#F7F7F5] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => onNavigate("servicing")}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#04314A] text-white text-[12px] font-semibold hover:bg-[#00AAEB] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB]"
          >
            <Wrench size={14} />
            Go to Servicing
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 border border-[#E8E8E5] bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#737373]">
              Overdue Units
            </span>
            <AlertTriangle size={16} className="text-[#DC2626]" />
          </div>
          <p className="text-[26px] font-bold text-[#DC2626] mt-1">{overdueCount}</p>
          <p className="text-[11px] text-[#737373] mt-0.5">Past due by date or odometer limit</p>
        </div>

        <div className="p-4 border border-[#E8E8E5] bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#737373]">
              Due Soon (Next 7 Days)
            </span>
            <Clock size={16} className="text-[#D97706]" />
          </div>
          <p className="text-[26px] font-bold text-[#D97706] mt-1">{dueSoonCount}</p>
          <p className="text-[11px] text-[#737373] mt-0.5">Within 7 days or 500 km</p>
        </div>

        <div className="p-4 border border-[#E8E8E5] bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#737373]">
              Total Scheduled
            </span>
            <CheckCircle2 size={16} className="text-[#04314A]" />
          </div>
          <p className="text-[26px] font-bold text-[#04314A] mt-1">{units.length}</p>
          <p className="text-[11px] text-[#737373] mt-0.5">Active vehicles with scheduled intervals</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 border border-[#E8E8E5] bg-white space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by VIN, license plate, customer name, phone, or model..."
              className="w-full pl-9 pr-3 py-1.5 border border-[#E8E8E5] text-[13px] bg-white text-[#04314A] placeholder-[#737373] focus:outline-none focus:border-[#00AAEB]"
            />
          </div>

          {/* Overdue Toggle Button */}
          <div className="flex items-center gap-1 border border-[#E8E8E5] p-0.5 bg-[#F7F7F5]">
            <button
              onClick={() => setFilterOverdueOnly(false)}
              className={`px-3 py-1 text-[12px] font-medium transition-colors ${
                !filterOverdueOnly
                  ? "bg-white text-[#04314A] font-bold shadow-sm"
                  : "text-[#737373] hover:text-[#04314A]"
              }`}
            >
              All Due
            </button>
            <button
              onClick={() => setFilterOverdueOnly(true)}
              className={`px-3 py-1 text-[12px] font-medium transition-colors ${
                filterOverdueOnly
                  ? "bg-white text-[#DC2626] font-bold shadow-sm"
                  : "text-[#737373] hover:text-[#DC2626]"
              }`}
            >
              Overdue Only
            </button>
          </div>

          {/* Days Filter */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#737373] whitespace-nowrap">Window:</span>
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(e.target.value)}
              className="border border-[#E8E8E5] px-2.5 py-1.5 text-[12px] bg-white text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
            >
              <option value="all">All Horizons</option>
              <option value="7">Due in &le; 7 Days</option>
              <option value="14">Due in &le; 14 Days</option>
              <option value="30">Due in &le; 30 Days</option>
            </select>
          </div>

          {/* Dealer Filter */}
          {dealers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#737373] whitespace-nowrap">Dealer:</span>
              <select
                value={selectedDealer}
                onChange={(e) => setSelectedDealer(e.target.value)}
                className="border border-[#E8E8E5] px-2.5 py-1.5 text-[12px] bg-white text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
              >
                <option value="">All Dealers</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="border border-[#E8E8E5] bg-white overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-[13px] text-[#DC2626] bg-[#FEF2F2]">
            {error}
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-[13px] text-[#737373]">
            Loading scheduled service records...
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 size={36} className="mx-auto text-[#059669] mb-3" />
            <h3 className="text-[15px] font-bold text-[#04314A]">No units currently due</h3>
            <p className="text-[13px] text-[#737373] mt-1 max-w-sm mx-auto">
              No vehicles match the selected filter criteria or require immediate routine service.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#F7F7F5] border-b border-[#E8E8E5] text-[#737373] font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">VIN / Chassis</th>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Dealer</th>
                  <th className="py-3 px-4">Last Service / Sold</th>
                  <th className="py-3 px-4">Odometer vs Due</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E5]">
                {filteredUnits.map((item) => {
                  const due = item.next_service_due;
                  const isOd = due.is_overdue;
                  const days = due.days_until_due;

                  let badgeColor = "bg-[#F0F0ED] text-[#04314A]";
                  let badgeText = "Upcoming";

                  if (isOd) {
                    badgeColor = "bg-[#FEE2E2] text-[#DC2626]";
                    if (due.overdue_by_date && days !== null) {
                      badgeText = `Overdue by ${Math.abs(days)}d`;
                    } else if (due.overdue_by_km && due.km_until_due !== null) {
                      badgeText = `Overdue by ${Math.abs(due.km_until_due)} km`;
                    } else {
                      badgeText = "Overdue";
                    }
                  } else if (due.status === "due_soon") {
                    badgeColor = "bg-[#FEF3C7] text-[#D97706]";
                    if (days !== null && days >= 0) {
                      badgeText = `Due in ${days}d`;
                    } else if (due.km_until_due !== null && due.km_until_due >= 0) {
                      badgeText = `Due in ${due.km_until_due} km`;
                    } else {
                      badgeText = "Due Soon";
                    }
                  }

                  return (
                    <tr
                      key={item.unit_id}
                      className="hover:bg-[#FAFAF8] transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-[#04314A]">
                        <EntityLink
                          type="unit"
                          id={item.unit_id}
                          label={item.vin_chassis_no}
                          onNavigate={onNavigate}
                        />
                        {item.registration_no && (
                          <div className="text-[11px] text-[#737373]">
                            {item.registration_no}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#04314A] font-medium">
                        {item.model_name}
                      </td>
                      <td className="py-3 px-4">
                        {item.customer_id ? (
                          <EntityLink
                            type="customer"
                            id={item.customer_id}
                            label={item.customer_name}
                            onNavigate={onNavigate}
                          />
                        ) : (
                          <span className="text-[#04314A] font-medium">
                            {item.customer_name || "Unassigned"}
                          </span>
                        )}
                        {item.customer_phone && (
                          <div className="text-[11px] text-[#737373]">
                            {item.customer_phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#737373]">
                        {item.dealer_name || "Central / None"}
                      </td>
                      <td className="py-3 px-4 text-[#737373]">
                        {due.last_service_date || "Never serviced"}
                        {due.last_service_km !== null && (
                          <div className="text-[11px] text-[#737373]">
                            at {due.last_service_km.toLocaleString()} km
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#04314A]">
                        <span className="font-semibold">
                          {item.current_odometer.toLocaleString()} km
                        </span>
                        {due.due_km !== null && (
                          <span className="text-[#737373] text-[11px] block">
                            Due at {due.due_km.toLocaleString()} km
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#04314A]">
                        {due.due_date || "By mileage only"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full uppercase tracking-wider ${badgeColor}`}
                        >
                          {badgeText}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() =>
                            onNavigate(
                              `servicing?tab=new&chassis=${encodeURIComponent(
                                item.vin_chassis_no
                              )}`
                            )
                          }
                          className="px-2.5 py-1 border border-[#04314A] text-[#04314A] text-[11px] font-semibold hover:bg-[#04314A] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB]"
                        >
                          Create VRO
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
