import { useEffect, useState } from "react";
import {
  TrendingUp,
  Wrench,
  Car,
  FileText,
  Ship,
  ChevronRight,
  Clock,
  CreditCard,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Badge, Button } from "@/components/ui";

/* ─── types ──────────────────────────────────────────────────────────────── */
export type DashStats = {
  vehicles?: { total: number; active: number };
  inventory?: {
    total: number;
    in_transit: number;
    in_warehouse: number;
    pdi_pending: number;
    pdi_passed: number;
    ready_for_sale: number;
    reserved: number;
    sold: number;
    models_breakdown?: {
      id: number;
      brand: string;
      model_name: string;
      total: number;
      in_transit: number;
      in_warehouse: number;
      ready_for_sale: number;
      reserved: number;
      sold: number;
      low_threshold: number;
    }[];
  };
  sales_finance?: {
    total_revenue: number;
    units_sold: number;
    sold_this_month: number;
    cash_count: number;
    finance_count: number;
    pending_finance: number;
  };
  transporter_inspections?: {
    total: number;
    recent: {
      id: number;
      receive_no: string;
      vin: string;
      model: string;
      receive_date: string;
      driver_name: string;
      run_km: number;
      status: string;
      yard: string;
    }[];
  };
  servicing?: {
    total: number;
    active: number;
    received: number;
    in_progress: number;
    waiting_for_parts: number;
    completed: number;
    delivered: number;
    this_month: number;
    recent: {
      id: number;
      vro_no: string;
      chassis_number: string;
      status: string;
      customer_name: string;
      date_received: string;
      job_description?: string;
      estimated_cost?: number;
    }[];
    service_due?: {
      overdue: number;
      due_soon: number;
      total_due: number;
    };
  };
  crm?: {
    leads?: {
      total: number;
      new: number;
      contacted: number;
      qualified: number;
      converted: number;
      lost: number;
      this_week: number;
      pipeline?: Record<string, number>;
      recent: {
        id: number;
        name: string;
        phone: string;
        email: string;
        vehicle: string;
        status: string;
        source: string;
        created_at: string;
      }[];
    };
    customers?: number;
    quotations?: {
      total: number;
      draft: number;
      sent: number;
      accepted: number;
      rejected: number;
      recent?: {
        id: number;
        display_id: string;
        customer_name: string;
        vehicle: string;
        subtotal: number;
        status: string;
        created_at: string;
      }[];
    };
    test_drives?: {
      total: number;
      upcoming: number;
      recent?: {
        id: number;
        display_id: string;
        customer_name: string;
        vehicle: string;
        date: string;
        status: string;
      }[];
    };
  };
  quote_requests?: {
    total: number;
    new: number;
    in_progress: number;
    closed: number;
    this_week: number;
    recent: {
      id: number;
      name: string;
      company: string;
      phone: string;
      email: string;
      vehicle: string;
      status: string;
      created_at: string;
      message: string;
    }[];
  };
  enquiries?: {
    total: number;
    new: number;
    in_progress: number;
    closed: number;
    this_week: number;
    recent?: {
      id: number;
      name: string;
      company: string;
      phone: string;
      email: string;
      vehicle: string;
      status: string;
      created_at: string;
      message: string;
    }[];
  };
  stories?: { total: number; published: number };
  events?: { total: number; upcoming: number };
  dealers?: number;
  batches?: {
    total: number;
    in_transit: number;
    border_customs: number;
    arrived: number;
    recent?: {
      id: number;
      batch_no: string;
      origin: string;
      status: string;
      status_label: string;
      total_units: number;
      border_crossing: string;
      eta_date?: string | null;
      destination: string;
    }[];
  };
};

/* ─── helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number | undefined | null, fallback = "0"): string {
  if (n == null) return fallback;
  return n.toLocaleString();
}

function fmtMoney(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "Rs. 0";
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(2)} Lakh`;
  return `Rs. ${n.toLocaleString()}`;
}

function relativeDate(iso: string | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffD = Math.floor(diffMs / 86400000);
    if (diffD === 0) return "Today";
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

const SERVICE_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  in_progress: "In Progress",
  waiting_for_parts: "Parts Awaited",
  completed: "Completed",
  delivered: "Delivered",
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

type DashboardTab = "overview" | "inventory" | "crm" | "workshop" | "quotes";

/* ─── Subcomponents ──────────────────────────────────────────────────────── */
function MetricCard({
  icon,
  value,
  label,
  sub,
  large,
  onClick,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  sub?: string;
  large?: boolean;
  onClick?: () => void;
}) {
  if (large) {
    return (
      <div
        onClick={onClick}
        className="bg-[#04314A] text-white p-6 rounded-xl flex flex-col justify-between gap-6 cursor-pointer hover:bg-[#06293d] hover:shadow-md transition-all col-span-2 lg:col-span-1 lg:row-span-2 min-h-[220px]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          {sub && (
            <span className="text-[11px] font-semibold text-white/70 bg-white/10 rounded-full px-3 py-1 whitespace-nowrap">
              {sub}
            </span>
          )}
        </div>
        <div>
          <div className="text-[56px] font-black leading-none tabular-nums tracking-tight">
            {value}
          </div>
          <div className="text-[12px] font-bold tracking-[0.12em] uppercase text-white/70 mt-3">
            {label}
          </div>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-bold tracking-[0.08em] uppercase text-[#7DD3FC]">
          View units <ChevronRight size={13} />
        </div>
      </div>
    );
  }
  return (
    <div
      onClick={onClick}
      className="bg-white p-4 rounded-xl border border-[#E8E8E5] flex flex-col justify-between gap-4 cursor-pointer hover:border-[#04314A] hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-lg bg-[#F0F0ED] text-[#04314A] flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        {sub && (
          <span className="text-[11px] font-semibold text-[#737373] text-right leading-tight">
            {sub}
          </span>
        )}
      </div>
      <div>
        <div className="text-[26px] font-black leading-none text-[#04314A] tabular-nums tracking-tight">
          {value}
        </div>
        <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#737373] mt-1.5">
          {label}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-white border rounded-xl border-[#E8E8E5]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8E5]">
        <div>
          <h2 className="text-[11px] font-black tracking-[0.14em] uppercase text-[#04314A]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[12px] text-[#737373] mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && onAction && (
          <button
            onClick={onAction}
            className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-[#00AAEB] hover:text-[#04314A] transition-colors"
          >
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function PipelineBar({
  label,
  value,
  max,
  color,
  onClick,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 py-2 border-b border-[#F0F0ED] last:border-0 ${
        onClick ? "cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors" : ""
      }`}
    >
      <span className="text-[12px] font-medium text-[#737373] w-32 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-[#F0F0ED] overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color || "#04314A" }}
        />
      </div>
      <div className="flex items-center gap-2 w-16 justify-end">
        <span className="text-[11px] text-[#737373]">{pct}%</span>
        <span className="text-[13px] font-black text-[#04314A] tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */
export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  useEffect(() => {
    api<DashStats>("/api/dashboard/stats/")
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  const inv = stats?.inventory;
  const invTotal = inv?.total || 0;

  const leads = stats?.crm?.leads;
  const leadsTotal = leads?.total || 0;

  const svc = stats?.servicing;
  const activeServices =
    svc?.active ??
    (svc?.received || 0) + (svc?.in_progress || 0) + (svc?.waiting_for_parts || 0);

  const enq = stats?.enquiries;
  const quotes = stats?.quote_requests;
  const sales = stats?.sales_finance;
  const batches = stats?.batches;

  if (loading) {
    return (
      <div className="space-y-6 w-full">
        <PageHeader
          title="Dashboard"
          subtitle="Dealership operations, stock flow, CRM pipeline and servicing metrics."
        />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white border rounded-xl border-[#E8E8E5] p-6 h-56 animate-pulse col-span-2 lg:col-span-1 lg:row-span-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 lg:col-span-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-white border rounded-xl border-[#E8E8E5] p-4 h-32 animate-pulse"
              >
                <div className="w-9 h-9 rounded-lg bg-[#F0F0ED] mb-3" />
                <div className="h-7 bg-[#F0F0ED] w-20 mb-2" />
                <div className="h-3 bg-[#F0F0ED] w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-12 min-h-screen">
      <PageHeader
        title="Dashboard"
        subtitle="Dealership operations, stock flow, CRM pipeline and servicing metrics."
      />

      {/* ── Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-[#E8E8E5] pb-px">
        {[
          { key: "overview", label: "Executive Overview" },
          { key: "inventory", label: "Inventory & China Shipments" },
          { key: "crm", label: "CRM & Sales Pipeline" },
          { key: "quotes", label: "Quote Requests & Inquiries" },
          { key: "workshop", label: "Workshop & Servicing" },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as DashboardTab)}
              className={`px-4 py-3 text-[12px] font-bold tracking-[0.06em] uppercase transition-all relative whitespace-nowrap ${
                isActive
                  ? "text-[#04314A]"
                  : "text-[#737373] hover:text-[#04314A]"
              }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00AAEB]" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Top Level Business KPIs (Always Visible) ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {inv && (
          <MetricCard
            large
            icon={<Car size={20} />}
            value={fmt(inv.ready_for_sale)}
            label="Ready for Sale"
            sub={`${fmt(inv.total)} total units`}
            onClick={() => onNavigate("units?status=READY_FOR_SALE")}
          />
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 lg:col-span-3">
          {quotes && (
            <MetricCard
              icon={<FileText size={17} />}
              value={fmt(quotes.new)}
              label="Quote Requests"
              sub={`${fmt(quotes.this_week)} this week`}
              onClick={() => onNavigate("quote-requests?status=new")}
            />
          )}
          {svc && (
            <MetricCard
              icon={<Wrench size={17} />}
              value={fmt(activeServices)}
              label="In Servicing"
              sub={`${fmt(svc.this_month)} this month`}
              onClick={() => onNavigate("servicing?status=in_progress")}
            />
          )}
          {svc && (
            <MetricCard
              icon={<Clock size={17} />}
              value={fmt(svc.service_due?.total_due ?? 0)}
              label="Service Due"
              sub={`${fmt(svc.service_due?.overdue ?? 0)} overdue`}
              onClick={() => onNavigate("servicing-due")}
            />
          )}
          {batches && (
            <MetricCard
              icon={<Ship size={17} />}
              value={fmt(batches.in_transit)}
              label="China Shipments"
              sub={`${fmt(batches.total)} batches`}
              onClick={() => onNavigate("china-transport")}
            />
          )}
          {leads && (
            <MetricCard
              icon={<TrendingUp size={17} />}
              value={fmt(leads.new)}
              label="New CRM Leads"
              sub={`${fmt(leads.this_week)} this week`}
              onClick={() => onNavigate("crm-leads?status=new")}
            />
          )}
          {sales && (
            <MetricCard
              icon={<CreditCard size={17} />}
              value={fmt(sales.units_sold)}
              label="Vehicles Sold"
              sub={fmtMoney(sales.total_revenue)}
              onClick={() => onNavigate("units?status=SOLD")}
            />
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: EXECUTIVE OVERVIEW                                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick Business Overview 3-column split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Inventory Status Breakdown */}
            {inv && (
              <Section
                title="Stock Pipeline"
                subtitle="Live status distribution across all vehicle units"
                action="All Units"
                onAction={() => onNavigate("units")}
              >
                <div className="px-5 py-3">
                  <PipelineBar
                    label="Ready for Sale"
                    value={inv.ready_for_sale}
                    max={invTotal}
                    color="#00AAEB"
                    onClick={() => onNavigate("units?status=READY_FOR_SALE")}
                  />
                  <PipelineBar
                    label="In Warehouse"
                    value={inv.in_warehouse}
                    max={invTotal}
                    color="#04314A"
                    onClick={() => onNavigate("units?status=IN_WAREHOUSE")}
                  />
                  <PipelineBar
                    label="In Transit (China)"
                    value={inv.in_transit}
                    max={invTotal}
                    color="#00AAEB"
                    onClick={() => onNavigate("china-transport")}
                  />
                  <PipelineBar
                    label="PDI Pending"
                    value={inv.pdi_pending}
                    max={invTotal}
                    color="#737373"
                    onClick={() => onNavigate("units?status=PDI_PENDING")}
                  />
                  <PipelineBar
                    label="Reserved"
                    value={inv.reserved}
                    max={invTotal}
                    color="#04314A"
                    onClick={() => onNavigate("units?status=RESERVED")}
                  />
                  <PipelineBar
                    label="Sold"
                    value={inv.sold}
                    max={invTotal}
                    color="#737373"
                    onClick={() => onNavigate("units?status=SOLD")}
                  />
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
                  <span className="text-[12px] text-[#737373]">
                    Total physical fleet inventory
                  </span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    {fmt(invTotal)} units
                  </span>
                </div>
              </Section>
            )}

            {/* Sales & Financing Highlights */}
            {sales && (
              <Section
                title="Sales & Finance Operations"
                subtitle="Revenue breakdown and bank financing"
                action="Quotations"
                onAction={() => onNavigate("crm-quotations")}
              >
                <div className="p-5 space-y-4">
                  <div
                    onClick={() => onNavigate("units?status=SOLD")}
                    className="p-4 border border-[#E8E8E5] bg-[#FAFAF8] cursor-pointer hover:border-[#04314A] transition-colors"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373]">
                      Total Sold Volume (Value)
                    </div>
                    <div className="text-[26px] font-black text-[#04314A] mt-1">
                      {fmtMoney(sales.total_revenue)}
                    </div>
                    <div className="text-[12px] text-[#737373] mt-0.5">
                      {fmt(sales.units_sold)} units completed · {fmt(sales.sold_this_month)} sold this month
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div
                      onClick={() => onNavigate("units?status=SOLD")}
                      className="flex items-center justify-between text-[12px] py-1 border-b border-[#F0F0ED] cursor-pointer hover:text-[#00AAEB]"
                    >
                      <span className="text-[#737373]">Full Cash / Direct Payment</span>
                      <span className="font-bold text-[#04314A]">
                        {fmt(sales.cash_count)} units
                      </span>
                    </div>
                    <div
                      onClick={() => onNavigate("units?status=SOLD")}
                      className="flex items-center justify-between text-[12px] py-1 border-b border-[#F0F0ED] cursor-pointer hover:text-[#00AAEB]"
                    >
                      <span className="text-[#737373]">Bank Financed / EMI</span>
                      <span className="font-bold text-[#04314A]">
                        {fmt(sales.finance_count)} units
                      </span>
                    </div>
                    <div
                      onClick={() => onNavigate("units?status=RESERVED")}
                      className="flex items-center justify-between text-[12px] py-1 cursor-pointer hover:text-[#00AAEB]"
                    >
                      <div>
                        <span className="text-[#737373] block">Pending Finance Approval</span>
                        <span className="text-[10px] text-[#B0B0AA] block">
                          Units sold awaiting bank loan approval before final handover.
                        </span>
                      </div>
                      <span className="font-bold text-[#00AAEB]">
                        {fmt(sales.pending_finance)} units
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  onClick={() => onNavigate("crm-customers")}
                  className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8] cursor-pointer hover:bg-[#F0F0ED] transition-colors"
                >
                  <span className="text-[12px] text-[#737373]">Active Customers</span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    {fmt(stats?.crm?.customers)} registered
                  </span>
                </div>
              </Section>
            )}

            {/* Workshop Status */}
            {svc && (
              <Section
                title="Workshop Status"
                subtitle="Vehicle Template service bays"
                action="Open Workshop"
                onAction={() => onNavigate("servicing")}
              >
                <div className="px-5 py-3 space-y-2">
                  {[
                    { label: "Vehicle Received", val: svc.received, status: "received" },
                    { label: "Service In Progress", val: svc.in_progress, status: "in_progress" },
                    { label: "Parts Awaited", val: svc.waiting_for_parts, status: "waiting_for_parts" },
                    { label: "Inspection Completed", val: svc.completed, status: "completed" },
                    { label: "Delivered to Customer", val: svc.delivered, status: "delivered" },
                  ].map((row) => (
                    <div
                      key={row.label}
                      onClick={() => onNavigate(`servicing?status=${row.status}`)}
                      className="flex items-center justify-between py-2 border-b border-[#F0F0ED] last:border-0 cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors"
                    >
                      <span className="text-[12px] text-[#737373]">{row.label}</span>
                      <span className="text-[14px] font-black text-[#04314A] tabular-nums">
                        {fmt(row.val)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
                  <span className="text-[12px] text-[#737373]">Total Service Visits</span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    {fmt(svc.total)} total ({fmt(svc.this_month)} this month)
                  </span>
                </div>
              </Section>
            )}
          </div>

          {/* EV Models Stock Snapshot Table */}
          {inv?.models_breakdown && inv.models_breakdown.length > 0 && (
            <Section
              title="Electric Vehicle Models: Stock Availability"
              subtitle="Current availability and distribution by vehicle model"
              action="Manage Catalog"
              onAction={() => onNavigate("vehicles")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Model", "Ready for Sale", "In Warehouse", "In Transit", "Sold", "Total Stock", "Stock Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {inv.models_breakdown.map((m) => {
                      const isOutOfStock = m.ready_for_sale === 0;
                      const isLow = !isOutOfStock && m.ready_for_sale <= (m.low_threshold || 2);
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                          onClick={() => onNavigate(`units?model=${m.id}`)}
                        >
                          <td className="px-5 py-3.5">
                            <div className="text-[13px] font-bold text-[#04314A]">
                              {m.brand} {m.model_name}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-[13px] font-bold text-[#00AAEB] tabular-nums">
                            {fmt(m.ready_for_sale)}
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                            {fmt(m.in_warehouse)}
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                            {fmt(m.in_transit)}
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                            {fmt(m.sold)}
                          </td>
                          <td className="px-5 py-3.5 text-[13px] font-black text-[#04314A] tabular-nums">
                            {fmt(m.total)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${
                                isOutOfStock
                                  ? "text-[#737373]"
                                  : isLow
                                  ? "text-[#00AAEB]"
                                  : "text-[#04314A]"
                              }`}
                            >
                              {isOutOfStock ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Two-column Tables: Recent Inbound Quotes & Recent Workshop Repairs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Recent Quote Requests */}
            {quotes?.recent && quotes.recent.length > 0 && (
              <Section
                title="Recent Quote Requests"
                subtitle="Inbound website quote inquiries requiring follow-up"
                action="View All"
                onAction={() => onNavigate("quote-requests")}
              >
                <div className="divide-y divide-[#F0F0ED]">
                  {quotes.recent.map((q) => (
                    <div
                      key={q.id}
                      className="p-4 hover:bg-[#FAFAF8] cursor-pointer transition-colors"
                      onClick={() => onNavigate("quote-requests")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[13px] font-bold text-[#04314A]">
                            {q.name}
                            {q.company ? ` · ${q.company}` : ""}
                          </div>
                          <div className="text-[11px] text-[#737373] mt-0.5">
                            {q.phone} {q.email ? `· ${q.email}` : ""}
                          </div>
                        </div>
                        <StatusBadge status={q.status} />
                      </div>
                      <div className="mt-2 text-[12px] text-[#04314A] font-medium">
                        Vehicle: <span className="text-[#00AAEB]">{q.vehicle}</span>
                      </div>
                      {q.message && (
                        <p className="mt-1 text-[11px] text-[#737373] line-clamp-1 italic">
                          &ldquo;{q.message}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent Workshop VROs */}
            {svc?.recent && svc.recent.length > 0 && (
              <Section
                title="Recent Vehicle Repair Orders (VRO)"
                subtitle="Workshop visits at Vehicle Template service center"
                action="View All"
                onAction={() => onNavigate("servicing")}
              >
                <div className="divide-y divide-[#F0F0ED]">
                  {svc.recent.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-4 hover:bg-[#FAFAF8] cursor-pointer transition-colors"
                      onClick={() => onNavigate("servicing")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[13px] font-bold text-[#04314A]">
                            {rec.vro_no} · {rec.customer_name || "Customer Walk-in"}
                          </div>
                          <div className="text-[11px] text-[#737373] mt-0.5">
                            Chassis: {rec.chassis_number}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#04314A]">
                          {SERVICE_STATUS_LABEL[rec.status] || rec.status}
                        </span>
                      </div>
                      {rec.job_description && (
                        <p className="mt-2 text-[12px] text-[#737373] line-clamp-1">
                          {rec.job_description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#737373]">
                        <span>Received: {relativeDate(rec.date_received)}</span>
                        {rec.estimated_cost != null && rec.estimated_cost > 0 && (
                          <span className="font-bold text-[#04314A]">
                            Est: {fmtMoney(rec.estimated_cost)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Scheduled Service Due */}
            {svc?.service_due && (
              <Section
                title="Service Due Alerts"
                subtitle="Routine scheduled maintenance due or overdue"
                action="View List"
                onAction={() => onNavigate("servicing-due")}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between p-3 border border-[#E8E8E5] bg-[#FAFAF8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                      <span className="text-[13px] font-bold text-[#04314A]">Overdue for Routine Service</span>
                    </div>
                    <span className="text-[14px] font-bold text-[#DC2626]">
                      {svc.service_due.overdue}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 border border-[#E8E8E5] bg-[#FAFAF8]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
                      <span className="text-[13px] font-bold text-[#04314A]">Due Soon (Next 7 Days or 500 km)</span>
                    </div>
                    <span className="text-[14px] font-bold text-[#D97706]">
                      {svc.service_due.due_soon}
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate("servicing-due")}
                    className="w-full mt-1 py-2 text-center text-[12px] font-semibold text-[#04314A] border border-[#04314A] hover:bg-[#04314A] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00AAEB]"
                  >
                    Open Service Due Queue
                  </button>
                </div>
              </Section>
            )}
          </div>

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: INVENTORY & CHINA SHIPMENTS                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          {/* Models Stock Detail */}
          {inv?.models_breakdown && (
            <Section
              title="Electric Vehicle Inventory by Model"
              subtitle="Units ready for sale, in warehouse, and in-transit from China factory"
              action="All Units"
              onAction={() => onNavigate("units")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Brand & Model", "Ready for Sale", "In Warehouse", "In Transit", "Reserved", "Sold", "Total Physical Units"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {inv.models_breakdown.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                        onClick={() => onNavigate(`units?model=${m.id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="text-[13px] font-bold text-[#04314A]">
                            {m.brand} {m.model_name}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] font-bold text-[#00AAEB] tabular-nums">
                          {fmt(m.ready_for_sale)}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                          {fmt(m.in_warehouse)}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                          {fmt(m.in_transit)}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                          {fmt(m.reserved)}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] text-[#737373] tabular-nums">
                          {fmt(m.sold)}
                        </td>
                        <td className="px-5 py-3.5 text-[13px] font-black text-[#04314A] tabular-nums">
                          {fmt(m.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* China Shipments (Import Batches) */}
          {batches && (
            <Section
              title="China Import Batches & Border Customs"
              subtitle="Containers and truck consignments from China factory"
              action="Shipments Manager"
              onAction={() => onNavigate("china-transport")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Batch No", "Origin", "Border Crossing", "Status", "Units", "Destination", "ETA"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.recent && batches.recent.length > 0 ? (
                      batches.recent.map((b) => (
                        <tr
                          key={b.id}
                          className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                          onClick={() => onNavigate(`batches/${b.id}`)}
                        >
                          <td className="px-5 py-3.5 text-[12px] font-bold text-[#04314A]">
                            {b.batch_no}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {b.origin}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {b.border_crossing || "Rasuwagadhi (Kerung)"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#00AAEB]">
                              {b.status_label || b.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[12px] font-bold text-[#04314A] tabular-nums">
                            {b.total_units}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {b.destination || "Kathmandu Stockyard"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {b.eta_date ? relativeDate(b.eta_date) : "-"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-[12px] text-[#737373]">
                          No recent China shipment batches recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Transporter Arrival Checklists */}
          {stats?.transporter_inspections && (
            <Section
              title="Recent Transporter Arrival Inspections"
              subtitle="Driver delivery inspections and Tool Kit Bag verification"
              action="Units Manager"
              onAction={() => onNavigate("units")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Receive No", "Vehicle Chassis", "Model", "Driver Name", "Run KM", "Yard", "Date", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.transporter_inspections.recent &&
                    stats.transporter_inspections.recent.length > 0 ? (
                      stats.transporter_inspections.recent.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]"
                        >
                          <td className="px-5 py-3.5 text-[12px] font-bold text-[#04314A]">
                            {r.receive_no}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {r.vin}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {r.model}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {r.driver_name || "-"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373] tabular-nums">
                            {r.run_km} km
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {r.yard || "Central Yard"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            {relativeDate(r.receive_date)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#04314A]">
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-5 py-6 text-center text-[12px] text-[#737373]">
                          No transporter arrival inspection forms submitted yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: CRM & SALES PIPELINE                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "crm" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Lead Funnel */}
            {leads && (
              <Section
                title="Lead Pipeline Stages"
                subtitle="Conversion status across all prospects"
                action="CRM Leads"
                onAction={() => onNavigate("crm-leads")}
              >
                <div className="px-5 py-3">
                  {leads.pipeline ? (
                    <>
                      <PipelineBar label="New Lead" value={leads.pipeline.new ?? leads.new} max={leadsTotal} color="#00AAEB" onClick={() => onNavigate("crm-leads?status=new")} />
                      <PipelineBar label="Contacted" value={leads.pipeline.contacted ?? leads.contacted} max={leadsTotal} color="#04314A" onClick={() => onNavigate("crm-leads?status=contacted")} />
                      <PipelineBar label="Test Drive" value={leads.pipeline.test_drive ?? 0} max={leadsTotal} color="#00AAEB" onClick={() => onNavigate("crm-testdrives")} />
                      <PipelineBar label="Quotation" value={leads.pipeline.quotation ?? 0} max={leadsTotal} color="#04314A" onClick={() => onNavigate("crm-quotations")} />
                      <PipelineBar label="Negotiation" value={leads.pipeline.negotiation ?? 0} max={leadsTotal} color="#00AAEB" onClick={() => onNavigate("crm-leads?status=negotiation")} />
                      <PipelineBar label="Won / Sold" value={leads.pipeline.won ?? leads.converted} max={leadsTotal} color="#04314A" onClick={() => onNavigate("crm-leads?status=won")} />
                      <PipelineBar label="Lost" value={leads.pipeline.lost ?? leads.lost} max={leadsTotal} color="#737373" onClick={() => onNavigate("crm-leads?status=lost")} />
                    </>
                  ) : (
                    <>
                      <PipelineBar label="New Lead" value={leads.new} max={leadsTotal} color="#00AAEB" onClick={() => onNavigate("crm-leads?status=new")} />
                      <PipelineBar label="Contacted" value={leads.contacted} max={leadsTotal} color="#04314A" onClick={() => onNavigate("crm-leads?status=contacted")} />
                      <PipelineBar label="Qualified" value={leads.qualified} max={leadsTotal} color="#00AAEB" onClick={() => onNavigate("crm-leads?status=qualified")} />
                      <PipelineBar label="Converted" value={leads.converted} max={leadsTotal} color="#04314A" onClick={() => onNavigate("crm-leads?status=won")} />
                      <PipelineBar label="Lost" value={leads.lost} max={leadsTotal} color="#737373" onClick={() => onNavigate("crm-leads?status=lost")} />
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
                  <span className="text-[12px] text-[#737373]">This Week</span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    +{fmt(leads.this_week)} leads
                  </span>
                </div>
              </Section>
            )}

            {/* Quotations summary */}
            {stats?.crm?.quotations && (
              <Section
                title="Quotations Issued"
                subtitle="Formal sales quotes for EV purchase"
                action="All Quotes"
                onAction={() => onNavigate("crm-quotations")}
              >
                <div className="px-5 py-3 space-y-2">
                  <div
                    onClick={() => onNavigate("crm-quotations?status=draft")}
                    className="flex items-center justify-between py-2 border-b border-[#F0F0ED] cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors"
                  >
                    <span className="text-[12px] text-[#737373]">Draft Quotations</span>
                    <span className="text-[14px] font-black text-[#04314A]">
                      {fmt(stats.crm.quotations.draft)}
                    </span>
                  </div>
                  <div
                    onClick={() => onNavigate("crm-quotations?status=sent")}
                    className="flex items-center justify-between py-2 border-b border-[#F0F0ED] cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors"
                  >
                    <span className="text-[12px] text-[#737373]">Sent to Customer</span>
                    <span className="text-[14px] font-black text-[#00AAEB]">
                      {fmt(stats.crm.quotations.sent)}
                    </span>
                  </div>
                  <div
                    onClick={() => onNavigate("crm-quotations?status=accepted")}
                    className="flex items-center justify-between py-2 border-b border-[#F0F0ED] cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors"
                  >
                    <span className="text-[12px] text-[#737373]">Accepted & Approved</span>
                    <span className="text-[14px] font-black text-[#04314A]">
                      {fmt(stats.crm.quotations.accepted)}
                    </span>
                  </div>
                  <div
                    onClick={() => onNavigate("crm-quotations?status=rejected")}
                    className="flex items-center justify-between py-2 cursor-pointer hover:bg-[#FAFAF8] px-2 -mx-2 rounded transition-colors"
                  >
                    <span className="text-[12px] text-[#737373]">Rejected / Expired</span>
                    <span className="text-[14px] font-black text-[#737373]">
                      {fmt(stats.crm.quotations.rejected)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
                  <span className="text-[12px] text-[#737373]">Total Quotations</span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    {fmt(stats.crm.quotations.total)}
                  </span>
                </div>
              </Section>
            )}

            {/* Test Drives */}
            {stats?.crm?.test_drives && (
              <Section
                title="Test Drive Bookings"
                subtitle="Customer EV test drive schedules"
                action="Test Drives"
                onAction={() => onNavigate("crm-testdrives")}
              >
                <div
                  onClick={() => onNavigate("crm-testdrives?status=scheduled")}
                  className="p-5 flex flex-col justify-between h-[180px] cursor-pointer hover:bg-[#FAFAF8] transition-colors"
                >
                  <div>
                    <div className="text-[36px] font-black text-[#04314A]">
                      {fmt(stats.crm.test_drives.upcoming)}
                    </div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#00AAEB] mt-1">
                      Upcoming Test Drives Scheduled
                    </div>
                  </div>
                  <p className="text-[12px] text-[#737373]">
                    Ensure test vehicles are charged and inspection cleared before customer arrival.
                  </p>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E8E8E5] bg-[#FAFAF8]">
                  <span className="text-[12px] text-[#737373]">Total Bookings</span>
                  <span className="text-[13px] font-black text-[#04314A]">
                    {fmt(stats.crm.test_drives.total)}
                  </span>
                </div>
              </Section>
            )}
          </div>

          {/* Recent Leads Table */}
          {leads?.recent && leads.recent.length > 0 && (
            <Section
              title="Recent Lead Inquiries"
              subtitle="Latest prospective buyers across digital, walk-in, and referral channels"
              action="Open CRM"
              onAction={() => onNavigate("crm-leads")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Prospect Name", "Phone", "Vehicle Interest", "Source", "Status", "Date"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.recent.map((lead) => (
                      <tr
                        key={lead.id}
                        className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                        onClick={() => onNavigate(`crm-leads/${lead.id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="text-[13px] font-bold text-[#04314A]">
                            {lead.name}
                          </div>
                          {lead.email && (
                            <div className="text-[11px] text-[#737373]">{lead.email}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {lead.phone}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] font-medium text-[#04314A]">
                          {lead.vehicle || "General"}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {lead.source}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#00AAEB]">
                            {LEAD_STATUS_LABEL[lead.status] || lead.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {relativeDate(lead.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: QUOTE REQUESTS & INBOUND ENQUIRIES                            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "quotes" && (
        <div className="space-y-6">
          {/* Quote Requests Table */}
          {quotes && (
            <Section
              title="Official Quote Requests"
              subtitle="Formal quotation inquiries submitted from vehicle catalog pages"
              action="Manage Quotes"
              onAction={() => onNavigate("quote-requests")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Customer / Company", "Contact Details", "Requested Vehicle", "Message Snippet", "Received", "Status", "Action"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.recent && quotes.recent.length > 0 ? (
                      quotes.recent.map((q) => (
                        <tr
                          key={q.id}
                          className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]"
                        >
                          <td className="px-5 py-3.5">
                            <div className="text-[13px] font-bold text-[#04314A]">
                              {q.name}
                            </div>
                            {q.company && (
                              <div className="text-[11px] text-[#737373]">{q.company}</div>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            <div>{q.phone}</div>
                            {q.email && <div className="text-[11px]">{q.email}</div>}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] font-bold text-[#00AAEB]">
                            {q.vehicle}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373] max-w-xs truncate">
                            {q.message || "-"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                            {relativeDate(q.created_at)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={q.status} />
                          </td>
                          <td className="px-5 py-3.5">
                            <button
                              onClick={() => onNavigate("quote-requests")}
                              className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#00AAEB] hover:text-[#04314A]"
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-[12px] text-[#737373]">
                          No pending quote requests.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* General Contact Enquiries Table */}
          {enq && (
            <Section
              title="General Contact Enquiries"
              subtitle="Questions and messages submitted via the contact page"
              action="View Enquiries"
              onAction={() => onNavigate("enquiries")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                      {["Sender Name", "Phone / Email", "Topic / Vehicle", "Message", "Received", "Status"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {enq.recent && enq.recent.length > 0 ? (
                      enq.recent.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]"
                        >
                          <td className="px-5 py-3.5">
                            <div className="text-[13px] font-bold text-[#04314A]">
                              {e.name}
                            </div>
                            {e.company && (
                              <div className="text-[11px] text-[#737373]">{e.company}</div>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                            <div>{e.phone}</div>
                            {e.email && <div className="text-[11px]">{e.email}</div>}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#04314A]">
                            {e.vehicle || "General Inquiry"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373] max-w-sm truncate">
                            {e.message || "-"}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                            {relativeDate(e.created_at)}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={e.status} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-[12px] text-[#737373]">
                          No contact enquiries at this time.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* TAB 5: WORKSHOP & SERVICING                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "workshop" && (
        <div className="space-y-6">
          {svc && (
            <>
              {/* Servicing KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: "Received", count: svc.received, status: "received" },
                  { label: "In Progress", count: svc.in_progress, status: "in_progress" },
                  { label: "Waiting for Parts", count: svc.waiting_for_parts, status: "waiting_for_parts" },
                  { label: "Completed", count: svc.completed, status: "completed" },
                  { label: "Delivered", count: svc.delivered, status: "delivered" },
                ].map((s) => (
                  <div
                    key={s.label}
                    onClick={() => onNavigate(`servicing?status=${s.status}`)}
                    className="bg-white border border-[#E8E8E5] p-4 cursor-pointer hover:border-[#00AAEB] transition-colors"
                  >
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#737373]">
                      {s.label}
                    </div>
                    <div className="text-[28px] font-black text-[#04314A] mt-2">
                      {fmt(s.count)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Service Records Table */}
              <Section
                title="Workshop Vehicle Repair Orders (VRO)"
                subtitle="Live status of EV repairs, routine maintenance, and parts replacements"
                action="Full Workshop"
                onAction={() => onNavigate("servicing")}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                        {["VRO Number", "Chassis Number", "Customer Name", "Job Description", "Received Date", "Est. Cost", "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373]"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {svc.recent && svc.recent.length > 0 ? (
                        svc.recent.map((rec) => (
                          <tr
                            key={rec.id}
                            className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                            onClick={() => onNavigate(`servicing?vro=${encodeURIComponent(rec.vro_no || rec.id)}`)}
                          >
                            <td className="px-5 py-3.5 text-[12px] font-bold text-[#04314A]">
                              {rec.vro_no}
                            </td>
                            <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                              {rec.chassis_number}
                            </td>
                            <td className="px-5 py-3.5 text-[12px] font-medium text-[#04314A]">
                              {rec.customer_name || "Walk-in"}
                            </td>
                            <td className="px-5 py-3.5 text-[12px] text-[#737373] max-w-sm truncate">
                              {rec.job_description || "Routine service / Inspection"}
                            </td>
                            <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                              {relativeDate(rec.date_received)}
                            </td>
                            <td className="px-5 py-3.5 text-[12px] font-bold text-[#04314A] tabular-nums">
                              {rec.estimated_cost ? fmtMoney(rec.estimated_cost) : "-"}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#04314A]">
                                {SERVICE_STATUS_LABEL[rec.status] || rec.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-5 py-6 text-center text-[12px] text-[#737373]">
                            No active service records.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── StatusBadge helper ─────────────────────────────────────────────────── */
export function StatusBadge({ status }: { status: string }) {
  const norm = (status || "").toLowerCase();
  return (
    <Badge status={norm} size="sm">
      {status === "in_progress" ? "In Progress" : status.replace(/_/g, " ")}
    </Badge>
  );
}
