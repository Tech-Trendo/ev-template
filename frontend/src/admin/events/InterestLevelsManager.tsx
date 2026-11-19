import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Tag, Eye, EyeOff } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Pagination } from "../crm/ui";
import type { InterestLevel } from "@/lib/events";
import { fetchInterestLevels, createInterestLevel, updateInterestLevel, deleteInterestLevel } from "@/lib/events";

function InterestForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: InterestLevel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";
  const label = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    setBusy(true);
    try {
      if (initial) {
        await updateInterestLevel(initial.id, { name: form.name.trim(), is_active: form.is_active });
      } else {
        await createInterestLevel({ name: form.name.trim(), is_active: form.is_active });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white w-full max-w-[480px] border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E8E8E5]">
          <h2 className="text-[16px] font-black text-[#0B3D2B]">{initial ? "Edit Interest Level" : "Add Interest Level"}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5]"><X size={14} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={label}>Name *</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Fleet Opportunity" required />
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-[#10B981]" />
              <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
            </label>
          </div>
          {error && <p className="text-[12px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 bg-[#F7F7F5] border-t border-[#E8E8E5]">
          <button type="submit" disabled={busy} className="flex-1 py-3 rounded-full bg-[#0B3D2B] text-white text-[13px] font-semibold hover:bg-[#10B981] disabled:opacity-50">{busy ? "Saving…" : initial ? "Save Changes" : "Create Interest Level"}</button>
          <button type="button" onClick={onClose} className="px-6 py-3 border border-[#E8E8E5] rounded-full bg-white text-[13px] font-semibold text-[#737373]">Cancel</button>
        </div>
      </form>
    </div>
  );
}

const INTEREST_PER_PAGE = 10;

export default function InterestLevelsManager() {
  const [levels, setLevels] = useState<InterestLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InterestLevel | null>(null);
  const [page, setPage] = useState(0);

  const load = () => {
    setLoading(true);
    fetchInterestLevels().then(setLevels).catch((e) => setError(e instanceof Error ? e.message : "Load failed")).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleActive = async (lvl: InterestLevel) => {
    try {
      await updateInterestLevel(lvl.id, { is_active: !lvl.is_active });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async (lvl: InterestLevel) => {
    if (!window.confirm(`Delete "${lvl.name}"? This cannot be undone.`)) return;
    try {
      await deleteInterestLevel(lvl.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-black tracking-tight text-[#0B3D2B]">Interest Levels.</h1>
          <p className="text-[13px] text-[#737373] mt-1">Manage visitor interest classifications. Defaults: Hot, Warm, Cold, Normal Inquiry.</p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors">
          <Plus size={14} /> Add Interest Level
        </button>
      </div>

      {error && <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[520px]">
            <thead>
              <tr className="border-b border-[#E8E8E5]">
                {["Name", "Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td></tr>
              ) : levels.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-14 text-center"><Tag size={22} className="mx-auto mb-3 text-[#B0B0AA]" /><p className="text-[13px] text-[#737373]">No interest levels.</p></td></tr>
              ) : (
                levels.slice(page * INTEREST_PER_PAGE, (page + 1) * INTEREST_PER_PAGE).map((lvl) => (
                <tr key={lvl.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5 text-[13px] font-bold text-[#0B3D2B]">{lvl.name}</td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => toggleActive(lvl)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase ${lvl.is_active ? "rounded-full bg-[#0B3D2B] text-white" : "rounded-full bg-[#F0F0ED] text-[#737373]"}`}>
                      {lvl.is_active ? <Eye size={11} /> : <EyeOff size={11} />}{lvl.is_active ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(lvl)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => toggleActive(lvl)} className="hidden sm:inline-flex px-3 py-1.5 border border-[#E8E8E5] rounded-full text-[11px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981]">{lvl.is_active ? "Deactivate" : "Activate"}</button>
                      <button onClick={() => remove(lvl)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {(() => {
          const pageCount = Math.ceil(levels.length / INTEREST_PER_PAGE);
          return <Pagination page={page} pageCount={pageCount} onPage={setPage} total={levels.length} />;
        })()}
      </div>

      {(creating || editing) && (
        <InterestForm initial={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={load} />
      )}
    </div>
  );
}
