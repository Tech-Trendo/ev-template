import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Clock,
  DollarSign,
  Download,
  FileText,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import { ApiError, API_BASE } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  addBatchUnits,
  attachExistingUnitsToShipment,
  changeShipmentStatus,
  createShipmentCost,
  deleteShipmentCost,
  fetchBatch,
  fetchModels,
  fetchShipmentCostTypes,
  fetchUnits,
  fetchVariants,
  formatDate,
  formatNPR,
  getModelDisplayName,
  importBatchCsv,
  receiveBatchUnits,
  recordShipmentPrint,
  SHIPMENT_STATUS_LABELS,
  type ImportBatch,
  type ShipmentCost,
  type ShipmentCostType,
  type ShipmentStatus,
  type UnitListItem,
  type VehicleModel,
  type VehicleVariant,
} from "@/lib/inventory";
import { Badge, Field, inputCls, Modal, useToast } from "../crm/ui";
import { EntityLink } from "../components/pickers";
import DocumentAttachmentWidget from "../documents/DocumentAttachmentWidget";
import { PrintFooter } from "@/components/PrintFooter";

type Row = {
  vin: string;
  model_id: string;
  variant_id: string;
  motor_no: string;
  battery_no: string;
  color: string;
  manufacture_date: string;
  odometer_km: string;
  purchase_cost: string;
  landed_cost: string;
  selling_price: string;
};

const EMPTY_ROW: Row = {
  vin: "",
  model_id: "",
  variant_id: "",
  motor_no: "",
  battery_no: "",
  color: "",
  manufacture_date: "",
  odometer_km: "",
  purchase_cost: "",
  landed_cost: "",
  selling_price: "",
};

export default function BatchDetail({
  batchId,
  onNavigate,
}: {
  batchId: string;
  onNavigate: (p: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canAddUnits = hasPerm("inventory.add_vehicleunit");
  const canViewCosts = hasPerm("inventory.view_shipment_costs");
  const canAddCost = hasPerm("inventory.add_shipmentcost");
  const canDeleteCost = hasPerm("inventory.delete_shipmentcost");
  const canChangeStatus = hasPerm("inventory.change_importbatch");

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [units, setUnits] = useState<UnitListItem[]>([]);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [costTypes, setCostTypes] = useState<ShipmentCostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Status Change Modal State
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<ShipmentStatus>("IN_TRANSIT");
  const [receiveStock, setReceiveStock] = useState(true);
  const [statusNotes, setStatusNotes] = useState("");
  const [statusChanging, setStatusChanging] = useState(false);

  // Cost Management Modal State
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costType, setCostType] = useState<number>(0);
  const [costAmount, setCostAmount] = useState("");
  const [costCurrency, setCostCurrency] = useState("NPR");
  const [costExchangeRate, setCostExchangeRate] = useState("1.00");
  const [costDescription, setCostDescription] = useState("");
  const [costBusy, setCostBusy] = useState(false);

  // Attach Existing Units Modal State
  const [attachUnitsModalOpen, setAttachUnitsModalOpen] = useState(false);
  const [allUnits, setAllUnits] = useState<UnitListItem[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [loadingUnitsToAttach, setLoadingUnitsToAttach] = useState(false);
  const [attachingUnits, setAttachingUnits] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchBatch(batchId),
      fetchUnits({ batch: batchId }).catch(() => [] as UnitListItem[]),
      fetchModels({ is_active: "true" }).catch(() => [] as VehicleModel[]),
      fetchVariants({ is_active: "true" }).catch(() => [] as VehicleVariant[]),
      canViewCosts ? fetchShipmentCostTypes({ is_active: "true" }).catch(() => [] as ShipmentCostType[]) : Promise.resolve([]),
    ])
      .then(([b, u, m, v, ct]) => {
        setBatch(b);
        setUnits(Array.isArray(u) ? u : (u as { results: UnitListItem[] }).results ?? []);
        setModels(m);
        setVariants(v);
        setCostTypes(ct);
        if (m.length === 1) setRows((rs) => rs.map((r) => ({ ...r, model_id: String(m[0].id) })));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [batchId]);

  const patchRow = (idx: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const saveRows = async () => {
    if (!batch) return;
    const payload = rows
      .filter((r) => r.vin.trim())
      .map((r) => ({
        vin: r.vin.trim(),
        model_id: r.model_id || undefined,
        variant_id: r.variant_id || undefined,
        motor_no: r.motor_no.trim(),
        battery_no: r.battery_no.trim(),
        color: r.color.trim(),
        manufacture_date: r.manufacture_date || undefined,
        odometer_km: r.odometer_km || undefined,
        purchase_cost: r.purchase_cost || undefined,
        landed_cost: r.landed_cost || undefined,
        selling_price: r.selling_price || undefined,
      }));
    if (payload.length === 0) {
      setError("Enter at least one VIN to add units.");
      return;
    }
    setSaving(true);
    setError("");
    setRowErrors([]);
    try {
      const res = await addBatchUnits(batch.id, payload);
      if (res.errors.length) setRowErrors(res.errors);
      toast.push(
        res.created_count
          ? `${res.created_count} unit${res.created_count > 1 ? "s" : ""} added`
          : "No units added",
      );
      setRows([{ ...EMPTY_ROW, model_id: models.length === 1 ? String(models[0].id) : "" }]);
      load();
    } catch (e) {
      if (e instanceof ApiError && typeof e.detail === "object" && e.detail !== null) {
        const d = e.detail as { errors?: string[] };
        if (d.errors) setRowErrors(d.errors);
      }
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadCsv = async (file: File) => {
    if (!batch) return;
    setUploading(true);
    setError("");
    setRowErrors([]);
    try {
      const res = await importBatchCsv(batch.id, file);
      if (res.errors.length) setRowErrors(res.errors);
      toast.push(
        res.created_count ? `${res.created_count} units imported` : "No units imported",
      );
      load();
    } catch (e) {
      if (e instanceof ApiError && typeof e.detail === "object" && e.detail !== null) {
        const d = e.detail as { errors?: string[] };
        if (d.errors) setRowErrors(d.errors);
      }
      setError(e instanceof ApiError ? e.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openStatusChange = () => {
    if (!batch) return;
    setNextStatus(batch.status || "IN_TRANSIT");
    setReceiveStock(batch.status !== "RECEIVED");
    setStatusNotes("");
    setStatusModalOpen(true);
  };

  const handleStatusChangeSubmit = async () => {
    if (!batch) return;
    setStatusChanging(true);
    setError("");

    try {
      await changeShipmentStatus(batch.id, {
        status: nextStatus,
        receive_units: nextStatus === "RECEIVED" ? receiveStock : false,
        notes: statusNotes,
      });
      toast.push(`Shipment status updated to ${SHIPMENT_STATUS_LABELS[nextStatus] || nextStatus}.`);
      setStatusModalOpen(false);
      load();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : "Failed to change status");
    } finally {
      setStatusChanging(false);
    }
  };

  const openCostModal = () => {
    if (costTypes.length > 0) setCostType(costTypes[0].id);
    setCostAmount("");
    setCostCurrency("NPR");
    setCostExchangeRate("1.00");
    setCostDescription("");
    setCostModalOpen(true);
  };

  const handleAddCostSubmit = async () => {
    if (!batch || !costType || !costAmount) {
      toast.push("Please select a cost type and enter an amount.");
      return;
    }
    setCostBusy(true);
    try {
      await createShipmentCost({
        shipment: batch.id,
        cost_type: costType,
        amount: costAmount,
        currency: costCurrency,
        exchange_rate: costExchangeRate || "1.00",
        description: costDescription,
      });
      toast.push("Cost line added successfully.");
      setCostModalOpen(false);
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to add cost line.");
    } finally {
      setCostBusy(false);
    }
  };

  const handleDeleteCost = async (costId: number) => {
    if (!window.confirm("Delete this cost line?")) return;
    try {
      await deleteShipmentCost(costId);
      toast.push("Cost line deleted.");
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to delete cost line.");
    }
  };

  const openAttachExistingUnitsModal = () => {
    setSelectedUnitIds([]);
    setAttachUnitsModalOpen(true);
    setLoadingUnitsToAttach(true);

    fetchUnits()
      .then((res) => {
        const list = Array.isArray(res) ? res : res.results ?? [];
        // Filter out units already in this batch
        setAllUnits(list.filter((u) => u.import_batch !== batch?.id));
      })
      .catch(() => setAllUnits([]))
      .finally(() => setLoadingUnitsToAttach(false));
  };

  const handleAttachExistingUnitsSubmit = async () => {
    if (!batch || selectedUnitIds.length === 0) return;
    setAttachingUnits(true);
    try {
      const res = await attachExistingUnitsToShipment(batch.id, selectedUnitIds);
      toast.push(res.detail || `${res.count} unit(s) attached to shipment.`);
      setAttachUnitsModalOpen(false);
      load();
    } catch (e: any) {
      toast.push(e instanceof ApiError ? e.message : "Failed to attach units.");
    } finally {
      setAttachingUnits(false);
    }
  };

  const handlePrintSummary = () => {
    if (!batch) return;
    recordShipmentPrint(batch.id).catch(() => {});
    window.print();
  };

  if (loading) {
    return <div className="py-24 text-center text-[13px] text-[#737373]">Loading shipment...</div>;
  }

  if (!batch) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white border border-[#E8E8E5] rounded-2xl p-8 text-center">
        <p className="text-[15px] font-bold text-[#0B3D2B] mb-2">Shipment not found</p>
        <p className="text-[13px] text-[#737373] mb-6">{error}</p>
        <button
          onClick={() => onNavigate("batches")}
          className="px-6 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
        >
          Back to Shipments
        </button>
      </div>
    );
  }

  const cell =
    "border border-[#E8E8E5] rounded-lg bg-white px-2 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981] w-full min-w-0";

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          onClick={() => onNavigate("china-transport")}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
        >
          <ArrowLeft size={14} /> Back to Shipments
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E8E5] bg-white text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
          >
            <Printer size={14} /> Print Summary
          </button>
          {canChangeStatus && (
            <button
              onClick={openStatusChange}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
            >
              Update Status
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-[12px] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Shipment Header Banner */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[24px] sm:text-[28px] font-bold text-[#0B3D2B]">
                {batch.shipment_no || batch.batch_no}
              </h1>
              <span className="inline-block px-3 py-0.5 rounded text-[12px] font-bold bg-[#0B3D2B] text-white">
                {batch.status_display || SHIPMENT_STATUS_LABELS[batch.status] || batch.status}
              </span>
            </div>
            <p className="text-[13px] text-[#737373] mt-1">
              Supplier: <span className="font-semibold text-[#0B3D2B]">{batch.supplier_exporter || batch.origin || "China Factory"}</span>
              {batch.container_bl_no && ` · BL/Container: ${batch.container_bl_no}`}
              {batch.carrier_name && ` · Carrier: ${batch.carrier_name}`}
            </p>
          </div>

          <div className="text-right text-[12px] text-[#737373]">
            <div>Created by: <span className="font-semibold text-[#0B3D2B]">{batch.created_by_name || "Head Office"}</span></div>
            <div>Created on: {formatDate(batch.created_at)}</div>
          </div>
        </div>

        {/* Milestone Dates Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-[#E8E8E5] text-[12px]">
          <div>
            <span className="block text-[11px] text-[#737373]">ETD Departure</span>
            <span className="font-semibold text-[#0B3D2B]">{formatDate(batch.etd || batch.shipped_date)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-[#737373]">ETA Border</span>
            <span className="font-semibold text-[#0B3D2B]">{formatDate(batch.eta || batch.eta_date)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-[#737373]">Actual Arrival</span>
            <span className="font-semibold text-[#0B3D2B]">{formatDate(batch.actual_arrival_date || batch.arrived_date)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-[#737373]">Customs Cleared</span>
            <span className="font-semibold text-[#0B3D2B]">{formatDate(batch.customs_clearance_date)}</span>
          </div>
          <div>
            <span className="block text-[11px] text-[#737373]">Warehouse Received</span>
            <span className="font-semibold text-[#0B3D2B]">{formatDate(batch.warehouse_received_date)}</span>
          </div>
        </div>
      </div>

      {/* Progress Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Units Expected / Added</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">
            {batch.progress_summary?.units_expected ?? units.length}
          </div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Units in Stockyard</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">
            {batch.progress_summary?.units_received ?? batch.remaining_count}
          </div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">VEI Inspection Completed</div>
          <div className="text-[22px] font-bold text-emerald-700 mt-0.5">
            {batch.progress_summary?.vei_done ?? 0}
          </div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">VEI with Issues</div>
          <div className="text-[22px] font-bold text-amber-700 mt-0.5">
            {batch.progress_summary?.vei_with_issues ?? 0}
          </div>
        </div>
      </div>

      {/* Landed Cost Section (Permission Gated) */}
      {canViewCosts && (
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[14px] font-bold text-[#0B3D2B] flex items-center gap-2">
                <DollarSign size={16} className="text-[#0B3D2B]" /> Landed Cost Lines & Unit Average
              </h3>
              <p className="text-[12px] text-[#737373] mt-0.5">
                Multi-currency freight, customs duty, and clearance cost allocation in NPR.
              </p>
            </div>
            {canAddCost && (
              <button
                onClick={openCostModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
              >
                <Plus size={13} /> Add Cost Line
              </button>
            )}
          </div>

          {/* Cost Summary Banner */}
          <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-[#FAFAF8] rounded-xl border border-[#E8E8E5]">
            <div>
              <span className="block text-[11px] text-[#737373]">Total Landed Cost</span>
              <span className="text-[18px] font-bold text-[#0B3D2B]">
                {formatNPR(batch.total_landed_cost_npr || 0)}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-[#737373]">Average Cost Per Unit</span>
              <span className="text-[18px] font-bold text-[#0B3D2B]">
                {formatNPR(batch.average_cost_per_unit_npr || 0)}
              </span>
            </div>
          </div>

          {/* Cost Breakdown Table */}
          {(!batch.costs || batch.costs.length === 0) ? (
            <p className="text-[12px] text-[#737373] py-4 text-center">No cost lines recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5] text-[11px] font-semibold text-[#737373]">
                    <th className="px-3 py-2">Cost Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Currency</th>
                    <th className="px-3 py-2">FX Rate to NPR</th>
                    <th className="px-3 py-2 text-right">Amount (NPR)</th>
                    {canDeleteCost && <th className="px-3 py-2 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {batch.costs.map((c) => (
                    <tr key={c.id} className="border-b border-[#F0F0ED]">
                      <td className="px-3 py-2.5 font-bold text-[#0B3D2B]">{c.cost_type_name || c.cost_type_code}</td>
                      <td className="px-3 py-2.5 text-[#737373]">{c.description || "-"}</td>
                      <td className="px-3 py-2.5 text-[#0B3D2B]">{Number(c.amount).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[#737373]">{c.currency}</td>
                      <td className="px-3 py-2.5 text-[#737373]">{Number(c.exchange_rate).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#0B3D2B]">
                        {formatNPR(c.amount_npr)}
                      </td>
                      {canDeleteCost && (
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteCost(c.id)}
                            className="p-1 rounded text-[#737373] hover:text-red-700"
                            title="Delete cost"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Units in Shipment Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[14px] font-bold text-[#0B3D2B]">
              Units in Shipment ({units.length})
            </h3>
            <p className="text-[12px] text-[#737373] mt-0.5">
              VIN, model variant, warehouse stock status, and vehicle inspection outcome.
            </p>
          </div>

          {canAddUnits && (
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={openAttachExistingUnitsModal}
                className="px-3 py-1.5 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
              >
                Attach Unassigned Units
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
              >
                <Upload size={13} className="inline mr-1" />
                {uploading ? "Importing..." : "Import CSV"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCsv(f);
                }}
              />
            </div>
          )}
        </div>

        {units.length === 0 ? (
          <p className="text-[12px] text-[#737373] py-8 text-center">
            No vehicle units added to this shipment yet. Add units using the form or CSV import below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5] text-[11px] font-semibold text-[#737373]">
                  <th className="px-3 py-2.5">VIN / Chassis</th>
                  <th className="px-3 py-2.5">Model & Variant</th>
                  <th className="px-3 py-2.5">Color</th>
                  <th className="px-3 py-2.5">Motor / Battery</th>
                  <th className="px-3 py-2.5">Unit Status</th>
                  <th className="px-3 py-2.5">VEI / Inspection</th>
                  <th className="px-3 py-2.5 text-right print:hidden">Profile</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8]">
                    <td className="px-3 py-2.5 font-bold text-[#0B3D2B]">
                      <button
                        onClick={() => onNavigate(`units/${u.id}`)}
                        className="hover:underline text-[#10B981]"
                      >
                        {u.vin_chassis_no}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-[#0B3D2B]">
                      <div>{getModelDisplayName(u.model_detail, u.variant_name)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[#737373]">{u.color || "-"}</td>
                    <td className="px-3 py-2.5 text-[#737373]">
                      <div>M: {u.motor_no || "-"}</div>
                      <div className="text-[11px]">B: {u.battery_no || "-"}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge status={u.status.toLowerCase()} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-[11px] text-[#0B3D2B]">
                        {u.pdi_status ? u.pdi_status.replace("_", " ") : "Pending VEI"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right print:hidden">
                      <button
                        onClick={() => onNavigate(`units/${u.id}`)}
                        className="text-[11px] font-semibold text-[#10B981] hover:underline"
                      >
                        View &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Units Rows Form */}
        {canAddUnits && (
          <div className="mt-6 pt-5 border-t border-[#E8E8E5] print:hidden">
            <h4 className="text-[13px] font-bold text-[#0B3D2B] mb-3">Add New Units</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-[#737373]">
                    <th className="pb-2">VIN / Chassis *</th>
                    <th className="pb-2">Model *</th>
                    <th className="pb-2">Variant</th>
                    <th className="pb-2">Motor No</th>
                    <th className="pb-2">Battery No</th>
                    <th className="pb-2">Color</th>
                    {rows.length > 1 && <th className="pb-2">Action</th>}
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {rows.map((r, i) => {
                    const modelVariants = variants.filter(
                      (v) => String(v.vehicle_model) === r.model_id
                    );
                    return (
                      <tr key={i}>
                        <td className="pr-2 pb-2">
                          <input
                            value={r.vin}
                            onChange={(e) => patchRow(i, { vin: e.target.value })}
                            placeholder="VIN Chassis"
                            className={cell}
                          />
                        </td>
                        <td className="pr-2 pb-2 min-w-[140px]">
                          <select
                            value={r.model_id}
                            onChange={(e) => patchRow(i, { model_id: e.target.value, variant_id: "" })}
                            className={cell}
                          >
                            <option value="">Select Model</option>
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.brand} {m.model_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="pr-2 pb-2 min-w-[120px]">
                          <select
                            value={r.variant_id}
                            onChange={(e) => patchRow(i, { variant_id: e.target.value })}
                            className={cell}
                          >
                            <option value="">Standard</option>
                            {modelVariants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="pr-2 pb-2">
                          <input
                            value={r.motor_no}
                            onChange={(e) => patchRow(i, { motor_no: e.target.value })}
                            placeholder="Motor No"
                            className={cell}
                          />
                        </td>
                        <td className="pr-2 pb-2">
                          <input
                            value={r.battery_no}
                            onChange={(e) => patchRow(i, { battery_no: e.target.value })}
                            placeholder="Battery No"
                            className={cell}
                          />
                        </td>
                        <td className="pr-2 pb-2">
                          <input
                            value={r.color}
                            onChange={(e) => patchRow(i, { color: e.target.value })}
                            placeholder="Color"
                            className={cell}
                          />
                        </td>
                        {rows.length > 1 && (
                          <td className="pb-2">
                            <button
                              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                              className="text-red-600 p-1 hover:text-red-800"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setRows((rs) => [...rs, { ...EMPTY_ROW, model_id: models[0] ? String(models[0].id) : "" }])}
                className="px-3 py-1.5 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#0B3D2B] hover:bg-[#F0F0ED]"
              >
                + Add Another Row
              </button>
              <button
                onClick={saveRows}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50"
              >
                {saving ? "Saving Units..." : "Save Vehicle Units"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Document Vault Widget for Shipment Documents */}
      <div className="print:hidden">
        <DocumentAttachmentWidget
          targetType="shipment"
          targetId={batch.id}
          targetTitle={batch.shipment_no || batch.batch_no}
        />
      </div>

      {/* Print Footer Component */}
      <div className="hidden print:block mt-8">
        <PrintFooter
          documentType="SHIPMENT_SUMMARY"
          objectId={batch.id}
          pageInfo="Shipment Consignment Report"
        />
      </div>

      {/* Modal: Status Update */}
      {statusModalOpen && (
        <Modal
          title={`Update Shipment Status: ${batch.shipment_no || batch.batch_no}`}
          onClose={() => setStatusModalOpen(false)}
        >
          <div className="space-y-4">
            <Field label="New Status">
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as ShipmentStatus)}
                className={inputCls}
              >
                {Object.entries(SHIPMENT_STATUS_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            {nextStatus === "RECEIVED" && (
              <label className="flex items-center gap-2 text-[12px] font-medium text-[#0B3D2B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={receiveStock}
                  onChange={(e) => setReceiveStock(e.target.checked)}
                  className="rounded border-[#E8E8E5]"
                />
                <span>Automatically mark shipment units into stockyard inventory</span>
              </label>
            )}

            <Field label="Status Change Notes (Optional)">
              <textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Log notes for this transition..."
                rows={2}
                className={inputCls}
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStatusChangeSubmit}
                disabled={statusChanging}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {statusChanging ? "Updating..." : "Confirm Status Change"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Add Landed Cost Line */}
      {costModalOpen && (
        <Modal
          title="Add Shipment Landed Cost"
          onClose={() => setCostModalOpen(false)}
        >
          <div className="space-y-4">
            <Field label="Cost Type">
              <select
                value={costType}
                onChange={(e) => setCostType(Number(e.target.value))}
                className={inputCls}
              >
                {costTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input
                  type="number"
                  step="0.01"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className={inputCls}
                />
              </Field>

              <Field label="Currency">
                <select
                  value={costCurrency}
                  onChange={(e) => {
                    const c = e.target.value;
                    setCostCurrency(c);
                    if (c === "NPR") setCostExchangeRate("1.00");
                  }}
                  className={inputCls}
                >
                  <option value="NPR">NPR (Nepalese Rupee)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="CNY">CNY (Chinese Yuan)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="INR">INR (Indian Rupee)</option>
                </select>
              </Field>
            </div>

            {costCurrency !== "NPR" && (
              <Field label={`Exchange Rate (${costCurrency} to NPR)`}>
                <input
                  type="number"
                  step="0.0001"
                  value={costExchangeRate}
                  onChange={(e) => setCostExchangeRate(e.target.value)}
                  placeholder="e.g. 133.50"
                  className={inputCls}
                />
              </Field>
            )}

            <Field label="Description (Optional)">
              <input
                value={costDescription}
                onChange={(e) => setCostDescription(e.target.value)}
                placeholder="e.g. Port handling at Haldia / Kerung clearance"
                className={inputCls}
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setCostModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCostSubmit}
                disabled={costBusy || !costAmount}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {costBusy ? "Saving..." : "Add Cost"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Attach Existing Unassigned Units */}
      {attachUnitsModalOpen && (
        <Modal
          title="Attach Existing Vehicles to Shipment"
          onClose={() => setAttachUnitsModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            <p className="text-[12px] text-[#737373]">
              Select unassigned vehicle units from the system to attach to this shipment.
            </p>

            <div className="max-h-64 overflow-y-auto border border-[#E8E8E5] rounded-xl">
              {loadingUnitsToAttach ? (
                <div className="p-6 text-center text-[12px] text-[#737373]">Loading units...</div>
              ) : allUnits.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-[#737373]">No other units found.</div>
              ) : (
                <div className="divide-y divide-[#E8E8E5]">
                  {allUnits.map((u) => {
                    const isChecked = selectedUnitIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`p-3 flex items-center justify-between gap-3 text-[12px] cursor-pointer hover:bg-[#FAFAF8] ${
                          isChecked ? "bg-[#F0F7FA]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedUnitIds((ids) => [...ids, u.id]);
                              else setSelectedUnitIds((ids) => ids.filter((id) => id !== u.id));
                            }}
                          />
                          <div>
                            <span className="font-bold text-[#0B3D2B]">{u.vin_chassis_no}</span>
                            <span className="text-[#737373] ml-2">
                              {getModelDisplayName(u.model_detail, u.variant_name)}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] text-[#737373]">{u.status}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setAttachUnitsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAttachExistingUnitsSubmit}
                disabled={attachingUnits || selectedUnitIds.length === 0}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {attachingUnits ? "Attaching..." : `Attach ${selectedUnitIds.length} Unit(s)`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
