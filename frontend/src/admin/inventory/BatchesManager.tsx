import { useEffect, useState } from "react";
import { Container, Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  createBatch,
  createModel,
  deleteModel,
  fetchBatches,
  fetchModels,
  formatDate,
  getModelDisplayName,
  softDeleteShipment,
  updateBatch,
  updateModel,
  type ImportBatch,
  type VehicleModel,
} from "@/lib/inventory";
import { Field, inputCls, Modal, PageHeader, SelectField, TableState, useToast } from "../crm/ui";

const filterCls = inputCls.replace(" w-full", "");

const EMPTY_BATCH = {
  batch_no: "",
  origin: "",
  shipped_date: "",
  arrived_date: "",
  invoice_no: "",
  notes: "",
};

export default function BatchesManager({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("inventory.add_importbatch");
  const canDelete = hasPerm("inventory.delete_importbatch");

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ImportBatch | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_BATCH);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ImportBatch | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    fetchBatches(params)
      .then(setBatches)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openCreate = () => {
    setForm(EMPTY_BATCH);
    setCreating(true);
  };

  const openEdit = (b: ImportBatch) => {
    setForm({
      batch_no: b.batch_no,
      origin: b.origin,
      shipped_date: b.shipped_date ?? "",
      arrived_date: b.arrived_date ?? "",
      invoice_no: b.invoice_no,
      notes: b.notes,
    });
    setEditing(b);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...form,
        shipped_date: form.shipped_date || null,
        arrived_date: form.arrived_date || null,
      };
      if (creating) {
        const created = await createBatch(body);
        toast.push(`Batch ${created.batch_no} created`);
        setCreating(false);
        onNavigate(`batches/${created.id}`);
      } else if (editing) {
        await updateBatch(editing.id, body);
        toast.push("Batch updated");
        setEditing(null);
        load();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
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
      await softDeleteShipment(deleting.id, deleteReason.trim());
      toast.push("Batch deleted");
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
      <PageHeader
        eyebrow="Inventory"
        title="Batches."
        subtitle="Shipments arriving from China — add units to each batch."
        action={
          canWrite ? (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors"
            >
              <Plus size={14} /> New Batch
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search batch no, invoice, origin…"
          className={`${filterCls} w-64`}
        />
      </div>

      <ModelsSection />

      {error && (
        <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[860px]">
          <thead>
            <tr className="border-b border-[#E8E8E5]">
              {["Batch No", "Origin", "Shipped", "Arrived", "Invoice", "Units", "Sold", "Remaining", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableState loading empty={false} colSpan={9} />
            ) : batches.length === 0 ? (
              <TableState loading={false} empty colSpan={9} />
            ) : (
              batches.map((b) => (
                <tr key={b.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => onNavigate(`batches/${b.id}`)}
                      className="text-[13px] font-bold text-[#10B981] hover:text-[#0B3D2B]"
                    >
                      {b.batch_no}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{b.origin || "—"}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                    {formatDate(b.shipped_date)}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                    {formatDate(b.arrived_date)}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{b.invoice_no || "—"}</td>
                  <td className="px-5 py-3.5 text-[12px] font-bold text-[#0B3D2B]">{b.units_count}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{b.sold_count}</td>
                  <td className="px-5 py-3.5 text-[12px] font-bold text-[#0B3D2B]">{b.remaining_count}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      {canWrite && (
                        <button
                          onClick={() => openEdit(b)}
                          className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleting(b)}
                          className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"
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

      {batches.length === 0 && !loading && (
        <div className="mt-6 text-center text-[13px] text-[#737373]">
          <Container size={28} className="mx-auto mb-2 text-[#B0B0AA]" />
          No batches yet — create your first import batch.
        </div>
      )}

      {(creating || editing) && (
        <Modal title={creating ? "New Import Batch" : `Edit ${editing?.batch_no}`} onClose={() => { setCreating(false); setEditing(null); }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Batch No (auto if blank)">
              <input
                value={form.batch_no}
                onChange={(e) => setForm({ ...form, batch_no: e.target.value })}
                placeholder="IMP-202601-0001"
                className={inputCls}
              />
            </Field>
            <Field label="Invoice No">
              <input
                value={form.invoice_no}
                onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
                placeholder="INV-…"
                className={inputCls}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Origin (factory / port)">
                <input
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  placeholder="e.g. Shanghai Port via Birgunj"
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Shipped Date">
              <input
                type="date"
                value={form.shipped_date}
                onChange={(e) => setForm({ ...form, shipped_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Arrived Date">
              <input
                type="date"
                value={form.arrived_date}
                onChange={(e) => setForm({ ...form, arrived_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </div>
          <div data-modal-actions className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => { setCreating(false); setEditing(null); }}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : creating ? "Create & Add Units" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete Batch?" onClose={() => { setDeleting(null); setDeleteReason(""); }}>
          <p className="text-[13px] text-[#737373] leading-relaxed mb-4">
            Soft-delete batch <span className="font-bold text-[#0B3D2B]">{deleting.batch_no}</span>?
            A reason is required.
          </p>
          <Field label="Deletion reason">
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Why is this batch being deleted?"
            />
          </Field>
          <div data-modal-actions className="flex gap-3 justify-end mt-4">
            <button
              onClick={() => { setDeleting(null); setDeleteReason(""); }}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleteBusy || !deleteReason.trim()}
              className="px-6 py-2.5 rounded-full bg-[#B00020] text-white text-[12px] font-semibold hover:bg-[#8B0000] transition-colors disabled:opacity-50"
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}

const EMPTY_MODEL = {
  brand: "",
  model_name: "",
  battery_power_kw: "",
  motor_power_kw: "",
  seating_capacity: "",
  charger_type: "",
  default_color_options: "",
  low_stock_threshold: "5",
  is_active: true,
};

function ModelsSection() {
  const { hasPerm } = useAuth();
  const canWrite = hasPerm("inventory.add_vehiclemodel");
  const canDelete = hasPerm("inventory.delete_vehiclemodel");
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleModel | null>(null);
  const [form, setForm] = useState(EMPTY_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = () => {
    fetchModels()
      .then(setModels)
      .catch(() => undefined);
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(EMPTY_MODEL);
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (m: VehicleModel) => {
    setForm({
      brand: m.brand,
      model_name: m.model_name,
      battery_power_kw: m.battery_power_kw ?? "",
      motor_power_kw: m.motor_power_kw ?? "",
      seating_capacity: m.seating_capacity != null ? String(m.seating_capacity) : "",
      charger_type: m.charger_type,
      default_color_options: (m.default_color_options ?? []).join(", "),
      low_stock_threshold: String(m.low_stock_threshold),
      is_active: m.is_active,
    });
    setEditing(m);
    setOpen(true);
  };

  const save = async () => {
    if (!form.brand.trim() || !form.model_name.trim()) {
      setError("Brand and model name are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = {
        brand: form.brand.trim(),
        model_name: form.model_name.trim(),
        battery_power_kw: form.battery_power_kw || null,
        motor_power_kw: form.motor_power_kw || null,
        seating_capacity: form.seating_capacity ? Number(form.seating_capacity) : null,
        charger_type: form.charger_type,
        default_color_options: form.default_color_options
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        is_active: form.is_active,
      };
      if (editing) {
        await updateModel(editing.id, body);
        toast.push("Model updated");
      } else {
        await createModel(body);
        toast.push("Model created");
      }
      setOpen(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: VehicleModel) => {
    if (!window.confirm(`Delete ${m.brand} ${m.model_name}?`)) return;
    try {
      await deleteModel(m.id);
      toast.push("Model deleted");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  };

  return (
    <div className="bg-white border border-[#E8E8E5] rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold tracking-[0.12em] uppercase text-[#0B3D2B]">
          Vehicle Models ({models.length})
        </h3>
        {canWrite && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[#E8E8E5] rounded-full text-[11px] font-bold text-[#0B3D2B] hover:border-[#0B3D2B] transition-colors"
          >
            <Plus size={13} /> New Model
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-[12px] text-[#10B981]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {models.map((m) => (
          <div
            key={m.id}
            className={`flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl border ${
              m.is_active ? "border-[#E8E8E5] bg-[#FAFAF8]" : "border-dashed border-[#E8E8E5] opacity-60"
            }`}
          >
            <span className="text-[12px] font-bold text-[#0B3D2B] whitespace-nowrap">
              {getModelDisplayName(m)}
            </span>
            <span className="text-[10px] text-[#737373] whitespace-nowrap">
              {m.units_in_stock ?? 0} in stock · min {m.low_stock_threshold}
            </span>
            {canWrite && (
              <button
                onClick={() => openEdit(m)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737373] hover:bg-[#0B3D2B] hover:text-white transition-colors"
                title="Edit model"
              >
                <Pencil size={12} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => remove(m)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#737373] hover:bg-[#8B0000] hover:text-white transition-colors"
                title="Delete model"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {models.length === 0 && (
          <p className="text-[12px] text-[#B0B0AA]">No models yet — create one to start importing units.</p>
        )}
      </div>

      {open && (
        <Modal title={editing ? "Edit Model" : "New Vehicle Model"} onClose={() => setOpen(false)}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Brand (EV company)" required>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. VT" className={inputCls} />
            </Field>
            <Field label="Model Name" required>
              <input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="e.g. Cargo 10T" className={inputCls} />
            </Field>
            <Field label="Battery Power (kW)">
              <input value={form.battery_power_kw} onChange={(e) => setForm({ ...form, battery_power_kw: e.target.value })} inputMode="decimal" placeholder="e.g. 100.27" className={inputCls} />
            </Field>
            <Field label="Motor Power (kW)">
              <input value={form.motor_power_kw} onChange={(e) => setForm({ ...form, motor_power_kw: e.target.value })} inputMode="decimal" placeholder="e.g. 120" className={inputCls} />
            </Field>
            <Field label="Seating Capacity">
              <input value={form.seating_capacity} onChange={(e) => setForm({ ...form, seating_capacity: e.target.value })} inputMode="numeric" placeholder="e.g. 2" className={inputCls} />
            </Field>
            <Field label="Charger Type">
              <SelectField
                value={form.charger_type}
                onChange={(v) => setForm({ ...form, charger_type: v })}
                options={[
                  { value: "", label: "—" },
                  { value: "AC_3_5", label: "AC 3.5kW" },
                  { value: "AC_7", label: "AC 7kW" },
                  { value: "DC_FAST", label: "DC Fast" },
                ]}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Default Color Options (comma separated)">
                <input value={form.default_color_options} onChange={(e) => setForm({ ...form, default_color_options: e.target.value })} placeholder="White, Blue, Red" className={inputCls} />
              </Field>
            </div>
            <Field label="Low-stock Alert At">
              <input value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} inputMode="numeric" className={inputCls} />
            </Field>
            <Field label="Active">
              <SelectField
                value={form.is_active ? "yes" : "no"}
                onChange={(v) => setForm({ ...form, is_active: v === "yes" })}
                options={[
                  { value: "yes", label: "Active" },
                  { value: "no", label: "Inactive" },
                ]}
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-[12px] text-[#10B981]">{error}</p>}
          <div data-modal-actions className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => setOpen(false)}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold hover:bg-[#10B981] transition-colors disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save Model"}
            </button>
          </div>
        </Modal>
      )}
      {toast.node}
    </div>
  );
}
