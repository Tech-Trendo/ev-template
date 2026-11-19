import { useEffect, useMemo, useState } from "react";

// NOTE: users filter now uses useUserOptions() which fetches all users from /api/users/
import { ChevronDown } from "lucide-react";
import { crm, formatDateTime, relativeDay, type Activity, type ActivityTypeCode } from "./data";
import { useCrmMeta, useUserOptions } from "./useOptions";
import { PageHeader, Pagination, TableState, selectCls, useToast, primaryBtnCls } from "./ui";
import { AddActivityModal } from "./modals";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export default function ActivitiesPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [userF, setUserF] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const meta = useCrmMeta();

  useEffect(() => {
    crm.activities()
      .then(setActivities)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  const users = useUserOptions();

  const filtered = useMemo(
    () =>
      activities
        .filter((a) => (typeF === "all" || a.type === typeF) && (userF === "all" || a.user === userF))
        .sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [activities, typeF, userF],
  );

  const pageCount = Math.ceil(filtered.length / pageSize) || 1;
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const cols = ["Date / Time", "Type", "Subject", "Related To", "Description", "User"];

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Activities."
        subtitle="Every call, email, meeting and status change across the pipeline."
        action={
          <button onClick={() => setAdding(true)} className={primaryBtnCls}>
            + Log Activity
          </button>
        }
      />

      {/* Type chips */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {["all", ...meta.activityTypes].map((t) => (
          <button
            key={t}
            onClick={() => { setTypeF(t); setPage(0); }}
            className={`px-3.5 py-1.5 text-[10px] font-bold tracking-[0.08em] uppercase border transition-colors ${
              typeF === t ? "rounded-full bg-[#00AAEB] text-white border-[#00AAEB]" : "border-[#E8E8E5] bg-white text-[#737373] hover:border-[#04314A]"
            }`}
          >
            {t === "all" ? "All" : meta.activityLabels[t as ActivityTypeCode] ?? t}
          </button>
        ))}
        <div className="relative ml-auto">
          <select value={userF} onChange={(e) => { setUserF(e.target.value); setPage(0); }} className={`${selectCls} min-w-[170px]`}>
            {["all", ...users].map((u, i) => (
              <option key={u} value={u}>{i === 0 ? "All Users" : u}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B0B0AA] pointer-events-none" />
        </div>
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
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
              rows.map((a) => (
                <tr key={a.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="block text-[12px] font-semibold text-[#04314A]">{relativeDay(a.datetime)}</span>
                    <span className="text-[11px] text-[#737373]">{formatDateTime(a.datetime).split(" · ")[1]}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase ${a.type === "status_change" ? "rounded-full bg-[#04314A] text-white" : a.type === "quotation" || a.type === "test_drive" ? "rounded-full bg-[#00AAEB] text-white" : "rounded-full bg-[#F0F0ED] text-[#04314A]"}`}>
                      {meta.activityLabels[a.type] ?? a.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] font-bold text-[#04314A] max-w-[280px]">{a.subject}</td>
                  <td className="px-5 py-3.5">
                    {a.leadId ? (
                      <button onClick={() => onNavigate(`crm-leads/${a.leadId}`)} className="text-[12px] text-[#00AAEB] font-semibold hover:text-[#04314A] transition-colors">
                        Lead {a.leadId}
                      </button>
                    ) : a.customerId ? (
                      <button onClick={() => onNavigate(`crm-customers/${a.customerId}`)} className="text-[12px] text-[#00AAEB] font-semibold hover:text-[#04314A] transition-colors">
                        Customer {a.customerId}
                      </button>
                    ) : (
                      <span className="text-[12px] text-[#B0B0AA]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] max-w-[320px] leading-relaxed">{a.description || "—"}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{a.user}</td>
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

      {toast.node}
      {adding && (
        <AddActivityModal
          onClose={() => setAdding(false)}
          onSaved={(m) => {
            crm.activities().then(setActivities);
            toast.push(m);
          }}
        />
      )}
    </div>
  );
}
