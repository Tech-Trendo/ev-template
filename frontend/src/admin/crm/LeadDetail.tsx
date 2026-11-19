import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  Car,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { fetchUnits, formatNPR, type UnitListItem } from "@/lib/inventory";
import {
  crm,
  formatDate,
  formatDateTime,
  formatNpr,
  relativeDay,
  type Activity,
  type Customer,
  type Lead,
  type LeadStatus,
  type Quotation,
  type TestDrive,
} from "./data";
import { useCrmMeta } from "./useOptions";
import { Badge, PageHeader, ghostBtnCls, primaryBtnCls } from "./ui";
import { AddActivityModal } from "./modals";
import { EntityLink } from "../components/pickers";
import { useAuth } from "../AuthContext";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] mb-1">{label}</span>
      <span className="text-[13px] font-medium text-[#04314A]">{value || "-"}</span>
    </div>
  );
}

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const meta = useCrmMeta();
  if (activities.length === 0) {
    return <p className="px-6 py-8 text-[13px] text-[#737373]">No activity yet. Log the first touchpoint.</p>;
  }
  const groups = new Map<string, Activity[]>();
  for (const a of [...activities].sort((x, y) => y.datetime.localeCompare(x.datetime))) {
    const key = relativeDay(a.datetime);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  return (
    <div className="px-6 py-5 flex flex-col gap-6">
      {[...groups.entries()].map(([day, items]) => (
        <div key={day}>
          <h4 className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373] mb-3">{day}</h4>
          <div className="border-l-2 border-[#F0F0ED] pl-4 flex flex-col gap-4">
            {items.map((a) => (
              <div key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#00AAEB]" />
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[9px] font-bold tracking-[0.1em] uppercase px-2 py-0.5 rounded-full ${a.type === "status_change" || a.type === "lead_created" ? "bg-[#04314A] text-white" : "bg-[#F0F0ED] text-[#04314A]"}`}>
                    {a.type === "lead_created" ? "Lead Created" : meta.activityLabels[a.type] ?? a.type}
                  </span>
                  <span className="text-[11px] text-[#737373]">
                    {new Date(a.datetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {a.user}
                  </span>
                </div>
                <p className="text-[13px] font-bold text-[#04314A]">{a.subject}</p>
                {a.description && <p className="text-[12px] text-[#737373] leading-relaxed">{a.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadPipelineStepper({
  currentStatus,
  onSelectStatus,
  disabled,
}: {
  currentStatus: LeadStatus;
  onSelectStatus?: (status: LeadStatus) => void;
  disabled?: boolean;
}) {
  const steps: { key: LeadStatus; label: string; desc: string }[] = [
    { key: "new", label: "New Lead", desc: "Inquiry received" },
    { key: "contacted", label: "Contacted", desc: "Initial contact made" },
    { key: "qualified", label: "Qualified", desc: "Verified interest" },
    { key: "converted", label: "Converted", desc: "Ready to buy (Customer)" },
  ];

  if (currentStatus === "lost") {
    return (
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 mb-6 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373] block mb-0.5">
            Lead Qualification Stage
          </span>
          <span className="text-[13px] font-bold text-[#737373]">
            Disqualified / Lost
          </span>
        </div>
        {onSelectStatus && (
          <button
            onClick={() => onSelectStatus("new")}
            className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
          >
            Re-open Lead →
          </button>
        )}
      </div>
    );
  }

  const activeIdx = steps.findIndex((s) => s.key === currentStatus);
  const currentIndex = activeIdx >= 0 ? activeIdx : 0;

  return (
    <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[#F0F0ED]">
        <div>
          <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#737373] block mb-0.5">
            Lead Qualification Stage
          </span>
          <span className="text-[13px] font-black text-[#04314A]">
            {steps[currentIndex]?.label || "New Lead"}
          </span>
        </div>
        <div className="text-[11px] text-[#737373]">
          {currentStatus === "converted"
            ? "Lead converted to active customer. Transacting occurs on customer profile."
            : "Leads qualify buyer interest. Once ready to buy, convert the lead to a Customer."}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <button
              type="button"
              key={step.key}
              disabled={disabled || isCurrent || currentStatus === "converted"}
              onClick={() => onSelectStatus?.(step.key)}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                isCurrent
                  ? "border-[#00AAEB] bg-[#F7FCFE]"
                  : isCompleted
                  ? "border-[#04314A] bg-[#F4F7F9] hover:border-[#00AAEB]"
                  : "border-[#E8E8E5] bg-white opacity-70 hover:opacity-100 hover:border-[#00AAEB]"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {isCompleted ? (
                  <span className="w-4 h-4 rounded-full bg-[#04314A] text-white flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                ) : (
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCurrent
                        ? "bg-[#00AAEB] text-white"
                        : "bg-[#E8E8E5] text-[#737373]"
                    }`}
                  >
                    {idx + 1}
                  </span>
                )}
                <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">
                  Step {idx + 1}
                </span>
              </div>
              <div
                className={`text-[12px] font-bold ${
                  isCurrent
                    ? "text-[#00AAEB]"
                    : isCompleted
                    ? "text-[#04314A]"
                    : "text-[#737373]"
                }`}
              >
                {step.label}
              </div>
              <p className="text-[10px] text-[#737373] mt-0.5">{step.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LeadDetail({
  leadId,
  onNavigate,
}: {
  leadId: string;
  onNavigate: (page: string) => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchasedUnits, setPurchasedUnits] = useState<UnitListItem[]>([]);
  const [serviceRecords, setServiceRecords] = useState<any[]>([]);
  const [testDrives, setTestDrives] = useState<TestDrive[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"activity" | null>(null);
  const toastState = useState("");
  const toastMsg = toastState[0];
  const { me } = useAuth();
  const currentUserName =
    (me?.first_name || me?.last_name
      ? `${me.first_name || ""} ${me.last_name || ""}`.trim()
      : me?.username) ||
    (() => {
      try {
        return localStorage.getItem("vt_username") || "";
      } catch {
        return "";
      }
    })() ||
    "";
  const meta = useCrmMeta();

  const loadData = useCallback(() => {
    Promise.all([
      crm.lead(leadId).catch(() => null),
      crm.leads().catch(() => []),
      crm.customers(),
      fetchUnits({ lead: leadId }).catch(() => []),
      api.get<any>(`/api/servicing/records/?lead=${leadId}`).catch(() => []),
      crm.testDrives().catch(() => []),
      crm.quotations().catch(() => []),
    ])
      .then(([singleLead, leads, custs, unitsRes, srvRes, allTds, allQuotes]) => {
        const currentLead =
          singleLead ||
          leads.find((l: any) => String(l.id) === String(leadId)) ||
          null;
        setLead(currentLead);
        setCustomers(custs);
        const uList = Array.isArray(unitsRes) ? unitsRes : (unitsRes as any)?.results ?? [];
        setPurchasedUnits(uList);
        const sList = Array.isArray(srvRes) ? srvRes : (srvRes as any)?.results ?? [];
        setServiceRecords(sList);
        const matchedTds = allTds.filter(
          (t) => String(t.leadId) === String(leadId) || (currentLead && t.customerName === currentLead.name)
        );
        setTestDrives(matchedTds);
        const matchedQuotes = allQuotes.filter(
          (q) => String(q.leadId) === String(leadId) || (currentLead && q.customerName === currentLead.name)
        );
        setQuotations(matchedQuotes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [leadId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadActivities = useCallback(() => {
    if (!lead) return;
    crm.activities({ leadId }).then((acts) => {
      // Prepend synthetic lead_added activity if no real lead-created activity exists.
      const hasLeadCreated = acts.some((a) => a.type === "lead_created" || a.subject.toLowerCase().includes("lead created"));
      if (hasLeadCreated) {
        setActivities(acts);
        return;
      }
      const syntheticLeadCreated: Activity = {
        id: `synthetic-lead-${leadId}`,
        type: "lead_created",
        subject: `Lead ${lead.name.trim() || leadId} created`,
        description: "",
        datetime: lead.createdAt,
        user: lead.createdBy || "System",
        leadId,
      };
      setActivities([syntheticLeadCreated, ...acts]);
    }).catch(() => {});
  }, [leadId, lead]);
  useEffect(loadActivities, [loadActivities]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => toastState[1](""), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastMsg]);

  if (loading) return <p className="text-[13px] text-[#737373]">Loading lead…</p>;
  if (error) return <p className="text-[13px] text-[#00AAEB]">{error}</p>;
  if (!lead)
    return (
      <div>
        <button onClick={() => onNavigate("crm-leads")} className={`${ghostBtnCls} mb-6`}>
          <ArrowLeft size={14} /> Back to Leads
        </button>
        <p className="text-[14px] text-[#737373]">Lead {leadId} not found.</p>
      </div>
    );

  const fullName = lead.name.trim() || "-";
  const whatsappNumber = lead.phone.replace(/[^0-9]/g, "");
  const convertedCustomer = customers.find((c) => c.lead === lead.id);

  const convert = async () => {
    if (!window.confirm(`Convert ${fullName} to a customer?`)) return;
    try {
      const { customer } = await crm.convertLead(lead.id);
      setLead((prev) => (prev ? { ...prev, status: "converted" } : prev));
      loadActivities();
      toastState[1](`Converted to customer ${customer.id}.`);
      onNavigate(`crm-customers/${customer.id}`);
    } catch {
      toastState[1]("Conversion failed.");
    }
  };

  const handleStatusChange = async (targetStatus: LeadStatus) => {
    if (!lead || targetStatus === lead.status) return;
    if (targetStatus === "converted") {
      convert();
      return;
    }
    const prevStatus = lead.status;
    try {
      await crm.updateLead(lead.id, { status: targetStatus });
      setLead((prev) => (prev ? { ...prev, status: targetStatus } : prev));
      toastState[1](`Lead marked as ${meta.leadStatusLabels[targetStatus] ?? targetStatus}.`);
      await crm.addActivity({
        type: "status_change",
        subject: `${fullName} moved to ${meta.leadStatusLabels[targetStatus] ?? targetStatus}`,
        description: `Status changed from ${meta.leadStatusLabels[prevStatus] ?? prevStatus} to ${meta.leadStatusLabels[targetStatus] ?? targetStatus}.`,
        datetime: new Date().toISOString(),
        user: currentUserName,
        leadId: lead.id,
      }).catch(() => {});
      loadActivities();
    } catch {
      toastState[1]("Failed to update status.");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete lead "${fullName}"? This will also permanently delete the linked customer, test drives, quotations, and opportunities.`)) return;
    try {
      await crm.deleteLead(lead.id);
      onNavigate("crm-leads");
    } catch {
      toastState[1]("Delete failed.");
    }
  };

  return (
    <div>
      <button onClick={() => onNavigate("crm-leads")} className={`${ghostBtnCls} mb-6`}>
        <ArrowLeft size={14} /> Back to Leads
      </button>

      {/* Header */}
      <PageHeader
        eyebrow={`Lead LD-${lead.id}`}
        title={fullName}
        subtitle={[
          lead.company,
          lead.vehicle,
          lead.createdBy ? `Added by ${lead.createdBy}` : null,
          `Created ${formatDate(lead.createdAt)}`,
        ].filter(Boolean).join(" · ")}
        action={<Badge status={lead.status} />}
      />

      {/* Pipeline Stepper */}
      <LeadPipelineStepper
        currentStatus={lead.status}
        onSelectStatus={handleStatusChange}
        disabled={lead.status === "converted"}
      />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a href={`tel:${lead.phone}`} className={ghostBtnCls}>
          <Phone size={14} /> Call
        </a>
        <a href={`mailto:${lead.email}`} className={ghostBtnCls}>
          <Mail size={14} /> Email
        </a>
        <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className={ghostBtnCls}>
          <MessageCircle size={14} /> WhatsApp
        </a>
        <button onClick={() => setModal("activity")} className={ghostBtnCls}>
          <Plus size={14} /> Log Activity
        </button>
        {convertedCustomer ? (
          <button onClick={() => onNavigate(`crm-customers/${convertedCustomer.id}`)} className={primaryBtnCls}>
            <UserCheck size={14} /> View Customer Profile
          </button>
        ) : (
          <button onClick={convert} className={primaryBtnCls}>
            <UserCheck size={14} /> Convert to Customer (Ready to Buy)
          </button>
        )}
        <button onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors">
          <Trash2 size={14} /> Delete Lead
        </button>
      </div>

      {convertedCustomer && (
        <div className="mb-6 p-4 bg-[#F4F7F9] border border-[#04314A]/20 rounded-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#04314A] block mb-0.5">
              Converted Customer Active
            </span>
            <p className="text-[13px] text-[#04314A]">
              This lead was converted to customer <span className="font-bold">{convertedCustomer.name}</span>. Test drives, quotations, unit reservations, and vehicle sales are conducted on the Customer profile.
            </p>
          </div>
          <button
            onClick={() => onNavigate(`crm-customers/${convertedCustomer.id}`)}
            className={primaryBtnCls}
          >
            Open Customer Profile →
          </button>
        </div>
      )}

      {toastMsg && (
        <p className="mb-6 text-[12px] font-semibold text-white bg-[#04314A] border-l-2 border-[#00AAEB] px-4 py-3 inline-block">
          {toastMsg}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Lead information */}
        <div className="bg-white border border-[#E8E8E5] rounded-xl">
          <div className="px-6 py-4 border-b border-[#E8E8E5]">
            <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A]">Lead Information</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-6">
            <InfoRow label="Phone" value={<a href={`tel:${lead.phone}`} className="hover:text-[#00AAEB]">{lead.phone}</a>} />
            <InfoRow label="Email" value={<a href={`mailto:${lead.email}`} className="break-all hover:text-[#00AAEB]">{lead.email}</a>} />
            <InfoRow label="Company" value={lead.company} />
            <InfoRow label="Location" value={lead.address} />
            <InfoRow label="Lead Source" value={lead.source} />
            <InfoRow label="Interested Vehicle" value={lead.vehicle} />
            <InfoRow label="Interest Level" value={lead.interestLevelName || "-"} />
            <InfoRow label="Budget" value={lead.budget ? `NPR ${lead.budget.toLocaleString("en-IN")}` : "-"} />
            <InfoRow label="Added By" value={lead.createdBy || "-"} />
            <InfoRow label="Last Activity" value={
              <span className="inline-flex items-center gap-1">
                <Clock size={12} className="text-[#B0B0AA]" /> {relativeDay(lead.lastActivity)}
              </span>
            } />
          </div>
          {lead.notes && (
            <div className="border-t border-[#E8E8E5] px-6 py-5">
              <span className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] mb-2">Notes</span>
              <p className="text-[13px] text-[#04314A] leading-relaxed">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div className="xl:col-span-2 bg-white border border-[#E8E8E5] rounded-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
            <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A]">Activity Timeline</h2>
            <button onClick={() => setModal("activity")} className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#00AAEB] hover:text-[#04314A] transition-colors">
              + Add Activity
            </button>
          </div>
          <ActivityTimeline activities={activities} />
          {activities.length > 0 && (
            <p className="px-6 py-3 border-t border-[#F0F0ED] text-[11px] text-[#B0B0AA]">
              Last updated {formatDateTime(activities[0]?.datetime ?? lead.lastActivity)}
            </p>
          )}
        </div>
      </div>

      {/* Connected Purchased Vehicles & Finance Report */}
      {purchasedUnits.length > 0 && (
        <div className="mt-6 bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
            <div>
              <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A] flex items-center gap-2">
                <Car size={16} className="text-[#00AAEB]" /> Purchased Vehicle & Finance Report
              </h2>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Physical inventory vehicle unit sold to this lead with banking & financing records.
              </p>
            </div>
            <button
              onClick={() => onNavigate("units")}
              className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
            >
              All Units →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Chassis / VIN", "Model", "Sold Date", "Sold Price", "Payment Mode", "Bank / Finance", "Invoice No.", ""].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchasedUnits.map((u) => (
                  <tr key={u.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      <EntityLink type="unit" id={u.id} label={u.vin_chassis_no} onNavigate={onNavigate} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {u.model_detail?.brand} {u.model_detail?.model_name}
                      {u.color && ` (${u.color})`}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {u.sold_date ? formatDate(u.sold_date) : "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      {formatNPR(u.sold_price || u.selling_price || 0)}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#04314A]">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F0F0ED]">
                        {u.payment_mode ? u.payment_mode.replace(/_/g, " ") : "CASH"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {u.finance_bank_name ? (
                        <div>
                          <div className="font-semibold text-[#04314A]">{u.finance_bank_name}</div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {u.tax_invoice_no || "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onNavigate(`units/${u.id}`)}
                        className="text-[12px] font-bold text-[#00AAEB] hover:text-[#04314A]"
                      >
                        Unit Profile →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Connected Servicing Visits */}
      {serviceRecords.length > 0 && (
        <div className="mt-6 bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
            <div>
              <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A] flex items-center gap-2">
                <Wrench size={16} className="text-[#00AAEB]" /> Servicing History & Vehicle Repair Orders (VRO)
              </h2>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Service visits recorded for this lead&apos;s vehicle(s).
              </p>
            </div>
            <button
              onClick={() => onNavigate("servicing")}
              className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
            >
              Servicing Desk →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["VRO No", "Chassis / VIN", "Received", "Delivered", "Duration", "Status", "Job", "Total Cost"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serviceRecords.map((srv) => (
                  <tr key={srv.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      <EntityLink type="vro" id={srv.vro_no || srv.id} label={srv.vro_no || `SRV-${srv.id}`} onNavigate={onNavigate} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.chassis_number ? (
                        <EntityLink type="unit" id={srv.vehicle_unit || srv.chassis_number} label={srv.chassis_number} onNavigate={onNavigate} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.time_received ? formatDateTime(srv.time_received) : formatDate(srv.service_date)}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.actual_delivered_at ? formatDateTime(srv.actual_delivered_at) : "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-semibold text-[#04314A]">
                      {srv.duration_display || "-"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={srv.status.toLowerCase()} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#04314A] max-w-xs truncate">
                      {srv.job_description || srv.notes || "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      {formatNPR(srv.total_cost || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Connected Quotations */}
      {quotations.length > 0 && (
        <div className="mt-6 bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
            <div>
              <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A] flex items-center gap-2">
                <FileText size={16} className="text-[#00AAEB]" /> Quotations
              </h2>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Sales price proposals prepared for this lead.
              </p>
            </div>
            <button
              onClick={() => onNavigate("crm-quotations")}
              className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
            >
              All Quotations
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Quotation No", "Vehicle", "Grand Total", "Status", "Valid Until", ""].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => (
                  <tr key={q.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      <EntityLink type="quotation" id={q.id} label={q.id} onNavigate={onNavigate} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#04314A]">
                      {q.vehicle}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      {formatNpr(crm.quotationTotals(q.item).total)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={q.status} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {q.validUntil ? formatDate(q.validUntil) : "-"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onNavigate(`crm-quotations/${q.id}`)}
                        className="text-[12px] font-bold text-[#00AAEB] hover:text-[#04314A]"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Connected Test Drives */}
      {testDrives.length > 0 && (
        <div className="mt-6 bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
            <div>
              <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A] flex items-center gap-2">
                <CalendarCheck size={16} className="text-[#00AAEB]" /> Scheduled and Completed Test Drives
              </h2>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Trial runs and feedback recorded for this lead.
              </p>
            </div>
            <button
              onClick={() => onNavigate("crm-testdrives")}
              className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
            >
              All Test Drives
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Date and Time", "Vehicle", "Assigned Unit VIN", "Salesperson", "Status", "Notes"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testDrives.map((td) => (
                  <tr key={td.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3 text-[12px] font-bold text-[#04314A]">
                      {td.time ? `${formatDate(td.date)} ${td.time}` : formatDate(td.date)}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#04314A]">
                      {td.vehicle}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {td.unitId ? (
                        <EntityLink type="unit" id={td.unitId} label={td.unitVin || `Unit #${td.unitId}`} onNavigate={onNavigate} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {td.salesperson || "-"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={td.status} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373] max-w-xs truncate">
                      {td.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal === "activity" && (
        <AddActivityModal onClose={() => setModal(null)} onSaved={(m) => { loadActivities(); toastState[1](m); }} leadId={lead.id} customerId={convertedCustomer?.id} />
      )}
    </div>
  );
}
