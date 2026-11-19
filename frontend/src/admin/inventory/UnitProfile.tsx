import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  Camera,
  ClipboardCheck,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  Info,
  Plus,
  Printer,
  ShieldCheck,
  User,
  Wallet,
  Wrench,
  Paperclip,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import { EntityLink } from "../components/pickers";
import { crm } from "../crm/data";
import { SaleReceiptModal, type SaleReceiptData } from "../crm/SaleReceiptModal";
import DocumentAttachmentWidget from "../documents/DocumentAttachmentWidget";
import {
  fetchConditionReport,
  fetchUnit,
  formatDate,
  formatDateTime,
  formatNPR,
  getModelDisplayName,
  openInspectionPath,
  unitArrive,
  unitMarkReturned,
  unitMoveToReady,
  unitRelease,
  unitRestock,
  unitScrap,
  type PdiHistoryItem,
  type UnitDetail,
} from "@/lib/inventory";
import { Button, Input, FormField, Modal, Badge, useToast } from "@/components/ui";
import AuditHistoryModal from "../components/AuditHistoryModal";

type Tab = "overview" | "pdi" | "servicing" | "financials" | "photos" | "documents";

export default function UnitProfile({
  unitId,
  onNavigate,
}: {
  unitId: string;
  onNavigate: (p: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canChange = hasPerm("inventory.change_vehicleunit");
  const canViewShipment = hasPerm("inventory.view_importbatch");
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [noteModal, setNoteModal] = useState<null | "return" | "restock" | "scrap" | "release">(null);
  const [note, setNote] = useState("");
  const [unitQuotes, setUnitQuotes] = useState<any[]>([]);
  const [unitTestDrives, setUnitTestDrives] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaleHistory, setShowSaleHistory] = useState(false);
  const [showSaleReceipt, setShowSaleReceipt] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchUnit(unitId),
      crm.quotations().catch(() => []),
      crm.testDrives().catch(() => []),
    ])
      .then(([u, qs, tds]) => {
        setUnit(u);
        const qMatches = (qs || []).filter(
          (q: any) => String(q.unitId) === String(unitId) || (u && q.saleUnitVin === u.vin_chassis_no)
        );
        setUnitQuotes(qMatches);
        const tdMatches = (tds || []).filter(
          (t: any) => String(t.unitId) === String(unitId) || (u && t.unitVin === u.vin_chassis_no)
        );
        setUnitTestDrives(tdMatches);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [unitId]);

  const run = async (fn: () => Promise<UnitDetail>, label: string) => {
    setBusy(true);
    try {
      const updated = await fn();
      setUnit(updated);
      toast.success(label);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const submitNote = () => {
    if (!unit || !noteModal) return;
    const actions = {
      return: () => unitMarkReturned(unit.id, note),
      restock: () => unitRestock(unit.id, note),
      scrap: () => unitScrap(unit.id, note),
      release: () => unitRelease(unit.id, note),
    };
    const labels = {
      return: "Marked returned",
      restock: "Restocked",
      scrap: "Scrapped",
      release: "Reservation released",
    };
    run(actions[noteModal], labels[noteModal]);
    setNoteModal(null);
    setNote("");
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[13px] text-[#737373]">Loading unit…</div>
    );
  }

  if (error && !unit) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-[#0B3D2B] mb-2">Couldn&apos;t load unit</p>
        <p className="text-[13px] text-[#737373] mb-6">{error}</p>
        <button
          onClick={() => onNavigate("units")}
          className="px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
        >
          Back to Units
        </button>
      </div>
    );
  }

  if (!unit) return null;

  const canStartPdi = canChange && ["IN_WAREHOUSE", "PDI_FAILED"].includes(unit.status);
  const canStartVei = canChange && ["IN_TRANSIT", "IN_WAREHOUSE"].includes(unit.status);
  const openVeiPath = openInspectionPath(unit.id, "VEI", unit.pdi_history);
  const openPdiPath = openInspectionPath(unit.id, "PDI", unit.pdi_history);
  const draftInspectionCount = unit.pdi_history.filter(
    (p) => p.status === "DRAFT" || p.status === "SUBMITTED",
  ).length;
  const margin =
    unit.sold_price != null && unit.landed_cost != null
      ? Number(unit.sold_price) - Number(unit.landed_cost)
      : null;

  const tabs: { key: Tab; label: string; icon: typeof Info }[] = [
    { key: "overview", label: "Overview", icon: Info },
    { key: "pdi", label: `Inspections (${unit.pdi_history.length})`, icon: ClipboardCheck },
    { key: "servicing", label: `Servicing (${unit.service_records?.length || 0})`, icon: Wrench },
    { key: "financials", label: "Sale & Finance", icon: Wallet },
    { key: "photos", label: "Photos", icon: Camera },
    { key: "documents", label: "Documents", icon: Paperclip },
  ];

  return (
    <div>
      <button
        onClick={() => onNavigate("units")}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#10B981] transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Back to Units
      </button>

      {error && (
        <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
          {error}
        </p>
      )}

      {/* Sale Warning Banner if no PDI completed */}
      {!unit.has_pdi_for_sale && unit.status !== "SOLD" && unit.status !== "SCRAPPED" && (
        <div className="mb-4 bg-[#FFF8E7] border border-[#F5C247] rounded-xl p-3.5 flex items-center justify-between gap-3 text-[12px] text-[#73510D]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-[#B25E00]" />
            <span>{unit.pdi_sale_warning || "Pre-Delivery Inspection (PDI) not completed. Vehicle cannot be sold until a PDI is completed."}</span>
          </div>
          {canStartPdi && (
            <button
              onClick={() => onNavigate(openInspectionPath(unit.id, "PDI", unit.pdi_history) ?? `units/${unit.id}/pdi/new`)}
              className="px-3.5 py-1.5 rounded-full bg-[#0B3D2B] text-white text-[11px] font-bold tracking-wider uppercase hover:bg-[#10B981] transition-colors shrink-0"
            >
              Start PDI
            </button>
          )}
        </div>
      )}

      {/* Open Inspection Issues Alert */}
      {(unit.open_inspection_issues_count ?? 0) > 0 && (
        <div className="mb-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 text-[12px] text-[#991B1B]">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 font-bold text-[13px]">
              <AlertTriangle size={16} className="text-[#DC2626]" />
              <span>
                {unit.open_inspection_issues_count} Open Inspection {unit.open_inspection_issues_count === 1 ? "Issue" : "Issues"}
              </span>
            </div>
            {unit.open_inspection_issues && unit.open_inspection_issues.length > 0 && (
              <button
                onClick={() => {
                  const issue = unit.open_inspection_issues![0];
                  const inspId = issue.inspection_id ?? issue.inspection;
                  if (!inspId) return;
                  const kind = (issue.inspection_type || "PDI").toUpperCase() === "VEI" ? "vei" : "pdi";
                  onNavigate(`units/${unit.id}/${kind}/${inspId}`);
                }}
                className="text-[12px] font-semibold text-[#0B3D2B] hover:underline"
              >
                View Inspection {unit.open_inspection_issues[0].inspection_no} &rarr;
              </button>
            )}
          </div>
          <ul className="list-disc list-inside space-y-1 text-[#7F1D1D] mt-1">
            {unit.open_inspection_issues?.map((iss) => (
              <li key={iss.id}>
                <span className="font-medium">{iss.description}</span>
                <span className="text-[#991B1B] text-[11px] ml-1.5">
                  ({iss.inspection_type} #{iss.inspection_no})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-6 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[22px] sm:text-[26px] font-black tracking-tight text-[#0B3D2B]">
                {unit.vin_chassis_no}
              </h1>
              <Badge status={unit.status.toLowerCase()} />
              {unit.source === "historical import" && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                  Imported
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#737373] mt-1">
              {getModelDisplayName(unit.model_detail, unit.variant_name)}
              {unit.color && ` · ${unit.color}`} · Shipment{" "}
              {canViewShipment ? (
                <button
                  onClick={() => onNavigate(`batches/${unit.import_batch}`)}
                  className="font-semibold text-[#10B981] hover:underline"
                >
                  {unit.shipment_no || unit.batch_no}
                </button>
              ) : (
                <span className="font-semibold text-[#0B3D2B]">
                  {unit.shipment_no || unit.batch_no}
                </span>
              )}
              {unit.shipment_arrival_date && (
                <span> · Arrived {formatDate(unit.shipment_arrival_date)}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[12px] text-[#737373]">
              {unit.variant_name && (
                <span>
                  Variant: <span className="font-semibold text-[#0B3D2B]">{unit.variant_name}</span>
                </span>
              )}
              {unit.variant_detail?.body_type_detail?.name && (
                <span>
                  Body Type: <span className="font-semibold text-[#0B3D2B]">{unit.variant_detail.body_type_detail.name}</span>
                </span>
              )}
              <span>
                Motor: <span className="font-semibold text-[#0B3D2B]">{unit.motor_no || "-"}</span>
              </span>
              <span>
                Battery No: <span className="font-semibold text-[#0B3D2B]">{unit.battery_no || "-"}</span>
              </span>
              <span>
                Battery:{" "}
                <span className="font-semibold text-[#0B3D2B]">
                  {unit.effective_battery_kw ? `${unit.effective_battery_kw} kW` : "-"}
                </span>
              </span>
              <span>
                Odo: <span className="font-semibold text-[#0B3D2B]">{unit.odometer_km} km</span>
              </span>
              <span>
                Mfg: <span className="font-semibold text-[#0B3D2B]">{formatDate(unit.manufacture_date)}</span>
              </span>
              <span>
                Price: <span className="font-semibold text-[#0B3D2B]">{formatNPR(unit.selling_price)}</span>
              </span>
              {unit.created_by_name && (
                <span>
                  Entered by: <span className="font-semibold text-[#0B3D2B]">{unit.created_by_name}</span> on {formatDate(unit.created_at)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStartVei && (
              <button
                onClick={() => onNavigate(openInspectionPath(unit.id, "VEI", unit.pdi_history) ?? `units/${unit.id}/vei/new`)}
                className="px-4 py-2.5 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors"
              >
                Start VEI
              </button>
            )}
            {canStartPdi && (
              <button
                onClick={() => onNavigate(openInspectionPath(unit.id, "PDI", unit.pdi_history) ?? `units/${unit.id}/pdi/new`)}
                className="px-4 py-2.5 rounded-full bg-[#10B981] text-white text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] transition-colors"
              >
                Start PDI
              </button>
            )}
            <button
              onClick={() => onNavigate(`servicing?new=1&unit=${unit.id}`)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors"
            >
              <Wrench size={13} /> Book Service
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold tracking-[0.04em] uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors"
            >
              <History size={13} /> Change History
            </button>
          </div>
        </div>

        {/* Quick transitions */}
        {canChange && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#F0F0ED]">
            {unit.status === "IN_TRANSIT" && (
              <TransBtn busy={busy} onClick={() => run(() => unitArrive(unit.id), "Marked arrived")}>
                Mark Arrived
              </TransBtn>
            )}
            {unit.status === "PDI_PASSED" && (
              <TransBtn busy={busy} onClick={() => run(() => unitMoveToReady(unit.id), "Ready for sale")}>
                Move to Ready
              </TransBtn>
            )}
            {unit.status === "RESERVED" && (
              <TransBtn busy={busy} onClick={() => setNoteModal("release")}>
                Release Reservation
              </TransBtn>
            )}
            {unit.status === "SOLD" && (
              <TransBtn busy={busy} onClick={() => setNoteModal("return")}>
                Mark Returned
              </TransBtn>
            )}
            {unit.status === "RETURNED" && (
              <TransBtn busy={busy} onClick={() => setNoteModal("restock")}>
                Restock
              </TransBtn>
            )}
            {!["SOLD", "SCRAPPED"].includes(unit.status) && (
              <TransBtn busy={busy} danger onClick={() => setNoteModal("scrap")}>
                Scrap
              </TransBtn>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold transition-colors ${
              tab === t.key
                ? "bg-[#0B3D2B] text-white"
                : "bg-white border border-[#E8E8E5] text-[#737373] hover:text-[#0B3D2B]"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {unit.status === "RESERVED" && (
            <div className="bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-4 flex items-start gap-3">
              <Info size={16} className="text-[#10B981] flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-[#0B3D2B]">
                <strong className="font-bold">Reservation Mechanism:</strong> Default reservation length can vary; check the expiry date shown on the linked quotation. Expired reservations release the unit back to ready inventory.
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-4">
                Specifications
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                <Spec label="VIN / Chassis" value={unit.vin_chassis_no} />
                <Spec label="Motor No" value={unit.motor_no || "-"} />
                <Spec label="Battery No" value={unit.battery_no || "-"} />
                <Spec label="Model" value={getModelDisplayName(unit.model_detail)} />
                <Spec label="Color" value={unit.color || "-"} />
                <Spec label="Battery" value={unit.effective_battery_kw ? `${unit.effective_battery_kw} kW` : "-"} />
                <Spec label="Motor" value={unit.effective_motor_kw ? `${unit.effective_motor_kw} kW` : "-"} />
                <Spec label="Manufacture Date" value={formatDate(unit.manufacture_date)} />
                <Spec label="Odometer" value={`${unit.odometer_km} km`} />
                <Spec label="Shipment" value={unit.shipment_no || unit.batch_no} />
                <Spec label="Arrival Date" value={formatDate(unit.shipment_arrival_date)} />
                <Spec label="In Stock Since" value={formatDate(unit.created_at)} />
              </dl>
            </div>
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-1 flex items-center gap-2">
                <ShieldCheck size={14} /> Warranty & Service Schedule
              </h3>
              <p className="text-[11px] text-[#737373] mb-4">
                Warranty terms are set per vehicle model and start from the sale date.
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                <Spec
                  label="Vehicle Warranty"
                  value={
                    unit.vehicle_warranty_status === "active"
                      ? `Active (Expires ${formatDate(unit.vehicle_warranty_end)})`
                      : unit.vehicle_warranty_status === "expired"
                      ? "Expired"
                      : "Not configured"
                  }
                />
                <Spec
                  label="Battery Warranty"
                  value={
                    unit.battery_warranty_status === "active"
                      ? `Active (Expires ${formatDate(unit.battery_warranty_end)})`
                      : unit.battery_warranty_status === "expired"
                      ? "Expired"
                      : "Not configured"
                  }
                />
                <Spec
                  label="Routine Service Status"
                  value={
                    unit.next_service_due?.is_overdue
                      ? "Overdue for Service"
                      : unit.next_service_due?.status === "due_soon"
                      ? "Service Due Soon"
                      : unit.next_service_due?.status === "ok"
                      ? "Service Up to Date"
                      : unit.next_service_due?.status === "not_configured"
                      ? "Interval not configured"
                      : "No service history"
                  }
                />
                <Spec
                  label="Next Service Due"
                  value={
                    unit.next_service_due?.due_date
                      ? `${formatDate(unit.next_service_due.due_date)}${
                          unit.next_service_due.due_km
                            ? ` or ${unit.next_service_due.due_km.toLocaleString()} km`
                            : ""
                        }`
                      : unit.next_service_due?.due_km
                      ? `${unit.next_service_due.due_km.toLocaleString()} km`
                      : "-"
                  }
                />
              </dl>
            </div>
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-4 flex items-center gap-2">
                <History size={14} /> Stock Timeline
              </h3>
              {unit.movements.length === 0 ? (
                <p className="text-[12px] text-[#B0B0AA]">No movements recorded.</p>
              ) : (
                <ul className="space-y-0">
                  {unit.movements.map((m, i) => (
                    <li key={m.id} className="relative pl-5 pb-4 last:pb-0">
                      {i < unit.movements.length - 1 && (
                        <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[#E8E8E5]" />
                      )}
                      <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full bg-[#10B981] border-2 border-white shadow" />
                      <div className="text-[12px] font-bold text-[#0B3D2B]">
                        {m.movement_type.replace(/_/g, " ")}
                      </div>
                      {m.reference_note && (
                        <div className="text-[12px] text-[#737373]">{m.reference_note}</div>
                      )}
                      <div className="text-[10px] text-[#B0B0AA]">
                        {formatDateTime(m.created_at)}
                        {m.created_by_name && ` · ${m.created_by_name}`}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {(unit.customer_name || unit.lead_detail || unit.customer_detail || unit.sold_date) && (
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-3">
                Connected Buyer & Lead
              </h3>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Buyer / Customer
                  </span>
                  {unit.customer_detail ? (
                    <EntityLink
                      type="customer"
                      id={unit.customer_detail.id}
                      label={unit.customer_detail.name}
                      onNavigate={onNavigate}
                    />
                  ) : unit.sold_to_customer ? (
                    <EntityLink
                      type="customer"
                      id={unit.sold_to_customer}
                      label={unit.customer_name || `Customer #${unit.sold_to_customer}`}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <span className="font-semibold text-[#0B3D2B]">{unit.customer_name || "-"}</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Originating Lead
                  </span>
                  {unit.lead_detail ? (
                    <EntityLink
                      type="lead"
                      id={unit.lead_detail.id}
                      label={`Lead #${unit.lead_detail.id} · ${unit.lead_detail.name}`}
                      onNavigate={onNavigate}
                    />
                  ) : unit.sold_to_lead ? (
                    <EntityLink
                      type="lead"
                      id={unit.sold_to_lead}
                      label={`Lead #${unit.sold_to_lead}`}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <span className="text-[#737373]">-</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Payment Mode
                  </span>
                  <span className="font-semibold text-[#0B3D2B]">{unit.payment_mode || "CASH"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Sold Price / Date
                  </span>
                  <span className="font-semibold text-[#0B3D2B]">
                    {unit.sold_price ? `${formatNPR(unit.sold_price)} · ${formatDate(unit.sold_date)}` : "-"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Connected Quotations */}
          {unitQuotes.length > 0 && (
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] flex items-center gap-1.5">
                  <FileText size={14} className="text-[#10B981]" /> Connected Quotations ({unitQuotes.length})
                </h3>
                <button
                  onClick={() => onNavigate("crm-quotations")}
                  className="text-[11px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
                >
                  All Quotations
                </button>
              </div>
              <p className="text-[11px] text-[#737373] -mt-1 mb-3">
                Default reservation length can vary; check the expiry date shown. Expired reservations release the unit back to ready inventory.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5]">
                      {["Quotation No", "Customer", "Amount", "Status", "Valid Until", ""].map((h) => (
                        <th key={h} className="py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unitQuotes.map((q) => (
                      <tr key={q.id} className="border-b border-[#F0F0ED] last:border-0">
                        <td className="py-2.5 text-[12px] font-bold text-[#0B3D2B]">
                          <EntityLink type="quotation" id={q.id} label={q.id} onNavigate={onNavigate} />
                        </td>
                        <td className="py-2.5 text-[12px] text-[#0B3D2B]">
                          {q.customerId ? (
                            <EntityLink type="customer" id={q.customerId} label={q.customerName} onNavigate={onNavigate} />
                          ) : (
                            q.customerName
                          )}
                        </td>
                        <td className="py-2.5 text-[12px] font-bold text-[#0B3D2B]">
                          {formatNPR(q.grandTotal || (q.item && q.item.vehiclePrice) || 0)}
                        </td>
                        <td className="py-2.5">
                          <Badge status={q.status} />
                        </td>
                        <td className="py-2.5 text-[12px] text-[#737373]">
                          {formatDate(q.validUntil)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => onNavigate(`crm-quotations/${q.id}`)}
                            className="text-[11px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
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
          {unitTestDrives.length > 0 && (
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] flex items-center gap-1.5">
                  <CalendarCheck size={14} className="text-[#10B981]" /> Connected Test Drives ({unitTestDrives.length})
                </h3>
                <button
                  onClick={() => onNavigate("crm-testdrives")}
                  className="text-[11px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
                >
                  All Test Drives
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E8E8E5]">
                      {["Date and Time", "Customer / Prospect", "Consultant", "Status", "Feedback"].map((h) => (
                        <th key={h} className="py-2 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unitTestDrives.map((td) => (
                      <tr key={td.id} className="border-b border-[#F0F0ED] last:border-0">
                        <td className="py-2.5 text-[12px] font-bold text-[#0B3D2B]">
                          {formatDateTime(td.date)}
                        </td>
                        <td className="py-2.5 text-[12px] text-[#0B3D2B]">
                          {td.customerId ? (
                            <EntityLink type="customer" id={td.customerId} label={td.customerName} onNavigate={onNavigate} />
                          ) : td.leadId ? (
                            <EntityLink type="lead" id={td.leadId} label={td.customerName} onNavigate={onNavigate} />
                          ) : (
                            td.customerName
                          )}
                        </td>
                        <td className="py-2.5 text-[12px] text-[#737373]">
                          {td.consultant || td.salesperson || "-"}
                        </td>
                        <td className="py-2.5">
                          <Badge status={td.status} />
                        </td>
                        <td className="py-2.5 text-[12px] text-[#737373] max-w-xs truncate">
                          {td.feedback || td.notes || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
            <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-1 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Warranty Coverage
            </h3>
            <p className="text-[12px] text-[#737373] mt-0.5 mb-4">
              Warranty terms are set per vehicle model and start from the sale date.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-[12px]">
              <div className="border border-[#E8E8E5] rounded-lg p-3.5 bg-[#FAFAF8]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-[#0B3D2B] text-[13px]">Vehicle Warranty</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      unit.vehicle_warranty_status === "active"
                        ? "bg-[#008000] text-white"
                        : unit.vehicle_warranty_status === "expired"
                        ? "bg-[#737373] text-white"
                        : "bg-[#E8E8E5] text-[#737373]"
                    }`}
                  >
                    {unit.vehicle_warranty_status === "active"
                      ? "Active"
                      : unit.vehicle_warranty_status === "expired"
                      ? "Expired"
                      : "Not configured"}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-[#737373]">
                  <div>
                    Coverage End:{" "}
                    <strong className="text-[#0B3D2B]">
                      {formatDate(unit.vehicle_warranty_end || unit.warranty_end) ||
                        (unit.sold_date ? "Follows model terms" : "Unsold")}
                    </strong>
                  </div>
                  <div>
                    Manual Override:{" "}
                    <strong className="text-[#0B3D2B]">
                      {unit.warranty_end_date ? formatDate(unit.warranty_end_date) : "None"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="border border-[#E8E8E5] rounded-lg p-3.5 bg-[#FAFAF8]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-[#0B3D2B] text-[13px]">Traction Battery Warranty</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      unit.battery_warranty_status === "active"
                        ? "bg-[#008000] text-white"
                        : unit.battery_warranty_status === "expired"
                        ? "bg-[#737373] text-white"
                        : "bg-[#E8E8E5] text-[#737373]"
                    }`}
                  >
                    {unit.battery_warranty_status === "active"
                      ? "Active"
                      : unit.battery_warranty_status === "expired"
                      ? "Expired"
                      : "Not configured"}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-[#737373]">
                  <div>
                    Coverage End:{" "}
                    <strong className="text-[#0B3D2B]">
                      {formatDate(unit.battery_warranty_end) ||
                        (unit.sold_date ? "Follows model terms" : "Unsold")}
                    </strong>
                  </div>
                  <div>
                    Scope:{" "}
                    <strong className="text-[#0B3D2B]">
                      Dedicated cell & pack coverage
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "pdi" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E8E8E5] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-black tracking-tight text-[#0B3D2B]">Inspection records</h3>
              <p className="text-[12px] text-[#737373] mt-1 max-w-xl leading-relaxed">
                Same checklist for VEI and PDI — only the document type differs. PDI must be completed before this unit can be sold.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAFAF8] border border-[#E8E8E5] text-[11px] font-semibold text-[#0B3D2B]">
                  <ClipboardCheck size={12} className="text-[#10B981]" />
                  {unit.pdi_history.length} record{unit.pdi_history.length === 1 ? "" : "s"}
                </span>
                {draftInspectionCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF8E7] border border-[#F5C247]/60 text-[11px] font-semibold text-[#73510D]">
                    {draftInspectionCount} in progress
                  </span>
                )}
              </div>
            </div>
            {canChange && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => onNavigate(openVeiPath ?? `units/${unit.id}/vei/new`)}
                  className="px-4 py-2.5 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold tracking-wide uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors"
                >
                  Start VEI
                </button>
                <button
                  onClick={() => onNavigate(openPdiPath ?? `units/${unit.id}/pdi/new`)}
                  className="px-4 py-2.5 rounded-full bg-[#10B981] text-white text-[12px] font-bold tracking-wide uppercase hover:bg-[#0B3D2B] transition-colors shadow-sm"
                >
                  Start PDI
                </button>
              </div>
            )}
          </div>

          {unit.pdi_history.length === 0 ? (
            <div className="bg-[#FAFAF8] border border-dashed border-[#D4D4CE] rounded-2xl py-14 px-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-[#E8E8E5] flex items-center justify-center mb-3">
                <ClipboardCheck size={22} className="text-[#B0B0AA]" />
              </div>
              <p className="text-[14px] font-bold text-[#0B3D2B]">No inspections yet</p>
              <p className="text-[12px] text-[#737373] mt-1 max-w-sm mx-auto">
                Start a VEI when the vehicle arrives, then complete PDI before marking it ready for sale.
              </p>
              {canChange && (
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <button
                    onClick={() => onNavigate(`units/${unit.id}/vei/new`)}
                    className="px-4 py-2 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[12px] font-bold uppercase hover:bg-[#0B3D2B] hover:text-white transition-colors"
                  >
                    Start VEI
                  </button>
                  <button
                    onClick={() => onNavigate(`units/${unit.id}/pdi/new`)}
                    className="px-4 py-2 rounded-full bg-[#10B981] text-white text-[12px] font-bold uppercase hover:bg-[#0B3D2B] transition-colors"
                  >
                    Start PDI
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {unit.pdi_history.map((p: PdiHistoryItem) => {
                const isVeiItem = p.inspection_type === "VEI";
                const routeBase = isVeiItem ? `units/${unit.id}/vei` : `units/${unit.id}/pdi`;
                const isDraft = p.status === "DRAFT" || p.status === "SUBMITTED";
                const target =
                  isDraft ? `${routeBase}/${p.id}/edit` : `${routeBase}/${p.id}`;
                const ratingLabel = p.overall_rating ? p.overall_rating.replace(/_/g, " ") : "—";
                const ratingTone =
                  p.overall_rating === "POOR"
                    ? "text-[#991B1B] bg-[#FEF2F2] border-[#FECACA]"
                    : p.overall_rating
                      ? "text-[#0B3D2B] bg-[#F0F9FF] border-[#BAE6FD]"
                      : "text-[#737373] bg-[#FAFAF8] border-[#E8E8E5]";

                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(target)}
                      className={`w-full text-left bg-white border rounded-2xl p-4 sm:p-5 transition-all hover:border-[#10B981]/50 hover:shadow-sm group ${
                        isDraft ? "border-[#F5C247]/70 ring-1 ring-[#F5C247]/20" : "border-[#E8E8E5]"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div
                          className={`hidden sm:block w-1 self-stretch rounded-full shrink-0 ${
                            isVeiItem ? "bg-[#0B3D2B]/30" : "bg-[#10B981]"
                          }`}
                          aria-hidden
                        />
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-md border ${
                                isVeiItem
                                  ? "bg-[#F0F4F8] text-[#0B3D2B] border-[#D0D7DE]"
                                  : "bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]"
                              }`}
                            >
                              {p.inspection_type || "PDI"}
                            </span>
                            <span className="text-[15px] font-black text-[#0B3D2B] tracking-tight">
                              {p.pdi_no}
                            </span>
                            <Badge status={p.status.toLowerCase()} size="sm">
                              {p.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[12px]">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B0B0AA] mb-0.5">
                                Date
                              </p>
                              <p className="font-semibold text-[#0B3D2B]">{formatDate(p.inspection_date)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B0B0AA] mb-0.5">
                                Rating
                              </p>
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${ratingTone}`}
                              >
                                {ratingLabel}
                              </span>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B0B0AA] mb-0.5">
                                Checked by
                              </p>
                              <p className="font-medium text-[#737373] truncate">{p.checked_by || "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B0B0AA] mb-0.5">
                                Not OK
                              </p>
                              <p
                                className={`font-black tabular-nums ${
                                  p.not_ok_count > 0 ? "text-[#DC2626]" : "text-[#0B3D2B]"
                                }`}
                              >
                                {p.not_ok_count}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[#F0F0ED] sm:pl-2">
                          <span className="text-[12px] font-bold text-[#10B981] group-hover:text-[#0B3D2B] transition-colors">
                            {isDraft ? "Continue editing" : "View report"}
                          </span>
                          <ChevronRight
                            size={18}
                            className="text-[#10B981] group-hover:translate-x-0.5 transition-transform"
                          />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "servicing" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 bg-white border border-[#E8E8E5] rounded-xl p-4">
            <div>
              <h3 className="text-[13px] font-bold text-[#0B3D2B]">Servicing History & Vehicle Repair Orders (VRO)</h3>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Every service visit, time in, duration taken, delivery out, customer details, and repair costs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate(`servicing?new=1&unit=${unit.id}`)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-bold hover:bg-[#10B981] transition-colors"
              >
                <Wrench size={14} /> Book Service
              </button>
              <button
                onClick={() => onNavigate("servicing")}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#E8E8E5] text-[#0B3D2B] text-[12px] font-bold hover:bg-[#FAFAF8] transition-colors"
              >
                Open Servicing Desk
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-[#E8E8E5]">
                  {["VRO No", "Time In", "Time Delivered", "Duration", "Type", "Status", "Job Description", "Cost", ""].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(unit.service_records || []).map((srv) => (
                  <tr key={srv.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                    <td className="px-5 py-3 text-[12px] font-bold text-[#0B3D2B]">
                      <EntityLink
                        type="vro"
                        id={srv.vro_no || `SRV-${srv.id}`}
                        label={srv.vro_no || `SRV-${srv.id}`}
                        onNavigate={onNavigate}
                      />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.time_received ? formatDateTime(srv.time_received) : formatDate(srv.date_received)}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.actual_delivered_at ? formatDateTime(srv.actual_delivered_at) : "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-semibold text-[#0B3D2B]">
                      {srv.duration_display || "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#737373]">
                      {srv.service_type || srv.technician_name || "Service"}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={srv.status.toLowerCase()} />
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#0B3D2B] max-w-xs truncate">
                      {srv.job_description || srv.notes || "-"}
                    </td>
                    <td className="px-5 py-3 text-[12px] font-bold text-[#0B3D2B]">
                      {formatNPR(srv.total_cost || 0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => onNavigate("servicing")}
                        className="text-[12px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
                      >
                        Servicing Desk →
                      </button>
                    </td>
                  </tr>
                ))}
                {(!unit.service_records || unit.service_records.length === 0) && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-[13px] text-[#737373]">
                      No servicing visits recorded for this vehicle yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "financials" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Commercials */}
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B]">
                  Pricing & Profit Margin
                </h3>
                <div className="flex items-center gap-2">
                  {(unit.sold_price || unit.sale_id || unit.status === "SOLD") && (
                    <button
                      onClick={() => setShowSaleReceipt(true)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#0B3D2B] text-[#0B3D2B] text-[11px] font-bold hover:bg-[#0B3D2B] hover:text-white transition-colors"
                    >
                      <Printer size={12} /> Sale Receipt
                    </button>
                  )}
                  {unit.sale_id && (
                    <button
                      onClick={() => setShowSaleHistory(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#10B981] hover:text-[#0B3D2B] transition-colors"
                    >
                      <History size={12} /> View Sale History
                    </button>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                <Spec label="Purchase Cost" value={formatNPR(unit.purchase_cost)} />
                <Spec label="Landed Cost" value={formatNPR(unit.landed_cost)} />
                <Spec label="Target Selling Price" value={formatNPR(unit.selling_price)} />
                <Spec label="Actual Sold Price" value={formatNPR(unit.sold_price)} />
                <Spec label="Sale Date" value={formatDate(unit.sold_date)} />
                <Spec
                  label="Net Margin (Sold - Landed)"
                  value={margin === null ? "-" : formatNPR(margin)}
                />
                <Spec label="Salesperson" value={unit.salesperson_name || "-"} />
                <Spec label="Vehicle Status" value={unit.status} />
              </dl>
            </div>

            {/* Buyer & CRM Links */}
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B] mb-4">
                Buyer & CRM Connection
              </h3>
              <div className="space-y-3 text-[12px]">
                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Customer / Buyer
                  </span>
                  {unit.customer_detail ? (
                    <button
                      onClick={() => onNavigate(`crm-customers/${unit.customer_detail?.id}`)}
                      className="inline-flex items-center gap-1.5 font-bold text-[#10B981] hover:underline mt-0.5"
                    >
                      <User size={13} /> {unit.customer_detail.name} ({unit.customer_detail.phone})
                      <ExternalLink size={12} />
                    </button>
                  ) : (
                    <span className="font-semibold text-[#0B3D2B]">{unit.customer_name || "Not assigned"}</span>
                  )}
                </div>

                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Originating Lead
                  </span>
                  {unit.lead_detail ? (
                    <button
                      onClick={() => onNavigate(`crm-leads/${unit.lead_detail?.id}`)}
                      className="inline-flex items-center gap-1.5 font-bold text-[#10B981] hover:underline mt-0.5"
                    >
                      Lead #{unit.lead_detail.id} · {unit.lead_detail.name} ({unit.lead_detail.phone})
                      <ExternalLink size={12} />
                    </button>
                  ) : (
                    <span className="text-[#737373]">-</span>
                  )}
                </div>

                <div>
                  <span className="block text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
                    Linked Quotation
                  </span>
                  {unit.quotation_detail ? (
                    <button
                      onClick={() => onNavigate(`crm-quotations/${unit.quotation_detail?.id}`)}
                      className="inline-flex items-center gap-1.5 font-bold text-[#10B981] hover:underline mt-0.5"
                    >
                      {unit.quotation_detail.quotation_no || unit.quotation_detail.display_id} ({formatNPR(unit.quotation_detail.total_amount || unit.quotation_detail.total)})
                      <ExternalLink size={12} />
                    </button>
                  ) : (
                    <span className="text-[#737373]">-</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Full Finance Report */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 border-b border-[#F0F0ED] pb-3">
              <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B]">
                Finance & Payment Report
              </h3>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#737373]">
                Payment Mode: <span className="text-[#0B3D2B] font-bold">{unit.payment_mode ? unit.payment_mode.replace(/_/g, " ") : "CASH"}</span>
              </span>
            </div>

            <dl className="grid sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 text-[12px]">
              <Spec label="Financing Bank" value={unit.finance_bank_name || "-"} />
              <Spec label="Down Payment" value={unit.down_payment != null ? formatNPR(unit.down_payment) : "-"} />
              <Spec label="Loan / Financed Amount" value={unit.loan_amount != null ? formatNPR(unit.loan_amount) : "-"} />
              <Spec label="Finance Status" value={unit.finance_status ? unit.finance_status.replace(/_/g, " ") : "-"} />
              <Spec label="Loan Tenure" value={unit.loan_tenure_months ? `${unit.loan_tenure_months} Months` : "-"} />
              <Spec label="Interest Rate" value={unit.interest_rate != null ? `${unit.interest_rate}% p.a.` : "-"} />
              <Spec label="Monthly EMI" value={unit.monthly_emi != null ? formatNPR(unit.monthly_emi) : "-"} />
              <Spec label="Tax Invoice No" value={unit.tax_invoice_no || "-"} />
              <Spec label="Receipt Voucher No" value={unit.receipt_voucher_no || "-"} />
              <Spec label="Delivery / Sale Notes" value={unit.delivery_notes || "-"} />
            </dl>
          </div>
        </div>
      )}

      {tab === "photos" && <UnitPhotos unitId={unitId} />}

      {tab === "documents" && (
        <DocumentAttachmentWidget
          targetType="unit"
          targetId={unit.id}
          targetTitle={unit.vin_chassis_no}
        />
      )}

      {noteModal && (
        <Modal
          title={
            noteModal === "return"
              ? "Mark Returned"
              : noteModal === "restock"
                ? "Restock Unit"
                : noteModal === "scrap"
                  ? "Scrap Unit"
                  : "Release Reservation"
          }
          onClose={() => setNoteModal(null)}
        >
          {noteModal === "release" && (
            <p className="text-[12px] text-[#737373] mb-4">
              Releases this unit back to available inventory. The customer quotation will lose this vehicle assignment. Default reservation length can vary; check the expiry date shown.
            </p>
          )}
          {noteModal === "scrap" && (
            <p className="text-[12px] text-[#DC2626] mb-4 font-medium">
              Permanently marks this vehicle unit as scrapped. This action cannot be undone.
            </p>
          )}
          <FormField label="Note">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reference note for the ledger…"
            />
          </FormField>
          <div data-modal-actions className="flex gap-3 justify-end mt-6">
            <Button
              variant="secondary"
              onClick={() => setNoteModal(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitNote}
              loading={busy}
              variant={noteModal === "scrap" ? "danger" : "primary"}
            >
              {noteModal === "scrap" ? "Scrap Unit" : noteModal === "release" ? "Release Reservation" : "Confirm"}
            </Button>
          </div>
        </Modal>
      )}

      {showHistory && (
        <AuditHistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          modelName="vehicleunit"
          objectId={unit.id}
          title={`Change History: Unit ${unit.vin_chassis_no}`}
        />
      )}

      {showSaleHistory && unit.sale_id && (
        <AuditHistoryModal
          isOpen={showSaleHistory}
          onClose={() => setShowSaleHistory(false)}
          modelName="sale"
          objectId={unit.sale_id}
          title={`Change History: Sale #${unit.sale_id} (${unit.vin_chassis_no})`}
        />
      )}

      {showSaleReceipt && (
        <SaleReceiptModal
          isOpen={showSaleReceipt}
          onClose={() => setShowSaleReceipt(false)}
          sale={{
            id: unit.sale_id || unit.id,
            receipt_no: unit.receipt_voucher_no || unit.tax_invoice_no || `REC-${unit.id}`,
            tax_invoice_no: unit.tax_invoice_no || undefined,
            sale_date: unit.sold_date || undefined,
            customer_name: unit.customer_detail?.name || unit.customer_name || undefined,
            customer_phone: unit.customer_detail?.phone || undefined,
            customer_company: unit.customer_detail?.company || undefined,
            customer_address: (unit.customer_detail as { location?: string })?.location || undefined,
            unit_vin: unit.vin_chassis_no,
            unit_model_name: getModelDisplayName(unit.model_detail, unit.variant_name),
            unit_variant_name: unit.variant_name || unit.variant_detail?.name || undefined,
            color: unit.color,
            motor_no: unit.motor_no,
            selling_price: unit.sold_price || unit.selling_price || 0,
            payment_mode: unit.payment_mode || "CASH",
            bank: unit.finance_bank_name || undefined,
            down_payment: unit.down_payment || undefined,
            loan_amount: unit.loan_amount || undefined,
            tenure: unit.loan_tenure_months || undefined,
            interest: unit.interest_rate || undefined,
            emi: unit.monthly_emi || undefined,
            finance_status: unit.finance_status || undefined,
            created_by_name: unit.created_by_name || undefined,
            created_at: unit.created_at,
            salesperson_name: unit.salesperson_name || undefined,
            notes: unit.delivery_notes || undefined,
          }}
        />
      )}
    </div>
  );
}

function TransBtn({
  children,
  onClick,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-3.5 py-2 rounded-full border text-[11px] font-bold tracking-[0.04em] uppercase transition-colors disabled:opacity-50 ${
        danger
          ? "border-[#8B0000]/30 text-[#8B0000] hover:bg-[#8B0000] hover:text-white"
          : "border-[#E8E8E5] text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#B0B0AA]">
        {label}
      </dt>
      <dd className="font-semibold text-[#0B3D2B] mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function UnitPhotos({ unitId }: { unitId: string }) {
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [photos, setPhotos] = useState<{ src: string; label: string }[]>([]);

  useEffect(() => {
    fetchUnit(unitId)
      .then((u) => {
        setUnit(u);
        const list: { src: string; label: string }[] = [];
        // Condition report galleries are fetched per report below.
        setPhotos(list);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  useEffect(() => {
    if (!unit) return;
    Promise.all(unit.condition_history.map((r) => fetchConditionReport(r.id)))
      .then((reports) => {
        const list: { src: string; label: string }[] = [];
        reports.forEach((rep) => {
          rep.photos.forEach((p) =>
            list.push({
              src: p.image_display,
              label: `${rep.report_type.replace(/_/g, " ")} · ${p.caption || "photo"}`,
            }),
          );
          rep.results.forEach((res) => {
            if (res.photo_display)
              list.push({
                src: res.photo_display,
                label: `${rep.report_type.replace(/_/g, " ")} · ${res.label}`,
              });
          });
        });
        setPhotos(list);
      })
      .catch(() => undefined);
  }, [unit]);

  if (photos.length === 0) {
    return (
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-8 text-center text-[13px] text-[#737373]">
        No photos yet. Attach defect photos in PDI/condition checklists or gallery
        photos in condition reports.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {photos.map((p, i) => (
        <a
          key={i}
          href={p.src}
          target="_blank"
          rel="noopener noreferrer"
          className="group border border-[#E8E8E5] rounded-xl overflow-hidden bg-white"
        >
          <img src={p.src} alt={p.label} loading="lazy" className="aspect-[4/3] w-full object-cover group-hover:scale-[1.03] transition-transform" />
          <p className="px-2.5 py-2 text-[10px] font-medium text-[#737373] truncate">{p.label}</p>
        </a>
      ))}
    </div>
  );
}
