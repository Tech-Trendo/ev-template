import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BookmarkCheck,
  CalendarCheck,
  Car,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Wrench,
  History,
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
  type Quotation,
  type TestDrive,
} from "./data";
import { useCrmMeta } from "./useOptions";
import { Badge, PageHeader, ghostBtnCls, primaryBtnCls } from "./ui";
import { AddActivityModal, ScheduleTestDriveModal, QuotationModal } from "./modals";
import { ReserveUnitModal } from "./ReserveUnitModal";
import { SaleFormModal } from "./SaleFormModal";
import { SaleReceiptModal, type SaleReceiptData } from "./SaleReceiptModal";
import { EntityLink } from "../components/pickers";
import AuditHistoryModal from "../components/AuditHistoryModal";
import DocumentAttachmentWidget from "../documents/DocumentAttachmentWidget";

const TABS = [
  "Overview",
  "Purchased Vehicles",
  "Servicing History",
  "Test Drives",
  "Quotations",
  "Documents",
  "Activity Timeline",
] as const;
type Tab = (typeof TABS)[number];

function EmptyTab({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="inline-flex w-10 h-10 items-center justify-center bg-[#F7F7F5] text-[#B0B0AA] mb-3">{icon}</span>
      <p className="text-[13px] text-[#737373]">{message}</p>
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

export default function CustomerDetail({
  customerId,
  onNavigate,
}: {
  customerId: string;
  onNavigate: (page: string) => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [testDrives, setTestDrives] = useState<TestDrive[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [purchasedUnits, setPurchasedUnits] = useState<UnitListItem[]>([]);
  const [serviceRecords, setServiceRecords] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"testdrive" | "quotation" | "activity" | "reserve" | "sale" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleReceiptData | null>(null);
  const [toastMsg, toastSet] = useState("");

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => toastSet(""), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const loadCustomerData = useCallback(() => {
    setLoading(true);
    // Fetch customer: try direct fetch first, fall back to listing all and matching by id or display_id.
    const fetchCustomer = async () => {
      try {
        const direct = await crm.customer(customerId);
        if (direct) return direct;
      } catch { /* direct fetch failed, fall through */ }
      const all = await crm.customers();
      return (
        all.find((c) => c.id === customerId) ||
        all.find((c) => c.displayId === `CS-${customerId}` || c.displayId === `CU-${customerId}`)
      ) ?? null;
    };
    Promise.allSettled([
      fetchCustomer(),
      crm.testDrives(),
      crm.quotations(),
      crm.activities({ customerId }),
      fetchUnits({ customer: customerId }),
      api.get<any>(`/api/servicing/records/?customer=${customerId}`),
    ]).then(([custResult, tdsResult, qsResult, actsResult, unitsResult, srvResult]) => {
      const cust = custResult.status === "fulfilled" ? custResult.value : null;
      const tds = tdsResult.status === "fulfilled" ? tdsResult.value : [];
      const qs = qsResult.status === "fulfilled" ? qsResult.value : [];
      const acts = actsResult.status === "fulfilled" ? actsResult.value : [];
      const uList = unitsResult.status === "fulfilled" ? (Array.isArray(unitsResult.value) ? unitsResult.value : (unitsResult.value as any)?.results ?? []) : [];
      const sList = srvResult.status === "fulfilled" ? (Array.isArray(srvResult.value) ? srvResult.value : (srvResult.value as any)?.results ?? []) : [];
      setCustomer(cust ?? null);
      // Re-filter using the resolved customer id if it differs from the url param.
      const resolvedId = cust?.id ?? customerId;
      setTestDrives(tds.filter((t) => t.customerId === resolvedId));
      setQuotations(qs.filter((q) => q.customerId === resolvedId));
      setActivities(acts.filter((a) => a.customerId === resolvedId));
      setPurchasedUnits(uList);
      setServiceRecords(sList);
    }).finally(() => setLoading(false));
  }, [customerId]);

  useEffect(() => {
    loadCustomerData();
  }, [loadCustomerData]);

  if (loading) return <p className="text-[13px] text-[#737373]">Loading customer…</p>;
  if (!customer)
    return (
      <div>
        <button onClick={() => onNavigate("crm-customers")} className={`${ghostBtnCls} mb-6`}>
          <ArrowLeft size={14} /> Back to Customers
        </button>
        <p className="text-[14px] text-[#737373]">Customer {customerId} not found.</p>
      </div>
    );

  const whatsappNumber = customer.phone.replace(/[^0-9]/g, "");

  const handleDelete = async () => {
    if (!window.confirm(`Delete customer "${customer.name}"?`)) return;
    try {
      // Customers don't have a delete endpoint exposed via crm yet; navigate back.
      toastSet("Customer deletion not available.");
    } catch {
      toastSet("Delete failed.");
    }
  };

  return (
    <div>
      <button onClick={() => onNavigate("crm-customers")} className={`${ghostBtnCls} mb-6`}>
        <ArrowLeft size={14} /> Back to Customers
      </button>

      <PageHeader
        eyebrow={`Customer CS-${customer.id}`}
        title={customer.name}
        subtitle={[
          customer.company || customer.type,
          customer.phone,
          customer.email,
          customer.location,
          customer.createdByName ? `Entered by: ${customer.createdByName} on ${formatDate(customer.createdAt)}` : null,
        ].filter(Boolean).join(" · ")}
        action={
          <div className="flex items-center gap-2">
            {customer.source === "historical import" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                Imported
              </span>
            )}
            <Badge status={customer.status} />
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 mb-8">
        <a href={`tel:${customer.phone}`} className={ghostBtnCls}><Phone size={14} /> Call</a>
        <a href={`mailto:${customer.email}`} className={ghostBtnCls}><Mail size={14} /> Email</a>
        <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className={ghostBtnCls}><MessageCircle size={14} /> WhatsApp</a>
        <button onClick={() => setModal("activity")} className={ghostBtnCls}><Plus size={14} /> Log Activity</button>
        <button onClick={() => setModal("testdrive")} className={ghostBtnCls}><CalendarCheck size={14} /> Schedule Test Drive</button>
        <button onClick={() => setModal("quotation")} className={ghostBtnCls}><FileText size={14} /> Create Quotation</button>
        <button onClick={() => setModal("reserve")} className={ghostBtnCls}><BookmarkCheck size={14} /> Reserve Unit</button>
        <button onClick={() => setModal("sale")} className={primaryBtnCls}><Car size={14} /> Record Vehicle Sale</button>
        <button onClick={() => onNavigate(`servicing?new=1&customer=${customer.id}`)} className={ghostBtnCls}><Wrench size={14} /> Book Service</button>
        <button onClick={() => setShowHistory(true)} className={ghostBtnCls}><History size={14} /> Change History</button>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors">
          <Trash2 size={14} /> Delete Customer
        </button>
      </div>

      {toastMsg && (
        <p className="mb-6 text-[12px] font-semibold text-white bg-[#04314A] border-l-2 border-[#00AAEB] px-4 py-3 inline-block">
          {toastMsg}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#E8E8E5] mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-[11px] font-bold tracking-[0.1em] uppercase whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t ? "border-[#00AAEB] text-[#00AAEB]" : "border-transparent text-[#737373] hover:text-[#04314A]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#E8E8E5] rounded-xl">
        {tab === "Overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6 p-6">
              {[
                ["Location", customer.location],
                ["Total Purchases", formatNpr(customer.totalPurchases)],
                ["Vehicles", customer.vehicles.length > 0 ? customer.vehicles.join(", ") : "-"],
                ["Active Quotations", String(quotations.filter((q) => ["draft", "sent", "viewed"].includes(q.status)).length)],
                ["Customer Since", formatDate(customer.createdAt)],
                ["Last Activity", formatDate(customer.lastActivity)],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] mb-1">{label}</span>
                  <span className="text-[13px] font-medium text-[#04314A]">{value}</span>
                </div>
              ))}
            </div>
            {customer.notes && (
              <div className="border-t border-[#F0F0ED] px-6 py-5">
                <span className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] mb-2">Notes</span>
                <p className="text-[13px] text-[#04314A] leading-relaxed whitespace-pre-line">{customer.notes}</p>
              </div>
            )}
          </>
        )}

        {tab === "Purchased Vehicles" &&
          (purchasedUnits.length === 0 ? (
            <EmptyTab icon={<Car size={18} />} message="No purchased vehicles linked to this customer yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                    {["Chassis / VIN", "Model", "Sold Date", "Sold Price", "Payment Mode", "Bank Financing", "Next Service", "Invoice", ""].map((h) => (
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
                        {u.color && ` · ${u.color}`}
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
                            <span className="font-semibold text-[#04314A]">{u.finance_bank_name}</span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-5 py-3 text-[12px]">
                        {u.next_service_due?.is_overdue ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">
                            Overdue {u.next_service_due.due_date ? `(${u.next_service_due.due_date})` : ""}
                          </span>
                        ) : u.next_service_due?.status === "due_soon" ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#D97706]">
                            Due Soon {u.next_service_due.due_date ? `(${u.next_service_due.due_date})` : ""}
                          </span>
                        ) : u.next_service_due?.due_date ? (
                          <span className="text-[#04314A] text-[11px] font-medium">
                            {formatDate(u.next_service_due.due_date)}
                          </span>
                        ) : (
                          <span className="text-[#B0B0AA] text-[11px]">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[#737373]">
                        {u.tax_invoice_no || "-"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() =>
                              setReceiptSale({
                                id: u.id,
                                receipt_no: u.tax_invoice_no || `REC-${u.id}`,
                                tax_invoice_no: u.tax_invoice_no || undefined,
                                sale_date: u.sold_date || undefined,
                                customer_name: customer.name,
                                customer_phone: customer.phone,
                                customer_company: customer.company,
                                customer_address: customer.location,
                                unit_vin: u.vin_chassis_no,
                                unit_model_name: `${u.model_detail?.brand || ""} ${u.model_detail?.model_name || ""}`.trim(),
                                color: u.color,
                                motor_no: u.motor_no,
                                selling_price: u.sold_price || u.selling_price || 0,
                                payment_mode: u.payment_mode || "CASH",
                                bank: u.finance_bank_name || undefined,
                                created_by_name: u.created_by_name || undefined,
                                created_at: u.created_at,
                              })
                            }
                            className="text-[12px] font-bold text-[#04314A] hover:text-[#00AAEB]"
                          >
                            Sale Receipt
                          </button>
                          <button
                            onClick={() => onNavigate(`units/${u.id}`)}
                            className="text-[12px] font-bold text-[#00AAEB] hover:text-[#04314A]"
                          >
                            Unit Profile
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === "Servicing History" &&
          (serviceRecords.length === 0 ? (
            <EmptyTab icon={<Wrench size={18} />} message="No servicing visits or repair orders for this customer yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[760px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                    {["VRO No", "Chassis / VIN", "Received", "Delivered", "Duration", "Status", "Job Description", "Total Cost", ""].map((h) => (
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
                        <EntityLink type="vro" id={srv.vro_no || `SRV-${srv.id}`} label={srv.vro_no || `SRV-${srv.id}`} onNavigate={onNavigate} />
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[#737373]">
                        {srv.vehicle_unit || srv.chassis_number ? (
                          <EntityLink type="unit" id={srv.vehicle_unit || srv.chassis_number} label={srv.chassis_number || "View Unit"} onNavigate={onNavigate} />
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
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => onNavigate(`servicing?vro=${srv.vro_no || srv.id}`)}
                          className="text-[12px] font-bold text-[#00AAEB] hover:text-[#04314A]"
                        >
                          Servicing →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === "Test Drives" &&
          (testDrives.length === 0 ? (
            <EmptyTab icon={<CalendarCheck size={18} />} message="No test drives recorded." />
          ) : (
            <ul className="divide-y divide-[#F0F0ED]">
              {testDrives.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
                  <div>
                    <p className="text-[13px] font-bold text-[#04314A]">
                      {t.vehicle} · {t.date} at {t.time}
                      {t.unitVin && (
                        <span className="ml-2 font-normal text-[12px] text-[#737373]">
                          VIN: <EntityLink type="unit" id={t.unitId || t.unitVin} label={t.unitVin} onNavigate={onNavigate} />
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-[#737373]">{t.location} · {t.salesperson}</p>
                  </div>
                  <Badge status={t.status} />
                </li>
              ))}
            </ul>
          ))}

        {tab === "Quotations" &&
          (quotations.length === 0 ? (
            <EmptyTab icon={<FileText size={18} />} message="No quotations created." />
          ) : (
            <ul className="divide-y divide-[#F0F0ED]">
              {quotations.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 hover:bg-[#FAFAF8]">
                  <div>
                    <p className="text-[13px] font-bold text-[#04314A]">
                      <EntityLink type="quotation" id={q.id} label={q.id} onNavigate={onNavigate} />
                      <span className="ml-2 text-[#737373]">· {q.vehicle}</span>
                    </p>
                    <p className="text-[11px] text-[#737373]">{formatNpr(crm.quotationTotals(q.item).total)}{q.validUntil ? ` · Valid until ${formatDate(q.validUntil)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={q.status} />
                    <button
                      onClick={() => onNavigate(`crm-quotations/${q.id}`)}
                      className="text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A]"
                    >
                      View Details
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {tab === "Documents" && (
          <div className="p-4 sm:p-6">
            <DocumentAttachmentWidget
              targetType="customer"
              targetId={customerId}
              targetTitle={customer.name}
            />
          </div>
        )}

        {tab === "Activity Timeline" && (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
              <h2 className="text-[13px] font-black tracking-[0.12em] uppercase text-[#04314A]">Activity Timeline</h2>
              <button onClick={() => setModal("activity")} className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#00AAEB] hover:text-[#04314A] transition-colors">
                + Add Activity
              </button>
            </div>
            <ActivityTimeline activities={activities} />
            {activities.length > 0 && (
              <p className="px-6 py-3 border-t border-[#F0F0ED] text-[11px] text-[#B0B0AA]">
                Last updated {formatDateTime(activities[0]?.datetime ?? customer.lastActivity)}
              </p>
            )}
          </>
        )}
      </div>

      {modal === "activity" && (
        <AddActivityModal onClose={() => setModal(null)} onSaved={(m) => { loadCustomerData(); toastSet(m); }} leadId={undefined} customerId={customer.id} />
      )}
      {modal === "testdrive" && (
        <ScheduleTestDriveModal onClose={() => setModal(null)} onSaved={(m) => { loadCustomerData(); toastSet(m); }} customers={[{ id: customer.id, name: customer.name }]} presetCustomerId={customer.id} />
      )}
      {modal === "quotation" && (
        <QuotationModal onClose={() => setModal(null)} onSaved={(m) => { loadCustomerData(); toastSet(m); }} customers={[{ id: customer.id, name: customer.name, company: customer.company }]} presetCustomerId={customer.id} />
      )}
      {modal === "reserve" && (
        <ReserveUnitModal onClose={() => setModal(null)} onSaved={(m) => { loadCustomerData(); toastSet(m); }} customerId={customer.id} customerName={customer.name} />
      )}
      {modal === "sale" && (
        <SaleFormModal onClose={() => setModal(null)} onSaved={(m) => { loadCustomerData(); toastSet(m); }} initialCustomerId={customer.id} initialCustomerName={customer.name} />
      )}
      {showHistory && (
        <AuditHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          modelName="customer"
          objectId={customer.id}
          title={`Change History: ${customer.name}`}
        />
      )}
      <SaleReceiptModal
        isOpen={Boolean(receiptSale)}
        onClose={() => setReceiptSale(null)}
        sale={receiptSale}
      />
    </div>
  );
}
