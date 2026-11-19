import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Container,
  Milestone,
  Warehouse,
  CheckCircle,
  XCircle,
  Search,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  fetchTransportStatuses,
  createTransportStatus,
  updateTransportStatus,
  deleteTransportStatus,
  fetchBorderCrossings,
  createBorderCrossing,
  updateBorderCrossing,
  deleteBorderCrossing,
  fetchDestinationWarehouses,
  createDestinationWarehouse,
  updateDestinationWarehouse,
  deleteDestinationWarehouse,
  formatDate,
  type TransportStatusOption,
  type BorderCrossing,
  type DestinationWarehouse,
} from "@/lib/inventory";
import { Modal, PageHeader, Pagination, TableState, ghostBtnCls, primaryBtnCls, useToast } from "../crm/ui";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

const inputCls =
  "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";
const labelCls = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";

function StatusForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: TransportStatusOption | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [isCustomName, setIsCustomName] = useState(Boolean(initial));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!isCustomName && !initial) {
      const auto = val
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "");
      setName(auto);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!label.trim()) return setError("Display label is required");
    if (!name.trim()) return setError("System code is required");
    setBusy(true);
    try {
      if (initial) {
        // Never rename system code — ImportBatch.transport_status stores it as a string
        await updateTransportStatus(initial.id, {
          label: label.trim(),
          description: description.trim(),
          is_active: isActive,
        });
      } else {
        await createTransportStatus({
          name: name.trim().toUpperCase(),
          label: label.trim(),
          description: description.trim(),
          is_active: isActive,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit Transport Status" : "Add Transport Status"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Display Label *</label>
          <input
            className={inputCls}
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Held at Border Customs"
            required
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>System Code *</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => {
              setIsCustomName(true);
              setName(e.target.value.toUpperCase().replace(/\s+/g, "_"));
            }}
            placeholder="e.g. HELD_BORDER_CUSTOMS"
            required
            readOnly={!!initial}
            disabled={!!initial}
          />
          <p className="mt-1 text-[11px] text-[#737373]">
            {initial
              ? "System code cannot be changed after creation (linked on shipment records)."
              : "Identifier stored in shipment records. Use letters, numbers, and underscores."}
          </p>
        </div>

        <div>
          <label className={labelCls}>Description (Optional)</label>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief explanation of this transport stage"
          />
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-[#10B981]"
            />
            <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
          </label>
        </div>

        {error && <p className="text-[12px] text-red-600 bg-red-50 border-l-2 border-red-500 px-3 py-2">{error}</p>}

        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>
            {busy ? "Saving…" : initial ? "Save Changes" : "Add Transport Status"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BorderForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: BorderCrossing | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Border crossing name is required");
    setBusy(true);
    try {
      if (initial) {
        await updateBorderCrossing(initial.id, {
          name: name.trim(),
          description: description.trim(),
          is_active: isActive,
        });
      } else {
        await createBorderCrossing({
          name: name.trim(),
          description: description.trim(),
          is_active: isActive,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit Border Crossing" : "Add Border Crossing"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Border Crossing Name *</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rasuwagadhi (Kerung)"
            required
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Description (Optional)</label>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Northern checkpoint connecting Rasuwa and Gyirong"
          />
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-[#10B981]"
            />
            <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
          </label>
        </div>

        {error && <p className="text-[12px] text-red-600 bg-red-50 border-l-2 border-red-500 px-3 py-2">{error}</p>}

        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>
            {busy ? "Saving…" : initial ? "Save Changes" : "Add Border Crossing"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WarehouseForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: DestinationWarehouse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contact_person ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Warehouse name is required");
    setBusy(true);
    try {
      if (initial) {
        await updateDestinationWarehouse(initial.id, {
          name: name.trim(),
          location: location.trim(),
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          is_active: isActive,
        });
      } else {
        await createDestinationWarehouse({
          name: name.trim(),
          location: location.trim(),
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          is_active: isActive,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit Destination Warehouse" : "Add Destination Warehouse"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Warehouse Name *</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kathmandu Central Stockyard"
            required
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Location / Address</label>
          <input
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Bagdol, Lalitpur"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contact Person</label>
            <input
              className={inputCls}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Yard Supervisor"
            />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 98XXXXXXXX"
            />
          </div>
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-[#10B981]"
            />
            <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
          </label>
        </div>

        {error && <p className="text-[12px] text-red-600 bg-red-50 border-l-2 border-red-500 px-3 py-2">{error}</p>}

        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>
            {busy ? "Saving…" : initial ? "Save Changes" : "Add Warehouse"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function InventoryAdditionalsPage() {
  const [statuses, setStatuses] = useState<TransportStatusOption[]>([]);
  const [crossings, setCrossings] = useState<BorderCrossing[]>([]);
  const [warehouses, setWarehouses] = useState<DestinationWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"statuses" | "crossings" | "warehouses">("statuses");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [creatingStatus, setCreatingStatus] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TransportStatusOption | null>(null);

  const [creatingCrossing, setCreatingCrossing] = useState(false);
  const [editingCrossing, setEditingCrossing] = useState<BorderCrossing | null>(null);

  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<DestinationWarehouse | null>(null);

  const toast = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchTransportStatuses(),
      fetchBorderCrossings(),
      fetchDestinationWarehouses(),
    ])
      .then(([s, c, w]) => {
        setStatuses(s);
        setCrossings(c);
        setWarehouses(w);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Reset page when tab or search changes
  useEffect(() => {
    setPage(0);
  }, [activeTab, search]);

  // Actions for Transport Statuses
  const toggleStatusActive = async (s: TransportStatusOption) => {
    try {
      await updateTransportStatus(s.id, { is_active: !s.is_active });
      toast.push(s.is_active ? `"${s.label}" deactivated.` : `"${s.label}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const removeStatus = async (s: TransportStatusOption) => {
    if (s.batch_count > 0) {
      setError(
        `Cannot delete "${s.label}" because it is used by ${s.batch_count} shipment${s.batch_count === 1 ? "" : "s"}. Deactivate it instead.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${s.label}"? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteTransportStatus(s.id);
      toast.push(`"${s.label}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  // Actions for Border Crossings
  const toggleCrossingActive = async (c: BorderCrossing) => {
    try {
      await updateBorderCrossing(c.id, { is_active: !c.is_active });
      toast.push(c.is_active ? `"${c.name}" deactivated.` : `"${c.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const removeCrossing = async (c: BorderCrossing) => {
    if (c.batch_count > 0) {
      setError(
        `Cannot delete "${c.name}" because it is used by ${c.batch_count} shipment${c.batch_count === 1 ? "" : "s"}. Deactivate it instead.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteBorderCrossing(c.id);
      toast.push(`"${c.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  // Actions for Destination Warehouses
  const toggleWarehouseActive = async (w: DestinationWarehouse) => {
    try {
      await updateDestinationWarehouse(w.id, { is_active: !w.is_active });
      toast.push(w.is_active ? `"${w.name}" deactivated.` : `"${w.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const removeWarehouse = async (w: DestinationWarehouse) => {
    if (w.batch_count > 0) {
      setError(
        `Cannot delete "${w.name}" because it is used by ${w.batch_count} shipment${w.batch_count === 1 ? "" : "s"}. Deactivate it instead.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${w.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteDestinationWarehouse(w.id);
      toast.push(`"${w.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  // Filtered lists
  const query = search.toLowerCase().trim();

  const filteredStatuses = statuses.filter(
    (s) => s.label.toLowerCase().includes(query) || s.name.toLowerCase().includes(query) || (s.description && s.description.toLowerCase().includes(query)),
  );
  const visibleStatuses = filteredStatuses.slice(page * pageSize, (page + 1) * pageSize);
  const statusPageCount = Math.max(1, Math.ceil(filteredStatuses.length / pageSize));

  const filteredCrossings = crossings.filter(
    (c) => c.name.toLowerCase().includes(query) || (c.description && c.description.toLowerCase().includes(query)),
  );
  const visibleCrossings = filteredCrossings.slice(page * pageSize, (page + 1) * pageSize);
  const crossingPageCount = Math.max(1, Math.ceil(filteredCrossings.length / pageSize));

  const filteredWarehouses = warehouses.filter(
    (w) =>
      w.name.toLowerCase().includes(query) ||
      (w.location && w.location.toLowerCase().includes(query)) ||
      (w.contact_person && w.contact_person.toLowerCase().includes(query)),
  );
  const visibleWarehouses = filteredWarehouses.slice(page * pageSize, (page + 1) * pageSize);
  const warehousePageCount = Math.max(1, Math.ceil(filteredWarehouses.length / pageSize));
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Inventory & Logistics"
        title="Additional Settings."
        subtitle="Manage dynamic transport statuses, border crossings, and destination warehouses. Updates here reflect across China shipment forms and stock filters in real time."
      />

      {error && (
        <div className="mb-2 text-[12px] text-red-600 bg-red-50 border-l-2 border-red-500 px-3 py-2 rounded-r-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-[11px] font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[#E8E8E5]">
        <button
          onClick={() => setActiveTab("statuses")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${
            activeTab === "statuses"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Container size={15} />
          Transport Statuses
          <span className="ml-1 px-2 py-0.5 text-[9px] font-bold bg-[#F0F0ED] text-[#737373] rounded-full">
            {statuses.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("crossings")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${
            activeTab === "crossings"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Milestone size={15} />
          Border Crossings
          <span className="ml-1 px-2 py-0.5 text-[9px] font-bold bg-[#F0F0ED] text-[#737373] rounded-full">
            {crossings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("warehouses")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${
            activeTab === "warehouses"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Warehouse size={15} />
          Destination Warehouses
          <span className="ml-1 px-2 py-0.5 text-[9px] font-bold bg-[#F0F0ED] text-[#737373] rounded-full">
            {warehouses.length}
          </span>
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === "statuses"
                ? "Search transport statuses..."
                : activeTab === "crossings"
                ? "Search border crossings..."
                : "Search destination warehouses..."
            }
            className="w-full border border-[#E8E8E5] rounded-xl pl-9 pr-3 py-2 text-[12px] text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors"
          />
        </div>

        {activeTab === "statuses" && (
          <button onClick={() => setCreatingStatus(true)} className={primaryBtnCls}>
            <Plus size={14} /> Add Transport Status
          </button>
        )}
        {activeTab === "crossings" && (
          <button onClick={() => setCreatingCrossing(true)} className={primaryBtnCls}>
            <Plus size={14} /> Add Border Crossing
          </button>
        )}
        {activeTab === "warehouses" && (
          <button onClick={() => setCreatingWarehouse(true)} className={primaryBtnCls}>
            <Plus size={14} /> Add Destination Warehouse
          </button>
        )}
      </div>

      {/* Tab 1: Transport Statuses */}
      {activeTab === "statuses" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-[12px] text-[#737373]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                {statuses.filter((s) => s.is_active).length} Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />
                {statuses.filter((s) => !s.is_active).length} Inactive
              </span>
            </div>
          </div>

          <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Display Label", "System Code", "Status", "Shipments", "Created", "Actions"].map((h, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${
                        i === 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={6} loading={loading} empty={!loading && filteredStatuses.length === 0} />
                {visibleStatuses.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0B3D2B] text-[13px]">{s.label}</div>
                      {s.description && <div className="text-[11px] text-[#737373] mt-0.5">{s.description}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-[12px] text-[#737373] bg-[#F0F0ED] px-2 py-0.5 rounded">
                        {s.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${
                          s.is_active ? "bg-[#10B981] text-white" : "bg-[#F0F0ED] text-[#737373]"
                        }`}
                      >
                        {s.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{s.batch_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingStatus(s)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleStatusActive(s)}
                          title={s.is_active ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          {s.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => removeStatus(s)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {statusPageCount > 1 && (
              <Pagination
                page={page}
                pageCount={statusPageCount}
                onPage={setPage}
                total={filteredStatuses.length}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Border Crossings */}
      {activeTab === "crossings" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-[12px] text-[#737373]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                {crossings.filter((c) => c.is_active).length} Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />
                {crossings.filter((c) => !c.is_active).length} Inactive
              </span>
            </div>
          </div>

          <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Border Crossing Name", "Description", "Status", "Shipments", "Created", "Actions"].map((h, i) => (
                    <th
                      key={i}
                      className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${
                        i === 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={6} loading={loading} empty={!loading && filteredCrossings.length === 0} />
                {visibleCrossings.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0B3D2B] text-[13px]">{c.name}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                      {c.description || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${
                          c.is_active ? "bg-[#10B981] text-white" : "bg-[#F0F0ED] text-[#737373]"
                        }`}
                      >
                        {c.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{c.batch_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingCrossing(c)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleCrossingActive(c)}
                          title={c.is_active ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          {c.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => removeCrossing(c)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCrossings.length > 0 && (
              <Pagination
                page={page}
                pageCount={crossingPageCount}
                onPage={setPage}
                total={filteredCrossings.length}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Destination Warehouses */}
      {activeTab === "warehouses" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-[12px] text-[#737373]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                {warehouses.filter((w) => w.is_active).length} Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />
                {warehouses.filter((w) => !w.is_active).length} Inactive
              </span>
            </div>
          </div>

          <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Warehouse Name", "Location / Address", "Contact / Phone", "Status", "Shipments", "Created", "Actions"].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${
                          i === 6 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={7} loading={loading} empty={!loading && filteredWarehouses.length === 0} />
                {visibleWarehouses.map((w) => (
                  <tr
                    key={w.id}
                    className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0B3D2B] text-[13px]">{w.name}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">{w.location || "—"}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                      {w.contact_person || w.phone ? (
                        <div>
                          {w.contact_person && <span className="font-medium text-[#0B3D2B]">{w.contact_person}</span>}
                          {w.contact_person && w.phone && <span className="text-[#B0B0AA]"> • </span>}
                          {w.phone && <span>{w.phone}</span>}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${
                          w.is_active ? "bg-[#10B981] text-white" : "bg-[#F0F0ED] text-[#737373]"
                        }`}
                      >
                        {w.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {w.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{w.batch_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                      {formatDate(w.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingWarehouse(w)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleWarehouseActive(w)}
                          title={w.is_active ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                        >
                          {w.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => removeWarehouse(w)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-[#737373] hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredWarehouses.length > 0 && (
              <Pagination
                page={page}
                pageCount={warehousePageCount}
                onPage={setPage}
                total={filteredWarehouses.length}
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {creatingStatus && (
        <StatusForm onClose={() => setCreatingStatus(false)} onSaved={load} />
      )}
      {editingStatus && (
        <StatusForm initial={editingStatus} onClose={() => setEditingStatus(null)} onSaved={load} />
      )}

      {creatingCrossing && (
        <BorderForm onClose={() => setCreatingCrossing(false)} onSaved={load} />
      )}
      {editingCrossing && (
        <BorderForm initial={editingCrossing} onClose={() => setEditingCrossing(null)} onSaved={load} />
      )}

      {creatingWarehouse && (
        <WarehouseForm onClose={() => setCreatingWarehouse(false)} onSaved={load} />
      )}
      {editingWarehouse && (
        <WarehouseForm initial={editingWarehouse} onClose={() => setEditingWarehouse(null)} onSaved={load} />
      )}
    </div>
  );
}
