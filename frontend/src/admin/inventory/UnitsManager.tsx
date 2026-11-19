"use client";

import { useEffect, useMemo, useState } from "react";
import { Car, Download, Eye, Pencil, Plus, Trash2, Search, X, ClipboardCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  deleteUnit,
  downloadUnitsCsv,
  fetchBatches,
  fetchModels,
  fetchUnits,
  fetchUnitsSummary,
  formatDate,
  formatNPR,
  getModelDisplayName,
  unitMarkSold,
  unitReserve,
  UNIT_STATUSES,
  fetchVariants,
  type ImportBatch,
  type Paged,
  type SoldFinancePayload,
  type UnitListItem,
  type VehicleModel,
  type VehicleVariant,
} from "@/lib/inventory";
import { crm, type Lead } from "../crm/data";
import {
  Button,
  Input,
  Select,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
  Textarea,
} from "@/components/ui";
import { TableState, Pagination } from "../crm/ui";
import { EntityLink, LeadPicker } from "../components/pickers";

type Tab = "all" | "reserved" | "sold";

function renderInspectionBadge(
  badge?: "NOT_DONE" | "PENDING" | "PASSED" | "ISSUES" | "FAILED" | "LEGACY",
  inspectionNo?: string | null
) {
  switch (badge) {
    case "LEGACY":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F5F5F4] text-[#57534E] border border-[#D6D3D1]">
          Legacy
        </span>
      );
    case "PASSED":
      return (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
            Passed
          </span>
          {inspectionNo && (
            <span className="block text-[10px] text-[#737373] mt-0.5">{inspectionNo}</span>
          )}
        </div>
      );
    case "ISSUES":
      return (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
            Issues
          </span>
          {inspectionNo && (
            <span className="block text-[10px] text-[#737373] mt-0.5">{inspectionNo}</span>
          )}
        </div>
      );
    case "FAILED":
      return (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]">
            Failed
          </span>
          {inspectionNo && (
            <span className="block text-[10px] text-[#737373] mt-0.5">{inspectionNo}</span>
          )}
        </div>
      );
    case "PENDING":
      return (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
            Pending
          </span>
          {inspectionNo && (
            <span className="block text-[10px] text-[#737373] mt-0.5">{inspectionNo}</span>
          )}
        </div>
      );
    case "NOT_DONE":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F5F5F4] text-[#78716C] border border-[#E7E5E4]">
          Not done
        </span>
      );
  }
}

export default function UnitsManager({
  onNavigate,
}: {
  onNavigate: (p: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canChange = hasPerm("inventory.change_vehicleunit");
  const canDelete = hasPerm("inventory.delete_vehicleunit");

  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [page, setPage] = useState(0);

  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [batch, setBatch] = useState("");
  const [color, setColor] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [veiFilter, setVeiFilter] = useState("");
  const [pdiFilter, setPdiFilter] = useState("");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [quickAction, setQuickAction] = useState<{
    unit: UnitListItem;
    kind: "reserve" | "sell";
  } | null>(null);
  const [qaLeadId, setQaLeadId] = useState("");
  const [qaCustomer, setQaCustomer] = useState("");
  const [qaPrice, setQaPrice] = useState("");
  const [qaPaymentMode, setQaPaymentMode] = useState<
    "CASH" | "BANK_FINANCE" | "PARTIAL_FINANCE"
  >("CASH");
  const [qaBankName, setQaBankName] = useState("");
  const [qaDownPayment, setQaDownPayment] = useState("");
  const [qaLoanAmount, setQaLoanAmount] = useState("");
  const [qaLoanTenure, setQaLoanTenure] = useState("60");
  const [qaInterestRate, setQaInterestRate] = useState("11.5");
  const [qaEmi, setQaEmi] = useState("");
  const [qaFinanceStatus, setQaFinanceStatus] = useState("PENDING_APPROVAL");
  const [qaTaxInvoice, setQaTaxInvoice] = useState("");
  const [qaReceiptVoucher, setQaReceiptVoucher] = useState("");
  const [qaSalesperson, setQaSalesperson] = useState("");
  const [qaDeliveryNotes, setQaDeliveryNotes] = useState("");
  const [qaBusy, setQaBusy] = useState(false);
  const [deleting, setDeleting] = useState<UnitListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const PER_PAGE = 12;

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (search.trim()) p.search = search.trim();
    if (tab === "reserved") p.status = "RESERVED";
    else if (tab === "sold") p.status = "SOLD";
    else if (status) p.status = status;
    if (model) p.model = model;
    if (variant) p.variant = variant;
    if (batch) p.batch = batch;
    if (color.trim()) p.color = color.trim();
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, status, model, variant, batch, color, dateFrom, dateTo]);

  useEffect(() => {
    fetchVariants({ is_active: "true", ...(model ? { vehicle_model: model } : {}) })
      .then(setVariants)
      .catch(() => setVariants([]));
    setVariant("");
  }, [model]);

  const load = () => {
    setLoading(true);
    setError("");
    fetchUnits(params)
      .then((data) => {
        setUnits(
          Array.isArray(data)
            ? data
            : (data as Paged<UnitListItem>).results ?? []
        );
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Load failed")
      )
      .finally(() => setLoading(false));
    fetchUnitsSummary()
      .then(setSummary)
      .catch(() => undefined);
  };

  useEffect(() => {
    fetchModels({ is_active: "true" })
      .then(setModels)
      .catch(() => undefined);
    fetchBatches()
      .then(setBatches)
      .catch(() => undefined);
    crm
      .leads()
      .then(setLeads)
      .catch(() => undefined);

    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const sParam = p.get("status");
      const qParam = p.get("search");
      const mParam = p.get("model");
      const bParam = p.get("batch");
      const tParam = p.get("tab");
      if (tParam === "reserved" || tParam === "sold" || tParam === "all")
        setTab(tParam as Tab);
      if (sParam) {
        if (sParam === "RESERVED") setTab("reserved");
        else if (sParam === "SOLD") setTab("sold");
        else setStatus(sParam);
      }
      if (qParam) setSearch(qParam);
      if (mParam) setModel(mParam);
      if (bParam) setBatch(bParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(
      () => {
        setPage(0);
        load();
      },
      search ? 300 : 0
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const filteredUnits = useMemo(() => {
    let r = units;
    if (veiFilter) {
      r = r.filter((u) => (u.vei_badge || "NOT_DONE") === veiFilter);
    }
    if (pdiFilter) {
      r = r.filter((u) => (u.pdi_badge || "NOT_DONE") === pdiFilter);
    }
    return r;
  }, [units, veiFilter, pdiFilter]);

  const pageCount = Math.ceil(filteredUnits.length / PER_PAGE);
  const rows = useMemo(
    () => filteredUnits.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    [filteredUnits, page]
  );

  const updateLoanEmi = (loan: string, tenure: string, rate: string) => {
    const p = parseFloat(loan) || 0;
    const n = parseInt(tenure) || 0;
    const r = parseFloat(rate) || 0;
    if (p <= 0 || n <= 0) {
      setQaEmi("");
      return;
    }
    if (r <= 0) {
      setQaEmi(String(Math.round(p / n)));
      return;
    }
    const monthlyRate = r / (12 * 100);
    const emi =
      (p * monthlyRate * Math.pow(1 + monthlyRate, n)) /
      (Math.pow(1 + monthlyRate, n) - 1);
    setQaEmi(String(Math.round(emi)));
  };

  const handlePriceOrDownPaymentChange = (
    priceVal: string,
    downVal: string,
    tenure: string,
    rate: string
  ) => {
    const priceNum = parseFloat(priceVal) || 0;
    const downNum = parseFloat(downVal) || 0;
    if (priceNum > 0 && downNum >= 0) {
      const loan = String(Math.max(0, priceNum - downNum));
      setQaLoanAmount(loan);
      updateLoanEmi(loan, tenure, rate);
    }
  };

  const handleLeadSelect = (leadIdStr: string, leadObj?: Lead) => {
    setQaLeadId(leadIdStr);
    if (!leadIdStr) return;
    const found = leadObj || leads.find((l) => String(l.id) === leadIdStr);
    if (found) {
      setQaCustomer(found.name || "");
      if (found.budget && !qaPrice) {
        setQaPrice(String(found.budget));
      }
    }
  };

  const openQuick = (unit: UnitListItem, kind: "reserve" | "sell") => {
    setQuickAction({ unit, kind });
    setQaCustomer(unit.customer_name ?? "");
    setQaPrice(unit.selling_price ?? "");
    setQaLeadId("");
    setQaPaymentMode("CASH");
    setQaBankName("");
    setQaDownPayment("");
    setQaLoanAmount("");
    setQaLoanTenure("60");
    setQaInterestRate("11.5");
    setQaEmi("");
    setQaFinanceStatus("PENDING_APPROVAL");
    setQaTaxInvoice("");
    setQaReceiptVoucher("");
    setQaSalesperson("");
    setQaDeliveryNotes("");
  };

  const submitQuick = async () => {
    if (!quickAction) return;
    setQaBusy(true);
    try {
      if (quickAction.kind === "reserve") {
        await unitReserve(quickAction.unit.id, { customer_name: qaCustomer });
        setStatusMsg("Unit reserved.");
      } else {
        if (!qaPrice) {
          setError("Sold price is required.");
          setQaBusy(false);
          return;
        }
        const payload: SoldFinancePayload = {
          sold_price: qaPrice,
          customer_name: qaCustomer,
          lead: qaLeadId ? Number(qaLeadId) : null,
          payment_mode: qaPaymentMode,
          finance_bank_name:
            qaPaymentMode !== "CASH" ? qaBankName : "",
          down_payment: qaDownPayment ? Number(qaDownPayment) : null,
          loan_amount: qaLoanAmount ? Number(qaLoanAmount) : null,
          loan_tenure_months: qaLoanTenure ? Number(qaLoanTenure) : null,
          interest_rate: qaInterestRate ? Number(qaInterestRate) : null,
          monthly_emi: qaEmi ? Number(qaEmi) : null,
          finance_status:
            qaPaymentMode !== "CASH"
              ? qaFinanceStatus
              : "SELF_ARRANGED",
          tax_invoice_no: qaTaxInvoice,
          receipt_voucher_no: qaReceiptVoucher,
          salesperson_name: qaSalesperson,
          delivery_notes: qaDeliveryNotes,
        };
        await unitMarkSold(quickAction.unit.id, payload);
        setStatusMsg("Unit marked sold and finance details saved.");
      }
      setQuickAction(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setQaBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteUnit(deleting.id);
      setStatusMsg("Unit deleted.");
      setDeleting(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await downloadUnitsCsv(params);
      setStatusMsg("CSV downloaded.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const cards: { label: string; value: number }[] = [
    { label: "Imported", value: summary.total ?? units.length },
    { label: "Warehouse", value: summary.in_warehouse ?? 0 },
    { label: "PDI Pending", value: summary.pdi_pending ?? 0 },
    { label: "Ready", value: summary.ready_for_sale ?? 0 },
    { label: "Reserved", value: summary.reserved ?? 0 },
    {
      label: `Sold (${summary.sold_this_month ?? 0} this mo)`,
      value: summary.sold ?? 0,
    },
    { label: "Returned", value: summary.returned ?? 0 },
    { label: "Scrapped", value: summary.scrapped ?? 0 },
  ];

  const unitStatusOptions = [
    { value: "", label: "All statuses" },
    ...UNIT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
  ];

  const modelOptions = [
    { value: "", label: "All models" },
    ...models.map((m) => ({
      value: String(m.id),
      label: getModelDisplayName(m),
    })),
  ];

  const variantOptions = [
    { value: "", label: "All variants" },
    ...variants.map((v) => ({
      value: String(v.id),
      label: v.name,
    })),
  ];

  const batchOptions = [
    { value: "", label: "All batches" },
    ...batches.map((b) => ({ value: String(b.id), label: b.batch_no })),
  ];

  const paymentModeOptions = [
    { value: "CASH", label: "Cash / Full Wire Transfer" },
    { value: "BANK_FINANCE", label: "Bank Finance" },
    {
      value: "PARTIAL_FINANCE",
      label: "Partial Finance (Down Payment + Loan)",
    },
  ];

  const financeStatusOptions = [
    { value: "PENDING_APPROVAL", label: "Pending Bank Approval" },
    { value: "APPROVED", label: "Approved by Bank" },
    { value: "DISBURSED", label: "Disbursed to VT Account" },
    { value: "SELF_ARRANGED", label: "Self-Arranged by Customer" },
  ];

  const getStatusVariant = (
    s: string
  ): "success" | "info" | "warning" | "danger" | "neutral" => {
    const map: Record<
      string,
      "success" | "info" | "warning" | "danger" | "neutral"
    > = {
      ready_for_sale: "success",
      sold: "success",
      reserved: "info",
      in_warehouse: "neutral",
      pdi_in_progress: "warning",
      pdi_failed: "danger",
      returned: "danger",
      scrapped: "danger",
    };
    return map[s.toLowerCase()] ?? "neutral";
  };

  const hasActiveFilters =
    search || status || model || variant || batch || color || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles & Units"
        subtitle="Every physical vehicle: stock, PDI state and sale in one table."
        actions={
          <>
            {hasPerm("inventory.view_pditemplate") && (
              <Button
                variant="secondary"
                leftIcon={<ClipboardCheck size={14} />}
                onClick={() => onNavigate("checklist-templates")}
              >
                Checklist Templates
              </Button>
            )}
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={doExport}
              loading={exporting}
            >
              CSV Export
            </Button>
            <Button
              variant="primary"
              leftIcon={<Plus size={14} />}
              onClick={() => onNavigate("batches")}
            >
              Import Units
            </Button>
          </>
        }
      />

      {statusMsg && (
        <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[12px] font-medium rounded-lg flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg("")}
            className="text-[#166534] hover:opacity-70 text-[11px] font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-lg">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-white border border-[#E8E8E5] rounded-xl px-3.5 py-2.5"
          >
            <div className="text-[20px] font-semibold text-[#04314A]">
              {c.value}
            </div>
            <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-[#737373]">
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["reserved", "Reserved"],
            ["sold", "Sold"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setPage(0);
            }}
            className={`px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-colors border ${
              tab === key
                ? "bg-[#04314A] text-white border-transparent"
                : "bg-white text-[#737373] border-[#E8E8E5] hover:text-[#04314A] hover:border-[#04314A]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search VIN, motor no, customer…"
            leftIcon={<Search size={14} />}
          />
        </div>
        {tab === "all" && (
          <div className="w-40">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={unitStatusOptions}
            />
          </div>
        )}
        <div className="w-44">
          <Select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            options={modelOptions}
          />
        </div>
        {variants.length > 0 && (
          <div className="w-44">
            <Select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              options={variantOptions}
            />
          </div>
        )}
        <div className="w-40">
          <Select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            options={batchOptions}
          />
        </div>
        <div className="w-28">
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Color"
          />
        </div>
        <div className="w-36">
          <Select
            value={veiFilter}
            onChange={(e) => {
              setVeiFilter(e.target.value);
              setPage(0);
            }}
            options={[
              { value: "", label: "All VEI Status" },
              { value: "NOT_DONE", label: "VEI: Not done" },
              { value: "PENDING", label: "VEI: Pending" },
              { value: "PASSED", label: "VEI: Passed" },
              { value: "ISSUES", label: "VEI: Issues" },
              { value: "FAILED", label: "VEI: Failed" },
            ]}
          />
        </div>
        <div className="w-36">
          <Select
            value={pdiFilter}
            onChange={(e) => {
              setPdiFilter(e.target.value);
              setPage(0);
            }}
            options={[
              { value: "", label: "All PDI Status" },
              { value: "NOT_DONE", label: "PDI: Not done" },
              { value: "PENDING", label: "PDI: Pending" },
              { value: "PASSED", label: "PDI: Passed" },
              { value: "ISSUES", label: "PDI: Issues" },
              { value: "FAILED", label: "PDI: Failed" },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-36">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Created from"
            />
          </div>
          <span className="text-[11px] text-[#737373]">to</span>
          <div className="w-36">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="Created to"
            />
          </div>
        </div>
        {hasActiveFilters && tab === "all" && (
          <button
            onClick={() => {
              setSearch("");
              setStatus("");
              setModel("");
              setVariant("");
              setBatch("");
              setColor("");
              setDateFrom("");
              setDateTo("");
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#00AAEB] hover:text-[#04314A] transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1020px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#04314A] tracking-[0.02em]">
                {[
                  "VIN / Chassis",
                  "Model",
                  "Color",
                  "Batch",
                  "Status",
                  "VEI",
                  "PDI",
                  "Mfg Date",
                  "Price (NPR)",
                  "",
                ].map((h) => (
                  <th key={h} className="px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {loading ? (
                <TableState loading empty={false} colSpan={10} />
              ) : rows.length === 0 ? (
                <TableState loading={false} empty colSpan={10} />
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-semibold text-[#04314A]">
                        <EntityLink
                          type="unit"
                          id={u.id}
                          label={u.vin_chassis_no}
                          onNavigate={onNavigate}
                        />
                      </div>
                      <div className="text-[10px] text-[#B0B0AA]">
                        {u.odometer_km} km
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {getModelDisplayName(u.model_detail, u.variant_name)}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                      {u.color || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {u.batch_no ? (
                        <EntityLink
                          type="batch"
                          id={u.import_batch}
                          label={u.batch_no}
                          onNavigate={onNavigate}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={getStatusVariant(u.status)}
                        size="sm"
                      >
                        {u.status.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      {u.customer_name && (
                        <div className="mt-1 text-[11px] text-[#737373]">
                          {u.sold_to_customer ? (
                            <EntityLink
                              type="customer"
                              id={u.sold_to_customer}
                              label={u.customer_name}
                              onNavigate={onNavigate}
                            />
                          ) : u.sold_to_lead ? (
                            <EntityLink
                              type="lead"
                              id={u.sold_to_lead}
                              label={
                                u.customer_name || `Lead #${u.sold_to_lead}`
                              }
                              onNavigate={onNavigate}
                            />
                          ) : (
                            u.customer_name
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderInspectionBadge(u.vei_badge, u.vei_no)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {renderInspectionBadge(u.pdi_badge, u.pdi_no)}
                      {u.open_inspection_issues_count ? (
                        <span className="block text-[10px] text-[#DC2626] font-medium mt-0.5">
                          {u.open_inspection_issues_count} open {u.open_inspection_issues_count === 1 ? "issue" : "issues"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {formatDate(u.manufacture_date)}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] font-semibold text-[#04314A] whitespace-nowrap">
                      {formatNPR(u.selling_price)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Eye size={13} />}
                          onClick={() => onNavigate(`units/${u.id}`)}
                        >
                          View
                        </Button>
                        {canChange &&
                          (u.status === "IN_WAREHOUSE" ||
                            u.status === "PDI_FAILED") && (
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon={<Pencil size={13} />}
                              onClick={() =>
                                onNavigate(
                                  u.open_pdi_id
                                    ? `units/${u.id}/pdi/${u.open_pdi_id}${u.pdi_status === "DRAFT" ? "/edit" : ""}`
                                    : `units/${u.id}/pdi/new`,
                                )
                              }
                            >
                              PDI
                            </Button>
                          )}
                        {canChange && u.status === "READY_FOR_SALE" && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openQuick(u, "reserve")}
                            >
                              Reserve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openQuick(u, "sell")}
                            >
                              Sell
                            </Button>
                          </>
                        )}
                        {canDelete && (
                          <Button
                            variant="danger"
                            size="sm"
                            leftIcon={<Trash2 size={14} />}
                            aria-label={`Delete ${u.vin_chassis_no}`}
                            title="Delete"
                            onClick={() => setDeleting(u)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPage={setPage}
          total={units.length}
        />
      </div>

      {units.length === 0 && !loading && (
        <div className="text-center py-12 text-[13px] text-[#737373]">
          <Car size={28} className="mx-auto mb-2 text-[#B0B0AA]" />
          No units yet. Import your first batch to get started.
        </div>
      )}

      {/* Reserve / Sell modal */}
      {quickAction && (
        <Modal
          title={
            quickAction.kind === "reserve"
              ? "Reserve Unit"
              : "Mark Unit Sold & Finance Report"
          }
          onClose={() => setQuickAction(null)}
          size="lg"
        >
          <div className="bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl p-3.5 mb-5">
            <div className="text-[13px] font-semibold text-[#04314A]">
              {quickAction.unit.vin_chassis_no}
            </div>
            <div className="text-[12px] text-[#737373] mt-0.5">
              {getModelDisplayName(quickAction.unit.model_detail)}
              {quickAction.unit.color && ` · ${quickAction.unit.color}`}
              {quickAction.unit.selling_price &&
                ` · Asking: ${formatNPR(quickAction.unit.selling_price)}`}
            </div>
          </div>

          <div className="space-y-3.5">
            {quickAction.kind === "sell" && (
              <LeadPicker
                value={qaLeadId ? Number(qaLeadId) : null}
                onChange={(id, lead) => {
                  handleLeadSelect(id ? String(id) : "", lead as Lead);
                }}
                label="Connected CRM Lead"
                placeholder="Direct Sale / Walk-in Customer (No Lead)"
                allowClear
              />
            )}

            <FormField label="Customer / Buyer name" required>
              <Input
                value={qaCustomer}
                onChange={(e) => setQaCustomer(e.target.value)}
                placeholder="Full buyer or organization name…"
              />
            </FormField>

            {quickAction.kind === "reserve" && (
              <p className="text-[11px] text-[#737373]">
                Default reservation length can vary; check the expiry date shown.
                Expired reservations release the unit back to ready inventory.
              </p>
            )}

            {quickAction.kind === "sell" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Sold Price (NPR)" required>
                    <Input
                      value={qaPrice}
                      onChange={(e) => {
                        setQaPrice(e.target.value);
                        handlePriceOrDownPaymentChange(
                          e.target.value,
                          qaDownPayment,
                          qaLoanTenure,
                          qaInterestRate
                        );
                      }}
                      placeholder="e.g. 5900000"
                      inputMode="decimal"
                    />
                  </FormField>
                  <FormField label="Salesperson / Handled By">
                    <Input
                      value={qaSalesperson}
                      onChange={(e) => setQaSalesperson(e.target.value)}
                      placeholder="Sales executive name…"
                    />
                  </FormField>
                </div>

                <FormField label="Payment Mode">
                  <Select
                    value={qaPaymentMode}
                    onChange={(e) =>
                      setQaPaymentMode(
                        e.target.value as typeof qaPaymentMode
                      )
                    }
                    options={paymentModeOptions}
                  />
                </FormField>

                {qaPaymentMode !== "CASH" && (
                  <div className="border border-[#E8E8E5] rounded-xl p-4 bg-[#FAFAF8] space-y-3">
                    <h4 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#04314A]">
                      Bank Financing Details
                    </h4>

                    <FormField label="Financing Bank Name">
                      <Input
                        list="nepal-banks-list"
                        value={qaBankName}
                        onChange={(e) => setQaBankName(e.target.value)}
                        placeholder="e.g. Nabil Bank, NIC Asia Bank…"
                      />
                      <datalist id="nepal-banks-list">
                        {[
                          "Nabil Bank",
                          "NIC Asia Bank",
                          "Global IME Bank",
                          "Everest Bank",
                          "Nepal Investment Mega Bank",
                          "Rastriya Banijya Bank",
                          "Standard Chartered Bank Nepal",
                          "Siddhartha Bank",
                          "Sanima Bank",
                          "NMB Bank",
                          "Prabhu Bank",
                          "Kumari Bank",
                          "Himalayan Bank",
                          "Laxmi Sunrise Bank",
                        ].map((b) => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </FormField>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Down Payment (NPR)">
                        <Input
                          value={qaDownPayment}
                          onChange={(e) => {
                            setQaDownPayment(e.target.value);
                            handlePriceOrDownPaymentChange(
                              qaPrice,
                              e.target.value,
                              qaLoanTenure,
                              qaInterestRate
                            );
                          }}
                          placeholder="e.g. 1500000"
                          inputMode="decimal"
                        />
                      </FormField>
                      <FormField label="Financed Loan (NPR)">
                        <Input
                          value={qaLoanAmount}
                          onChange={(e) => {
                            setQaLoanAmount(e.target.value);
                            updateLoanEmi(
                              e.target.value,
                              qaLoanTenure,
                              qaInterestRate
                            );
                          }}
                          placeholder="e.g. 4400000"
                          inputMode="decimal"
                        />
                      </FormField>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <FormField label="Tenure (Mos)">
                        <Input
                          value={qaLoanTenure}
                          onChange={(e) => {
                            setQaLoanTenure(e.target.value);
                            updateLoanEmi(
                              qaLoanAmount,
                              e.target.value,
                              qaInterestRate
                            );
                          }}
                          placeholder="60"
                          inputMode="numeric"
                        />
                      </FormField>
                      <FormField label="Interest Rate %">
                        <Input
                          value={qaInterestRate}
                          onChange={(e) => {
                            setQaInterestRate(e.target.value);
                            updateLoanEmi(
                              qaLoanAmount,
                              qaLoanTenure,
                              e.target.value
                            );
                          }}
                          placeholder="11.5"
                          inputMode="decimal"
                        />
                      </FormField>
                      <FormField label="Monthly EMI">
                        <Input
                          value={qaEmi}
                          onChange={(e) => setQaEmi(e.target.value)}
                          placeholder="Auto / Manual"
                          inputMode="decimal"
                        />
                      </FormField>
                    </div>

                    <FormField label="Finance Status">
                      <Select
                        value={qaFinanceStatus}
                        onChange={(e) => setQaFinanceStatus(e.target.value)}
                        options={financeStatusOptions}
                      />
                    </FormField>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Tax Invoice No.">
                    <Input
                      value={qaTaxInvoice}
                      onChange={(e) => setQaTaxInvoice(e.target.value)}
                      placeholder="e.g. INV-2026-042"
                    />
                  </FormField>
                  <FormField label="Receipt Voucher No.">
                    <Input
                      value={qaReceiptVoucher}
                      onChange={(e) => setQaReceiptVoucher(e.target.value)}
                      placeholder="e.g. RV-9012"
                    />
                  </FormField>
                </div>

                <FormField label="Delivery / Sale Notes">
                  <Textarea
                    rows={2}
                    value={qaDeliveryNotes}
                    onChange={(e) => setQaDeliveryNotes(e.target.value)}
                    placeholder="Delivery instructions, handover notes, or special warranty agreements…"
                  />
                </FormField>
              </>
            )}
          </div>

          <div data-modal-actions className="flex gap-3 justify-end mt-5 pt-4 border-t border-[#E8E8E5]">
            <Button variant="secondary" onClick={() => setQuickAction(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={qaBusy} onClick={submitQuick}>
              {quickAction.kind === "reserve" ? "Reserve" : "Confirm Sale"}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        title={
          deleting
            ? `Delete unit ${deleting.vin_chassis_no}?`
            : "Delete unit?"
        }
        description="This will permanently remove all data associated with this unit: PDI inspections, stock movements, sale, payment, and reservation records. This action cannot be undone."
        confirmLabel="Delete everything"
        cancelLabel="Keep unit"
        variant="danger"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
