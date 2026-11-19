import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Activity as ActivityIcon, Building2, MapPin, RadioTower, CheckCircle, XCircle } from "lucide-react";
import { BanksPanel, BranchesPanel } from "./BankSettings";
import { ApiError } from "@/lib/api";
import { crm, formatDate, type LeadSource, type ActivityType } from "./data";
import { Modal, Pagination, TableState, ghostBtnCls, primaryBtnCls, useToast } from "./ui";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

const input =
  "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors";
const labelCls = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";

function SourceForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: LeadSource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    setBusy(true);
    try {
      if (initial) {
        await crm.updateLeadSource(initial.id, { name: form.name.trim(), is_active: form.is_active });
      } else {
        await crm.createLeadSource(form.name.trim(), form.is_active);
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
    <Modal title={initial ? "Edit Lead Source" : "Add Lead Source"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Name *</label>
          <input
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. WhatsApp, Trade Show, Walk-in"
            required
            autoFocus
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 accent-[#00AAEB]"
            />
            <span className="text-[13px] font-semibold text-[#04314A]">Active</span>
          </label>
        </div>
        {error && <p className="text-[12px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>}
        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>
            {busy ? "Saving…" : initial ? "Save Changes" : "Add Source"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TypeForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: ActivityType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? initial?.name ?? "");
  const [is_active, setIsActive] = useState(initial?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Auto-generate the system name from the label: lowercase, spaces → underscores.
  const generatedName = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!label.trim()) return setError("Display label is required");
    if (!generatedName) return setError("Display label must contain at least one letter or number");
    setBusy(true);
    try {
      if (initial) {
        await crm.updateActivityType(initial.id, {
          label: label.trim(),
          is_active,
        });
      } else {
        await crm.createActivityType(generatedName, label.trim(), is_active);
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
    <Modal title={initial ? "Edit Activity Type" : "Create Activity Type"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Display Label *</label>
          <input
            className={input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Site Visit, Follow Up"
            required
            autoFocus
          />
          <p className="mt-1.5 text-[11px] text-[#00AAEB] bg-[#00AAEB]/5 px-2 py-1.5 rounded-lg border-l-2 border-[#00AAEB]">
            System name: <span className="font-semibold">{generatedName || "-"}</span>
          </p>
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={is_active}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-[#00AAEB]"
            />
            <span className="text-[13px] font-semibold text-[#04314A]">Active</span>
          </label>
        </div>
        {error && <p className="text-[12px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>}
        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>
            {busy ? "Saving…" : initial ? "Save Changes" : "Create Activity Type"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function LeadSourcesPage() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creatingSource, setCreatingSource] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [creatingType, setCreatingType] = useState(false);
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [activeTab, setActiveTab] = useState<"sources" | "types" | "banks" | "branches">("sources");
  const toast = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([crm.leadSources(), crm.activityTypes()])
      .then(([s, t]) => { setSources(s); setTypes(t); })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleSourceActive = async (source: LeadSource) => {
    try {
      await crm.updateLeadSource(source.id, { is_active: !source.is_active });
      toast.push(source.is_active ? `"${source.name}" deactivated.` : `"${source.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const removeSource = async (source: LeadSource) => {
    if (source.lead_count > 0) {
      setError(
        `Cannot delete "${source.name}" because it is used by ${source.lead_count} lead${source.lead_count === 1 ? "" : "s"}. Deactivate it instead.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${source.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await crm.deleteLeadSource(source.id);
      toast.push(`"${source.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const toggleTypeActive = async (t: ActivityType) => {
    try {
      await crm.updateActivityType(t.id, { is_active: !t.is_active });
      toast.push(t.is_active ? `"${t.label || t.name}" deactivated.` : `"${t.label || t.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const removeType = async (t: ActivityType) => {
    if (t.activity_count > 0) {
      setError(
        `Cannot delete "${t.label || t.name}" because it is used by ${t.activity_count} activit${t.activity_count === 1 ? "y" : "ies"}. Deactivate it instead.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${t.label || t.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await crm.deleteActivityType(t.id);
      toast.push(`"${t.label || t.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const visibleSources = sources.slice(page * pageSize, (page + 1) * pageSize);
  const sourcePageCount = Math.max(1, Math.ceil(sources.length / pageSize));
  const visibleTypes = types.slice(page * pageSize, (page + 1) * pageSize);
  const typePageCount = Math.max(1, Math.ceil(types.length / pageSize));
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="mb-2 text-[12px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2 rounded-r-lg">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[#E8E8E5] overflow-x-auto">
        <button
          onClick={() => setActiveTab("sources")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${activeTab === "sources" ? "border-[#00AAEB] text-[#04314A]" : "border-transparent text-[#737373] hover:text-[#04314A]"}`}
        >
          <RadioTower size={15} />
          Lead Sources
        </button>
        <button
          onClick={() => setActiveTab("types")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${activeTab === "types" ? "border-[#00AAEB] text-[#04314A]" : "border-transparent text-[#737373] hover:text-[#04314A]"}`}
        >
          <ActivityIcon size={15} />
          Activity Types
        </button>
        <button
          onClick={() => setActiveTab("banks")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${activeTab === "banks" ? "border-[#00AAEB] text-[#04314A]" : "border-transparent text-[#737373] hover:text-[#04314A]"}`}
        >
          <Building2 size={15} />
          Banks
        </button>
        <button
          onClick={() => setActiveTab("branches")}
          className={`flex items-center gap-2 px-5 py-3 text-[12px] font-semibold tracking-[0.02em] border-b-2 transition-colors ${activeTab === "branches" ? "border-[#00AAEB] text-[#04314A]" : "border-transparent text-[#737373] hover:text-[#04314A]"}`}
        >
          <MapPin size={15} />
          Bank Branches
        </button>
      </div>

      {/* Lead Sources tab */}
      {activeTab === "sources" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5 text-[#04314A]">
                <RadioTower size={18} />
                <span className="text-[13px] font-semibold">Lead Sources</span>
              </div>
              <div className="h-5 w-px bg-[#E8E8E5]" />
              <div className="flex items-center gap-4 text-[12px] text-[#737373]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00AAEB]" />
                  {sources.filter(s => s.is_active).length} Active
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />
                  {sources.filter(s => !s.is_active).length} Inactive
                </span>
              </div>
            </div>
            <button onClick={() => setCreatingSource(true)} className={primaryBtnCls}>
              <Plus size={14} /> Add Lead Source
            </button>
          </div>

          <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Name", "Status", "Leads", "Created", "Actions"].map((h, i) => (
                    <th key={i} className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={5} loading={loading} empty={!loading && sources.length === 0} />
                {visibleSources.map((s) => (
                  <tr key={s.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] font-semibold text-[#04314A]">{s.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${s.is_active ? "bg-[#00AAEB] text-white" : "bg-[#F0F0ED] text-[#737373]"}`}>
                        {s.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{s.lead_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDate(s.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingSource(s)} title="Edit" className="p-1.5 rounded-lg text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleSourceActive(s)} title={s.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors">
                          {s.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => removeSource(s)} title="Delete" className="p-1.5 rounded-lg text-[#737373] hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageCount={sourcePageCount}
              onPage={setPage}
              total={sources.length}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </div>
      )}

      {/* Activity Types tab */}
      {activeTab === "types" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5 text-[#04314A]">
                <ActivityIcon size={18} />
                <span className="text-[13px] font-semibold">Activity Types</span>
              </div>
              <div className="h-5 w-px bg-[#E8E8E5]" />
              <div className="flex items-center gap-4 text-[12px] text-[#737373]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00AAEB]" />
                  {types.filter(t => t.is_active).length} Active
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />
                  {types.filter(t => !t.is_active).length} Inactive
                </span>
              </div>
            </div>
            <button onClick={() => setCreatingType(true)} className={primaryBtnCls}>
              <Plus size={14} /> Add Activity Type
            </button>
          </div>

          <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
                  {["Name", "Label", "Status", "Activities", "Created", "Actions"].map((h, i) => (
                    <th key={i} className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableState colSpan={6} loading={loading} empty={!loading && types.length === 0} />
                {visibleTypes.map((t) => (
                  <tr key={t.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="text-[13px] font-semibold text-[#04314A]">{t.name}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373]">{t.label || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${t.is_active ? "bg-[#00AAEB] text-white" : "bg-[#F0F0ED] text-[#737373]"}`}>
                        {t.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {t.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{t.activity_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatDate(t.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditingType(t)} title="Edit" className="p-1.5 rounded-lg text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleTypeActive(t)} title={t.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-[#737373] hover:text-[#04314A] hover:bg-[#F0F0ED] transition-colors">
                          {t.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button onClick={() => removeType(t)} title="Delete" className="p-1.5 rounded-lg text-[#737373] hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageCount={typePageCount}
              onPage={setPage}
              total={types.length}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        </div>
      )}

      {activeTab === "banks" && <BanksPanel />}
      {activeTab === "branches" && <BranchesPanel />}

      {toast.node}
      {creatingSource && <SourceForm onClose={() => setCreatingSource(false)} onSaved={load} />}
      {editingSource && <SourceForm initial={editingSource} onClose={() => setEditingSource(null)} onSaved={load} />}
      {creatingType && <TypeForm onClose={() => setCreatingType(false)} onSaved={load} />}
      {editingType && <TypeForm initial={editingType} onClose={() => setEditingType(null)} onSaved={load} />}
    </div>
  );
}
