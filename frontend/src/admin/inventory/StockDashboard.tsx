import { useEffect, useState } from "react";
import { AlertTriangle, Boxes, Download, TrendingUp, Truck } from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  fetchStockAging,
  fetchStockBatches,
  fetchStockSummary,
  formatDate,
  getModelDisplayName,
  type StockSummary,
} from "@/lib/inventory";
import { PageHeader, useToast } from "../crm/ui";

function Kpi({ label, value, accent, sub }: { label: string; value: number; accent?: boolean; sub?: string }) {
  return (
    <div className={`bg-white border rounded-xl px-4 py-3.5 ${accent ? "border-[#10B981]/40 bg-[#10B981]/[0.02]" : "border-[#E8E8E5]"}`}>
      <div className={`text-[22px] font-black tracking-tight ${accent ? "text-[#10B981]" : "text-[#0B3D2B]"}`}>
        {value}
      </div>
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] mt-0.5">
        {label}
      </div>
      {sub && <div className="text-[10px] text-[#737373] mt-1 font-medium">{sub}</div>}
    </div>
  );
}

export default function StockDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [batches, setBatches] = useState<Awaited<ReturnType<typeof fetchStockBatches>>>([]);
  const [aging, setAging] = useState<Awaited<ReturnType<typeof fetchStockAging>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string> = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    Promise.all([fetchStockSummary(params), fetchStockBatches(), fetchStockAging()])
      .then(([s, b, a]) => {
        setSummary(s);
        setBatches(b);
        setAging(a);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const k = summary?.kpis ?? {};
  const totalImported = k.total_imported ?? 0;
  const totalSold = k.sold ?? 0;
  const remainingStock = k.remaining ?? 0;
  const sellThroughRate = totalImported > 0 ? Math.round((totalSold / totalImported) * 100) : 0;
  const maxTrend = Math.max(1, ...(summary?.trend.map((t) => Math.max(t.imported, t.sold)) ?? [1]));

  const exportStockCsv = () => {
    if (!summary) return;
    const lines: string[] = [
      "EV OS - VEHICLE STOCK & IMPORT REPORT",
      `Generated on: ${new Date().toLocaleString()}`,
      "",
      "EXECUTIVE SUMMARY",
      `Total Imported,${totalImported}`,
      `Total Sold,${totalSold}`,
      `Remaining Stock Left,${remainingStock}`,
      `Sell-Through Rate,${sellThroughRate}%`,
      `Ready for Sale,${k.ready_for_sale ?? 0}`,
      `In Warehouse,${k.in_warehouse ?? 0}`,
      `Reserved,${k.reserved ?? 0}`,
      `Under PDI,${k.pdi_pending ?? 0}`,
      `In Transit from China,${k.in_transit ?? 0}`,
      "",
      "STOCK BY MODEL",
      "Brand,Model,Total Imported,Total Sold,Remaining Left,Reserved,Low Stock Alert",
      ...(summary.by_model.map((m) =>
        `"${m.brand}","${getModelDisplayName(m)}",${m.imported},${m.sold},${m.remaining},${m.reserved},${m.low_stock ? "YES" : "NO"}`
      )),
      "",
      "BATCHES FROM CHINA",
      "Batch No,Origin,Arrived Date,Imported,Sold,Remaining,% Sold",
      ...(batches.map((b) =>
        `"${b.batch_no}","${b.origin}","${b.arrived_date || "In Transit"}",${b.imported},${b.sold},${b.remaining},${b.pct_sold}%`
      )),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `vehicle-template-stock-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.push("Stock CSV report downloaded");
  };

  return (
    <div>
      <PageHeader
        eyebrow="Inventory Management"
        title="Stock."
        subtitle="Real-time vehicle stock position, China import batches, and sales performance."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={exportStockCsv}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#E8E8E5] bg-white text-[#0B3D2B] text-[12px] font-semibold hover:border-[#0B3D2B] transition-colors"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={() => onNavigate("china-transport")}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#10B981] text-[#10B981] bg-sky-50/50 text-[12px] font-semibold hover:bg-[#10B981] hover:text-white transition-colors"
            >
              <Truck size={14} /> China Shipments
            </button>
            <button
              onClick={() => onNavigate("units")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors"
            >
              <Boxes size={14} /> View Units
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
          title="Imported/sold from"
        />
        <span className="text-[11px] text-[#737373]">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
          title="Imported/sold to"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="text-[11px] font-semibold text-[#10B981] hover:underline px-2"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
          {error}
        </p>
      )}

      {loading && !summary ? (
        <p className="py-16 text-center text-[13px] text-[#737373]">Loading stock…</p>
      ) : (
        <>
          {/* Three Core Numbers: Imported, Sold, Remaining Left */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border-2 border-[#0B3D2B] rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#737373] mb-1">
                1. Total Vehicles Imported
              </div>
              <div className="text-[36px] font-black text-[#0B3D2B] tracking-tight">
                {totalImported}
              </div>
              <p className="text-[12px] text-[#737373] mt-1">
                Imported from China factories across {batches.length} consignments
              </p>
            </div>

            <div className="bg-white border-2 border-[#10B981] rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#10B981] mb-1">
                2. Total Vehicles Sold
              </div>
              <div className="text-[36px] font-black text-[#10B981] tracking-tight">
                {totalSold}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[12px] text-[#737373]">
                <span className="inline-flex items-center gap-1 font-semibold text-[#10B981]">
                  <TrendingUp size={13} /> {sellThroughRate}% Sell-through
                </span>
                <span>({k.sold_this_month ?? 0} sold this month)</span>
              </div>
            </div>

            <div className="bg-white border border-[#E8E8E5] rounded-2xl p-6 shadow-xs relative overflow-hidden">
              <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#0B3D2B] mb-1">
                3. Current Stock Left (Available)
              </div>
              <div className="text-[36px] font-black text-[#0B3D2B] tracking-tight">
                {remainingStock}
              </div>
              <p className="text-[12px] text-[#737373] mt-1">
                {k.ready_for_sale ?? 0} ready for sale · {k.reserved ?? 0} reserved · {k.in_warehouse ?? 0} in yard
              </p>
            </div>
          </div>

          {/* Detailed Status Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Kpi label="Ready for sale" value={k.ready_for_sale ?? 0} accent sub="PDI passed & inspected" />
            <Kpi label="Reserved / Booked" value={k.reserved ?? 0} sub="Customer deposits held" />
            <Kpi label="In warehouse" value={k.in_warehouse ?? 0} sub="At central stockyard" />
            <Kpi label="PDI pending" value={k.pdi_pending ?? 0} sub="Under inspection" />
            <Kpi label="In transit from China" value={k.in_transit ?? 0} sub="En route to destination" />
            <Kpi label="Returned / Scrapped" value={(k.returned ?? 0) + (k.scrapped ?? 0)} sub="Service / write-off" />
          </div>

          {(summary?.low_stock_alerts.length ?? 0) > 0 && (
            <div className="mb-6 bg-white border border-[#E8E8E5] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2 text-[#0B3D2B]">
                <AlertTriangle size={15} className="text-[#10B981]" />
                <span className="text-[12px] font-bold tracking-[0.08em] uppercase">
                  Low stock alerts
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {summary!.low_stock_alerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onNavigate(`units?model=${a.id}`)}
                    className="px-3 py-1.5 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] text-[12px] font-semibold text-[#0B3D2B] hover:border-[#10B981]"
                  >
                    {getModelDisplayName(a)} — {a.remaining} left (min {a.threshold})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {/* By model */}
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-4">
                Stock by model
              </h3>
              <div className="space-y-3">
                {(summary?.by_model ?? []).map((m) => (
                  <div key={m.id}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-bold text-[#0B3D2B]">
                        {getModelDisplayName(m)}
                        {m.low_stock && m.imported > 0 && (
                          <span className="ml-2 text-[11px] font-semibold text-[#10B981]">
                            [Low Stock]
                          </span>
                        )}
                      </span>
                      <span className="text-[#737373] font-medium">
                        {m.remaining} left · {m.sold}/{m.imported} sold
                        {m.reserved > 0 && ` · ${m.reserved} reserved`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F0F0ED] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#10B981]"
                        style={{ width: `${m.imported ? Math.round((m.sold / m.imported) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(summary?.by_model.length ?? 0) === 0 && (
                  <p className="text-[12px] text-[#B0B0AA]">No models yet.</p>
                )}
              </div>
            </div>

            {/* Trend */}
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-1">
                Imported vs sold
              </h3>
              <p className="text-[11px] text-[#B0B0AA] mb-4">Last 12 months</p>
              <div className="flex items-end gap-1.5 h-36">
                {(summary?.trend ?? []).map((t) => (
                  <div key={t.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="w-full flex gap-0.5 items-end justify-center flex-1">
                      <div
                        className="w-1/2 max-w-3 rounded-t bg-[#0B3D2B]"
                        style={{ height: `${Math.round((t.imported / maxTrend) * 100)}%`, minHeight: t.imported ? 3 : 0 }}
                        title={`${t.month}: ${t.imported} imported`}
                      />
                      <div
                        className="w-1/2 max-w-3 rounded-t bg-[#10B981]"
                        style={{ height: `${Math.round((t.sold / maxTrend) * 100)}%`, minHeight: t.sold ? 3 : 0 }}
                        title={`${t.month}: ${t.sold} sold`}
                      />
                    </div>
                    <span className="text-[8px] text-[#B0B0AA] font-medium">
                      {t.month.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-3 text-[11px] font-medium text-[#737373]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#0B3D2B]" /> Imported
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]" /> Sold
                </span>
              </div>
            </div>
          </div>

          {/* Batch table */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto mb-6">
            <h3 className="px-5 pt-4 text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B]">
              Batches
            </h3>
            <table className="w-full text-left min-w-[720px] mt-2">
              <thead>
                <tr className="border-b border-[#E8E8E5]">
                  {["Batch", "Origin", "Arrived", "Imported", "Sold", "Remaining", "% Sold"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] cursor-pointer"
                    onClick={() => onNavigate(`batches/${b.id}`)}
                  >
                    <td className="px-5 py-3 text-[13px] font-bold text-[#10B981]">{b.batch_no}</td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">{b.origin || "—"}</td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">{formatDate(b.arrived_date)}</td>
                    <td className="px-5 py-3 text-[12px] font-semibold text-[#0B3D2B]">{b.imported}</td>
                    <td className="px-5 py-3 text-[12px] font-semibold text-[#0B3D2B]">{b.sold}</td>
                    <td className="px-5 py-3 text-[12px] font-semibold text-[#0B3D2B]">{b.remaining}</td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">{b.pct_sold}%</td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-[13px] text-[#737373]">
                      No import batches yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Aging */}
          <div className="grid lg:grid-cols-2 gap-4">
            {[
              { title: "Longest in warehouse", rows: aging?.warehouse ?? [] },
              { title: "PDI pending longest", rows: aging?.pdi_pending ?? [] },
            ].map((block) => (
              <div key={block.title} className="bg-white border border-[#E8E8E5] rounded-xl p-5">
                <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-3">
                  {block.title}
                </h3>
                {block.rows.length === 0 ? (
                  <p className="text-[12px] text-[#B0B0AA]">Nothing waiting.</p>
                ) : (
                  <ul className="divide-y divide-[#F0F0ED]">
                    {block.rows.slice(0, 8).map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => onNavigate(`units/${r.id}`)}
                          className="w-full flex items-center justify-between py-2 text-left hover:text-[#10B981]"
                        >
                          <span>
                            <span className="block text-[12px] font-bold text-[#0B3D2B]">
                              {r.vin_chassis_no}
                            </span>
                            <span className="block text-[11px] text-[#737373]">{r.model}</span>
                          </span>
                          <span className="text-[12px] font-semibold text-[#0B3D2B] whitespace-nowrap">
                            {r.days_in_stock}d
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {toast.node}
    </div>
  );
}
