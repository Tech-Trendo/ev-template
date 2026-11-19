import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, LayoutGrid, List } from "lucide-react";
import {
  crm,
  formatNpr,
  relativeDay,
  type Opportunity,
  type Stage,
} from "./data";
import { useCrmMeta, useUserOptions, useVehicleOptions } from "./useOptions";
import { Badge, PageHeader, Pagination, TableState, inputCls, selectCls, useToast } from "./ui";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

function PipelineBoard({
  opportunities,
  onMove,
  stages,
  stageLabels,
}: {
  opportunities: Opportunity[];
  onMove: (id: string, stage: Stage) => void;
  stages: string[];
  stageLabels: Record<string, string>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = opportunities.filter((o) => o.stage === stage);
        const total = items.reduce((s, o) => s + o.value, 0);
        return (
          <div
            key={stage}
            onDragOver={(e) => { e.preventDefault(); setOverStage(stage as Stage); }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => { if (dragId) onMove(dragId, stage as Stage); setDragId(null); setOverStage(null); }}
            className={`flex-shrink-0 w-[270px] bg-white border ${overStage === stage ? "border-[#00AAEB]" : "border-[#E8E8E5]"}`}
          >
            <div className="px-4 py-3 border-b border-[#E8E8E5]">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold tracking-[0.12em] uppercase ${stage === "won" ? "text-[#00AAEB]" : stage === "lost" ? "text-[#737373]" : "text-[#04314A]"}`}>
                  {stageLabels[stage] ?? stage}
                </span>
                <span className="text-[10px] font-bold text-[#B0B0AA]">{items.length}</span>
              </div>
              {total > 0 && <span className="block mt-1 text-[10px] text-[#737373]">{formatNpr(total)}</span>}
            </div>
            <div className="p-3 flex flex-col gap-3 min-h-[120px] max-h-[560px] overflow-y-auto">
              {items.map((o) => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  className={`bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-3.5 cursor-grab active:cursor-grabbing hover:border-[#04314A] transition-colors ${
                    dragId === o.id ? "opacity-40" : ""
                  }`}
                >
                  <p className="text-[12px] font-bold text-[#04314A] leading-snug">{o.title}</p>
                  {o.company && <p className="text-[10px] text-[#737373] mt-0.5">{o.company}</p>}
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#737373]">
                    <span className="font-semibold text-[#04314A]">{formatNpr(o.value)}</span>
                    <span>{o.vehicle}</span>
                    <span>· {Math.round(o.probability)}%</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[#737373]">
                    <span>{o.assignedTo.split(" ")[0]}</span>
                    <span>{relativeDay(o.lastActivity)}</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-center text-[11px] text-[#B0B0AA] py-6">Drop cards here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [search, setSearch] = useState("");
  const [stageF, setStageF] = useState("all");
  const [vehicleF, setVehicleF] = useState("all");
  const [assigneeF, setAssigneeF] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const toast = useToast();
  const vehicles = useVehicleOptions();
  const salespeople = useUserOptions();
  const meta = useCrmMeta();

  useEffect(() => {
    crm.opportunities()
      .then(setOpps)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      opps.filter((o) => {
        if (stageF !== "all" && o.stage !== stageF) return false;
        if (vehicleF !== "all" && o.vehicle !== vehicleF) return false;
        if (assigneeF !== "all" && o.assignedTo !== assigneeF) return false;
        if (search && !`${o.title} ${o.customerName} ${o.company}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [opps, search, stageF, vehicleF, assigneeF],
  );

  const move = async (id: string, stage: Stage) => {
    const opp = opps.find((o) => o.id === id);
    if (!opp || opp.stage === stage) return;
    // optimistic update
    setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      await crm.updateOpportunityStage(id, stage);
      toast.push(`${opp.id} moved to ${meta.stageLabels[stage] ?? stage}.`);
    } catch {
      setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, stage: opp.stage } : o)));
      toast.push("Stage update failed.");
    }
  };

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const cols = ["Opportunity", "Customer", "Vehicle", "Stage", "Est. Value", "Probability", "Expected Close", "Assigned To", "Last Activity", ""];

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Opportunities."
        subtitle="Drag cards between stages or use the table to update deal progress."
        action={
          <div className="flex border border-[#E8E8E5] rounded-xl bg-white">
            {[
              { key: "pipeline" as const, icon: <LayoutGrid size={14} />, label: "Pipeline" },
              { key: "table" as const, icon: <List size={14} />, label: "Table" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  view === v.key ? "rounded-full bg-[#04314A] text-white" : "text-[#737373] hover:text-[#04314A]"
                }`}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0B0AA]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search opportunity, customer…" className={`${inputCls} pl-10`} />
        </div>
        {[
          { value: stageF, set: setStageF, options: ["all", ...meta.stages], labels: ["All Stages", ...meta.stages.map((s) => meta.stageLabels[s] ?? s)], minW: "min-w-[140px]" },
          { value: vehicleF, set: setVehicleF, options: ["all", ...vehicles], labels: ["All Vehicles", ...vehicles], minW: "min-w-[140px]" },
          { value: assigneeF, set: setAssigneeF, options: ["all", ...salespeople], labels: ["All Salespersons", ...salespeople], minW: "min-w-[160px]" },
        ].map((f, i) => (
          <div key={i} className="relative">
            <select value={f.value} onChange={(e) => f.set(e.target.value)} className={`${selectCls} ${f.minW}`}>
              {f.options.map((o, j) => (
                <option key={o} value={o}>{f.labels[j]}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>
      )}

      {view === "pipeline" ? (
        loading ? (
          <p className="text-[13px] text-[#737373]">Loading…</p>
        ) : filtered.length === 0 && !error ? (
          <div className="bg-white border border-[#E8E8E5] rounded-xl px-6 py-14 text-center text-[13px] text-[#737373]">
            No opportunities match your filters.
          </div>
        ) : (
          <PipelineBoard opportunities={filtered} onMove={move} stages={meta.stages} stageLabels={meta.stageLabels} />
        )
      ) : (
        <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
          <table className="w-full text-left min-w-[1180px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {cols.map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TableState colSpan={cols.length} loading={loading} empty={!loading && rows.length === 0} error={error} />
              {!loading &&
                rows.map((o) => (
                  <tr key={o.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-bold text-[#04314A]">{o.title}</div>
                      <div className="text-[10px] text-[#B0B0AA]">{o.id}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{o.customerName}{o.company ? ` · ${o.company}` : ""}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{o.vehicle}</td>
                    <td className="px-5 py-3.5">
                      <select
                        value={o.stage}
                        onChange={(e) => move(o.id, e.target.value as Stage)}
                        className="border border-[#E8E8E5] rounded-xl bg-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#04314A] focus:outline-none focus:border-[#00AAEB] cursor-pointer"
                        aria-label={`Change stage for ${o.id}`}
                      >
                        {meta.stages.map((s) => (
                          <option key={s} value={s}>{meta.stageLabels[s] ?? s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#04314A] whitespace-nowrap">{formatNpr(o.value)}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{Math.round(o.probability)}%</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{o.closeDate.slice(0, 10)}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{o.assignedTo}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{relativeDay(o.lastActivity)}</td>
                    <td className="px-5 py-3.5 text-right"><Badge status={o.stage} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageCount={pageCount}
            onPage={setPage}
            total={filtered.length}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </div>
      )}
      {toast.node}
    </div>
  );
}
