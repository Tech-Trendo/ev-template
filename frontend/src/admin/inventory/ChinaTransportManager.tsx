import { useEffect, useMemo, useState } from "react";
import { Download, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  createBatch,
  exportShipmentsCsv,
  fetchBatches,
  fetchBorderCrossings,
  fetchDestinationWarehouses,
  fetchTransportStatuses,
  formatDate,
  receiveBatchUnits,
  softDeleteShipment,
  SHIPMENT_STATUS_LABELS,
  TRANSPORT_STATUS_LABELS,
  updateBatch,
  type BorderCrossing,
  type DestinationWarehouse,
  type ImportBatch,
  type ShipmentStatus,
  type TransportStatus,
  type TransportStatusOption,
} from "@/lib/inventory";
import { Field, inputCls, Modal, useToast } from "../crm/ui";

const EMPTY_BATCH_FORM = {
  shipment_no: "",
  batch_no: "",
  supplier_exporter: "",
  origin: "",
  status: "IN_TRANSIT" as ShipmentStatus,
  transport_status: "IN_TRANSIT" as TransportStatus,
  container_bl_no: "",
  vessel_transport_mode: "Road Transport",
  port_of_loading: "Yibin, Sichuan",
  port_of_arrival: "Rasuwagadhi Border",
  border_crossing: "Rasuwagadhi (Kerung)",
  customs_declaration_no: "",
  container_or_truck_no: "",
  carrier_name: "",
  destination_warehouse: "Kathmandu Central Stockyard",
  lc_number: "",
  etd: "",
  eta: "",
  actual_arrival_date: "",
  shipped_date: "",
  eta_date: "",
  arrived_date: "",
  invoice_no: "",
  notes: "",
};

export default function ChinaTransportManager({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { hasPerm } = useAuth();
  const canCreate = hasPerm("inventory.add_importbatch");
  const canEdit = hasPerm("inventory.change_importbatch");
  const canDelete = hasPerm("inventory.delete_importbatch");
  const canChangeUnit = hasPerm("inventory.change_vehicleunit");

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [transportStatuses, setTransportStatuses] = useState<TransportStatusOption[]>([]);
  const [borderCrossings, setBorderCrossings] = useState<BorderCrossing[]>([]);
  const [destinationWarehouses, setDestinationWarehouses] = useState<DestinationWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [borderFilter, setBorderFilter] = useState<string>("ALL");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ImportBatch | null>(null);
  const [form, setForm] = useState(EMPTY_BATCH_FORM);
  const [busy, setBusy] = useState(false);

  const [receivingBatch, setReceivingBatch] = useState<ImportBatch | null>(null);
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);

  const [deleting, setDeleting] = useState<ImportBatch | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    Promise.all([
      fetchTransportStatuses({ is_active: "true" }).catch(() => [] as TransportStatusOption[]),
      fetchBorderCrossings({ is_active: "true" }).catch(() => [] as BorderCrossing[]),
      fetchDestinationWarehouses({ is_active: "true" }).catch(() => [] as DestinationWarehouse[]),
    ]).then(([st, bc, wh]) => {
      setTransportStatuses(st);
      setBorderCrossings(bc);
      setDestinationWarehouses(wh);
    });
  }, []);

  const load = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (statusFilter !== "ALL") params.status = statusFilter;
    if (borderFilter !== "ALL") params.border_crossing = borderFilter;

    fetchBatches(params)
      .then(setBatches)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load shipments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter, borderFilter]);

  const kpis = useMemo(() => {
    const totalBatches = batches.length;
    const inTransit = batches.filter(
      (b) => b.status === "IN_TRANSIT" || b.status === "ORDERED"
    );
    const atCustoms = batches.filter(
      (b) => b.status === "AT_PORT" || b.status === "CUSTOMS_CLEARANCE"
    );
    const arrived = batches.filter(
      (b) => b.status === "RECEIVED" || b.status === "CLOSED"
    );

    return {
      totalBatches,
      inTransitBatches: inTransit.length,
      atCustomsBatches: atCustoms.length,
      arrivedBatches: arrived.length,
    };
  }, [batches]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (borderFilter !== "ALL") params.border_crossing = borderFilter;

      const blob = await exportShipmentsCsv(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shipments-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.push("Shipments CSV exported successfully.");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setForm({
      ...EMPTY_BATCH_FORM,
      border_crossing: borderCrossings[0]?.name || "Rasuwagadhi (Kerung)",
      destination_warehouse: destinationWarehouses[0]?.name || "Kathmandu Central Stockyard",
    });
    setCreating(true);
  };

  const openEdit = (b: ImportBatch) => {
    setForm({
      shipment_no: b.shipment_no || b.batch_no,
      batch_no: b.batch_no,
      supplier_exporter: b.supplier_exporter || "",
      origin: b.origin || "",
      status: b.status || "IN_TRANSIT",
      transport_status: b.transport_status || "IN_TRANSIT",
      container_bl_no: b.container_bl_no || b.container_or_truck_no || "",
      vessel_transport_mode: b.vessel_transport_mode || "Road Transport",
      port_of_loading: b.port_of_loading || "",
      port_of_arrival: b.port_of_arrival || "",
      border_crossing: b.border_crossing || "Rasuwagadhi (Kerung)",
      customs_declaration_no: b.customs_declaration_no || "",
      container_or_truck_no: b.container_or_truck_no || "",
      carrier_name: b.carrier_name || "",
      destination_warehouse: b.destination_warehouse || "Kathmandu Central Stockyard",
      lc_number: b.lc_number || "",
      etd: b.etd ?? "",
      eta: b.eta ?? b.eta_date ?? "",
      actual_arrival_date: b.actual_arrival_date ?? b.arrived_date ?? "",
      shipped_date: b.shipped_date ?? "",
      eta_date: b.eta_date ?? "",
      arrived_date: b.arrived_date ?? "",
      invoice_no: b.invoice_no || "",
      notes: b.notes || "",
    });
    setEditing(b);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        ...form,
        etd: form.etd || null,
        eta: form.eta || null,
        actual_arrival_date: form.actual_arrival_date || null,
        shipped_date: form.shipped_date || null,
        eta_date: form.eta_date || null,
        arrived_date: form.arrived_date || null,
      };
      delete payload.shipment_no;
      delete payload.batch_no;
      delete payload.status; // status only via BatchDetail change-status
      delete payload.transport_status;
      if (creating) {
        const created = await createBatch(payload);
        toast.push(`Shipment ${created.shipment_no || created.batch_no} created`);
        setCreating(false);
        onNavigate(`batches/${created.id}`);
      } else if (editing) {
        await updateBatch(editing.id, payload);
        toast.push("Shipment updated");
        setEditing(null);
        load();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save shipment");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !deleteReason.trim()) {
      toast.push("Please provide a deletion reason.");
      return;
    }
    setDeleteBusy(true);
    try {
      await softDeleteShipment(deleting.id, deleteReason);
      toast.push("Shipment deleted successfully.");
      setDeleting(null);
      setDeleteReason("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[#0B3D2B]">Shipments & Imports.</h1>
          <p className="text-[13px] text-[#737373]">
            Track vehicle consignments, shipping milestones, and customs clearances from origin port to destination.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E8E8E5] bg-white text-[#0B3D2B] text-[12px] font-semibold hover:bg-[#F0F0ED] transition-colors"
          >
            <Download size={14} /> {exporting ? "Exporting..." : "Export CSV"}
          </button>
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors"
            >
              <Plus size={14} /> Add Shipment
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Total Shipments</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.totalBatches}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">In Transit / Ordered</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.inTransitBatches}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">At Port / Border</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.atCustomsBatches}</div>
        </div>
        <div className="bg-white border border-[#E8E8E5] rounded-xl p-3.5">
          <div className="text-[11px] text-[#737373]">Received in Warehouse</div>
          <div className="text-[22px] font-bold text-[#0B3D2B] mt-0.5">{kpis.arrivedBatches}</div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shipment number, supplier, BL/container, carrier..."
            className="w-full border border-[#E8E8E5] rounded-lg pl-9 pr-3 py-1.5 text-[12px] text-[#0B3D2B] placeholder:text-[#A0A09C] focus:outline-none focus:border-[#10B981]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[#E8E8E5] rounded-lg px-3 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
        >
          <option value="ALL">All Statuses</option>
          {Object.entries(SHIPMENT_STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={borderFilter}
          onChange={(e) => setBorderFilter(e.target.value)}
          className="border border-[#E8E8E5] rounded-lg px-3 py-1.5 text-[12px] text-[#0B3D2B] focus:outline-none focus:border-[#10B981]"
        >
          <option value="ALL">All Border Crossings</option>
          {borderCrossings.map((bc) => (
            <option key={bc.id} value={bc.name}>
              {bc.name}
            </option>
          ))}
        </select>

        {(search || statusFilter !== "ALL" || borderFilter !== "ALL") && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
              setBorderFilter("ALL");
            }}
            className="text-[12px] text-[#10B981] hover:underline"
          >
            Reset
          </button>
        )}

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 border border-[#E8E8E5] rounded-lg text-[12px] text-[#737373] hover:text-[#0B3D2B]"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-[12px] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E8E8E5] bg-[#F7F7F5] text-[11px] font-semibold text-[#737373]">
                <th className="px-4 py-3">Shipment / Supplier</th>
                <th className="px-4 py-3">BL / Container</th>
                <th className="px-4 py-3">Route & Mode</th>
                <th className="px-4 py-3">Vehicles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Milestone Dates</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#737373]">
                    Loading shipments...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#737373]">
                    No shipments found. Click &quot;Add Shipment&quot; above to create one.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3 font-medium text-[#0B3D2B]">
                      <div className="font-bold text-[#0B3D2B]">{b.shipment_no || b.batch_no}</div>
                      <div className="text-[11px] text-[#737373]">
                        {b.supplier_exporter || b.origin || "China Factory"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#0B3D2B]">
                      <div className="font-medium">{b.container_bl_no || b.container_or_truck_no || "-"}</div>
                      {b.carrier_name && (
                        <div className="text-[11px] text-[#737373]">{b.carrier_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#0B3D2B]">
                      <div>{b.vessel_transport_mode || "Road"}</div>
                      <div className="text-[11px] text-[#737373]">
                        {b.port_of_loading || "China"} to {b.port_of_arrival || b.border_crossing || "Destination"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#0B3D2B]">
                      <span className="font-semibold">{b.units_count} units</span>
                      <span className="text-[11px] text-[#737373] block">
                        ({b.remaining_count} in stock)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#0B3D2B]">
                      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#0B3D2B] text-white">
                        {b.status_display || SHIPMENT_STATUS_LABELS[b.status] || b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#737373] whitespace-nowrap">
                      {b.actual_arrival_date || b.arrived_date ? (
                        <div>Arrived: {formatDate(b.actual_arrival_date || b.arrived_date)}</div>
                      ) : (
                        <>
                          {(b.etd || b.shipped_date) && (
                            <div>ETD: {formatDate(b.etd || b.shipped_date)}</div>
                          )}
                          {(b.eta || b.eta_date) && (
                            <div>ETA: {formatDate(b.eta || b.eta_date)}</div>
                          )}
                          {!b.etd && !b.shipped_date && !b.eta && !b.eta_date && <div>-</div>}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => onNavigate(`batches/${b.id}`)}
                          className="px-2.5 py-1 rounded-md bg-[#0B3D2B] text-white text-[11px] font-semibold hover:bg-[#10B981] transition-colors"
                        >
                          View Details ({b.units_count})
                        </button>

                        {canEdit && (
                          <button
                            onClick={() => openEdit(b)}
                            className="p-1 rounded text-[#737373] hover:text-[#0B3D2B]"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => {
                              setDeleting(b);
                              setDeleteReason("");
                            }}
                            className="p-1 rounded text-[#737373] hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New / Edit Shipment */}
      {(creating || editing) && (
        <Modal
          title={creating ? "Add New Shipment" : `Edit Shipment: ${form.shipment_no || form.batch_no}`}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          wide
        >
          <div className="space-y-4">
            {editing ? (
              <p className="text-[12px] text-[#737373]">
                Status:{" "}
                <span className="font-semibold text-[#0B3D2B]">
                  {SHIPMENT_STATUS_LABELS[form.status] || form.status}
                </span>
                {" — "}change status from the shipment detail page.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier / Exporter">
                <input
                  value={form.supplier_exporter}
                  onChange={(e) => setForm({ ...form, supplier_exporter: e.target.value })}
                  placeholder="e.g. VT Automobile Manufacturing Co., Ltd."
                  className={inputCls}
                />
              </Field>

              <Field label="Origin Location">
                <input
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  placeholder="e.g. Yibin Factory, Sichuan"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Bill of Lading / Container No.">
                <input
                  value={form.container_bl_no}
                  onChange={(e) => setForm({ ...form, container_bl_no: e.target.value })}
                  placeholder="e.g. COSU61294819"
                  className={inputCls}
                />
              </Field>

              <Field label="Transport Mode">
                <select
                  value={form.vessel_transport_mode}
                  onChange={(e) => setForm({ ...form, vessel_transport_mode: e.target.value })}
                  className={inputCls}
                >
                  <option value="Road Transport">Road Transport</option>
                  <option value="Ocean Freight">Ocean Freight</option>
                  <option value="Rail Freight">Rail Freight</option>
                  <option value="Air Cargo">Air Cargo</option>
                </select>
              </Field>

              <Field label="Carrier / Freight Company">
                <input
                  value={form.carrier_name}
                  onChange={(e) => setForm({ ...form, carrier_name: e.target.value })}
                  placeholder="e.g. Trans-Himalayan Logistics"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Port of Loading">
                <input
                  value={form.port_of_loading}
                  onChange={(e) => setForm({ ...form, port_of_loading: e.target.value })}
                  placeholder="e.g. Shanghai Port / Chengdu ICD"
                  className={inputCls}
                />
              </Field>

              <Field label="Port of Arrival / Border">
                <input
                  value={form.port_of_arrival}
                  onChange={(e) => setForm({ ...form, port_of_arrival: e.target.value })}
                  placeholder="e.g. Rasuwagadhi Border / Birgunj ICD"
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Estimated Departure (ETD)">
                <input
                  type="date"
                  value={form.etd}
                  onChange={(e) => setForm({ ...form, etd: e.target.value })}
                  className={inputCls}
                />
              </Field>

              <Field label="Estimated Arrival (ETA)">
                <input
                  type="date"
                  value={form.eta}
                  onChange={(e) => setForm({ ...form, eta: e.target.value })}
                  className={inputCls}
                />
              </Field>

              <Field label="Actual Arrival Date">
                <input
                  type="date"
                  value={form.actual_arrival_date}
                  onChange={(e) => setForm({ ...form, actual_arrival_date: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Pragyapan Patra / Customs Declaration No.">
                <input
                  value={form.customs_declaration_no}
                  onChange={(e) => setForm({ ...form, customs_declaration_no: e.target.value })}
                  placeholder="e.g. PP-2081-82/0042"
                  className={inputCls}
                />
              </Field>

              <Field label="Destination Warehouse">
                <select
                  value={form.destination_warehouse}
                  onChange={(e) => setForm({ ...form, destination_warehouse: e.target.value })}
                  className={inputCls}
                >
                  {destinationWarehouses.map((wh) => (
                    <option key={wh.id} value={wh.name}>
                      {wh.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Border Crossing">
              <select
                value={form.border_crossing}
                onChange={(e) => setForm({ ...form, border_crossing: e.target.value })}
                className={inputCls}
              >
                {borderCrossings.map((bc) => (
                  <option key={bc.id} value={bc.name}>
                    {bc.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notes / Instructions">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Consignment special handling or shipping remarks..."
                className={inputCls}
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] disabled:opacity-50 transition-colors"
              >
                {busy ? "Saving..." : creating ? "Create Shipment" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Soft Delete with Mandatory Reason */}
      {deleting && (
        <Modal
          title={`Delete Shipment: ${deleting.shipment_no || deleting.batch_no}`}
          onClose={() => setDeleting(null)}
        >
          <div className="space-y-4">
            <p className="text-[12px] text-[#737373]">
              Deleting this shipment will mark it as soft-deleted in the system. Existing vehicle units and history will remain intact.
            </p>

            <Field label="Reason for deletion (Required)">
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="State the reason why this shipment is being removed..."
                rows={3}
                className={inputCls}
                required
              />
            </Field>

            <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="px-4 py-2 rounded-lg border border-[#E8E8E5] text-[12px] font-semibold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy || !deleteReason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteBusy ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
