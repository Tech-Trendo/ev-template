"use client";

import { useEffect, useState } from "react";
import { Users, Target, CalendarCheck, FileText, Percent, TrendingUp, UserPlus } from "lucide-react";
import { crm, formatNpr, type Stage } from "./data";
import { useCrmMeta } from "./useOptions";
import { PageHeader } from "./ui";
import { NewCustomerModal } from "../components/pickers";

type Overview = Awaited<ReturnType<typeof crm.overview>>;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className={`bg-white border ${accent ? "border-[#10B981]" : "border-[#E8E8E5]"} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#737373]">{label}</span>
        <div className={`w-8 h-8 flex items-center justify-center ${accent ? "rounded-full bg-[#10B981] text-white" : "bg-[#F7F7F5] text-[#0B3D2B]"}`}>
          {icon}
        </div>
      </div>
      <div className="text-[40px] font-black leading-none text-[#0B3D2B]">{value}</div>
    </div>
  );
}

export default function CrmOverview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const meta = useCrmMeta();

  const load = () => {
    setError("");
    crm
      .overview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  };
  useEffect(load, []);

  const maxOppStage = data ? Math.max(...Object.values(data.stageCounts), 1) : 1;

  return (
    <div>
      <PageHeader eyebrow="CRM" title="CRM." subtitle="Manage EV OS's leads, customers and sales pipeline." />

      {error && (
        <p className="text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2 mb-6">{error}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        <StatCard accent icon={<Users size={16} />} label="Total Leads" value={data?.totalLeads ?? "-"} />
        <StatCard icon={<Target size={16} />} label="Qualified Leads" value={data?.qualifiedLeads ?? "-"} />
        <StatCard icon={<TrendingUp size={16} />} label="Open Opportunities" value={data?.openOpportunities ?? "-"} />
        <StatCard icon={<CalendarCheck size={16} />} label="Test Drives" value={data ? `${data.upcomingTestDrives} upcoming` : "-"} />
        <StatCard icon={<FileText size={16} />} label="Active Quotations" value={data?.activeQuotations ?? "-"} />
        <StatCard icon={<Percent size={16} />} label="Conversion Rate" value={data != null ? `${data.conversionRate}%` : "-"} />
      </div>

      {/* Lead Pipeline Stages */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl mt-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
          <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#0B3D2B]">Lead Pipeline Stages</h2>
          <span className="text-[11px] font-semibold text-[#737373]">
            Prospect stages derived from test drives, quotations, and sales
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {meta.pipelineStages.map((stage) => {
            const count = data?.pipelineStageCounts?.[stage] ?? meta.pipelineSummary?.[stage] ?? 0;
            const maxCount = Math.max(...Object.values(data?.pipelineStageCounts ?? meta.pipelineSummary ?? {}), 1);
            return (
              <div
                key={stage}
                className="text-left px-5 py-5 border-b border-r border-[#F0F0ED]"
              >
                <span className="block text-[9px] font-bold tracking-[0.14em] uppercase text-[#737373] mb-2">
                  {meta.pipelineStageLabels[stage] ?? stage}
                </span>
                <span className="block text-[26px] font-black leading-none text-[#0B3D2B]">{count}</span>
                <div className="mt-3 h-1 bg-[#F0F0ED] w-full">
                  <div
                    className={`h-full ${stage === "won" ? "bg-[#0B3D2B]" : stage === "lost" ? "bg-[#B0B0AA]" : "bg-[#10B981]"}`}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Opportunity Pipeline snapshot */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl mt-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
          <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#0B3D2B]">Opportunity Pipeline Snapshot</h2>
          {data && (
            <span className="text-[11px] font-semibold text-[#737373]">
              Open pipeline value: {formatNpr(data.openPipelineValue)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {meta.stages.map((stage) => (
            <div
              key={stage}
              className="text-left px-5 py-5 border-b border-r border-[#F0F0ED]"
            >
              <span className="block text-[9px] font-bold tracking-[0.14em] uppercase text-[#737373] mb-2">
                {meta.stageLabels[stage] ?? stage}
              </span>
              <span className="block text-[26px] font-black leading-none text-[#0B3D2B]">{data?.stageCounts[stage as Stage] ?? 0}</span>
              <div className="mt-3 h-1 bg-[#F0F0ED] w-full">
                <div
                  className={`h-full ${stage === "won" ? "bg-[#0B3D2B]" : stage === "lost" ? "bg-[#B0B0AA]" : "bg-[#10B981]"}`}
                  style={{ width: `${((data?.stageCounts[stage as Stage] ?? 0) / maxOppStage) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
        {[
          { page: "crm-leads", icon: <UserPlus size={15} />, label: "Add New Lead", action: () => onNavigate("crm-leads") },
          { page: "crm-customers", icon: <UserPlus size={15} />, label: "Add Customer", action: () => setCreatingCustomer(true) },
          { page: "crm-testdrives", icon: <CalendarCheck size={15} />, label: "Schedule Test Drive", action: () => onNavigate("crm-testdrives") },
          { page: "crm-customers", icon: <Users size={15} />, label: "Browse Customers", action: () => onNavigate("crm-customers") },
        ].map((a, idx) => (
          <button
            key={`${a.page}-${idx}`}
            onClick={a.action}
            className="bg-white border border-[#E8E8E5] rounded-xl p-5 text-left hover:border-[#0B3D2B] transition-colors group flex items-center justify-between"
          >
            <span className="flex items-center gap-3 text-[13px] font-semibold text-[#0B3D2B]">
              <span className="w-8 h-8 flex items-center justify-center bg-[#F7F7F5] text-[#10B981] group-hover:bg-[#10B981] group-hover:text-white transition-colors">
                {a.icon}
              </span>
              {a.label}
            </span>
            <span className="text-[#B0B0AA]">→</span>
          </button>
        ))}
      </div>

      {creatingCustomer && (
        <NewCustomerModal
          onClose={() => setCreatingCustomer(false)}
          onCreated={(newCust) => {
            setCreatingCustomer(false);
            onNavigate(`crm-customers/${newCust.id}`);
          }}
        />
      )}
    </div>
  );
}

export { StatCard };
