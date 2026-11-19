import { useEffect, useState } from "react";
import { Building2, CheckCircle, Eye, EyeOff, MapPin, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { BankPicker } from "../components/pickers";
import { crm, type Bank, type BankBranch } from "./data";
import { Modal, Pagination, TableState, ghostBtnCls, primaryBtnCls, useToast } from "./ui";

import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
const input =
  "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";
const labelCls = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.12em] uppercase rounded-full ${active ? "bg-[#10B981] text-white" : "bg-[#F0F0ED] text-[#737373]"}`}>
      {active ? <CheckCircle size={10} /> : <XCircle size={10} />}
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function BankForm({
  initial = null,
  onClose,
  onSaved,
}: {
  initial?: Bank | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    category: initial?.category ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Bank name is required");
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        category: form.category.trim(),
        is_active: form.is_active,
      };
      if (initial) await crm.updateBank(initial.id, payload);
      else await crm.createBank(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit Bank" : "Add Bank"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelCls}>Bank Name *</label>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </div>
        <div>
          <label className={labelCls}>NRB Code</label>
          <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 11019" />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <input className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Commercial Bank (Class A)" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-[#10B981]" />
          <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
        </label>
        {error && <p className="text-[12px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>}
        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>{busy ? "Saving…" : initial ? "Save Changes" : "Add Bank"}</button>
        </div>
      </form>
    </Modal>
  );
}

function BranchForm({
  initial = null,
  presetBankId,
  onClose,
  onSaved,
}: {
  initial?: BankBranch | null;
  presetBankId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    bank: initial?.bank ?? presetBankId ?? 0,
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    address: initial?.address ?? "",
    district: initial?.district ?? "",
    is_active: initial?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.bank) return setError("Bank is required");
    if (!form.name.trim()) return setError("Branch name is required");
    setBusy(true);
    try {
      const payload = {
        bank: Number(form.bank),
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim(),
        district: form.district.trim(),
        is_active: form.is_active,
      };
      if (initial) await crm.updateBankBranch(initial.id, payload);
      else await crm.createBankBranch(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit Bank Branch" : "Add Bank Branch"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <BankPicker
          label="Bank"
          required
          activeOnly={false}
          value={form.bank || null}
          onChange={(id) => setForm({ ...form, bank: id ?? 0 })}
          placeholder="Select bank..."
        />
        <div>
          <label className={labelCls}>Branch Name *</label>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>District</label>
            <input className={input} value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Code</label>
            <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-[#10B981]" />
          <span className="text-[13px] font-semibold text-[#0B3D2B]">Active</span>
        </label>
        {error && <p className="text-[12px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>}
        <div data-modal-actions className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={ghostBtnCls}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryBtnCls}>{busy ? "Saving…" : initial ? "Save Changes" : "Add Branch"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function BanksPanel() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    crm.banks()
      .then(setBanks)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (bank: Bank) => {
    try {
      await crm.updateBank(bank.id, { is_active: !bank.is_active });
      toast.push(bank.is_active ? `"${bank.name}" deactivated.` : `"${bank.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const remove = async (bank: Bank) => {
    try {
      await crm.deleteBank(bank.id);
      toast.push(`"${bank.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const visible = banks.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = Math.max(1, Math.ceil(banks.length / pageSize));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 text-[#0B3D2B]">
            <Building2 size={18} />
            <span className="text-[13px] font-semibold">Banks</span>
          </div>
          <div className="h-5 w-px bg-[#E8E8E5]" />
          <div className="flex items-center gap-4 text-[12px] text-[#737373]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />{banks.filter((b) => b.is_active).length} Active</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#F0F0ED] border border-[#D0D0CC]" />{banks.filter((b) => !b.is_active).length} Inactive</span>
          </div>
        </div>
        <button onClick={() => setCreating(true)} className={primaryBtnCls}><Plus size={14} /> Add Bank</button>
      </div>
      {error && <div className="mb-3 text-[12px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2 rounded-r-lg">{error}</div>}
      <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
              {["Bank", "Code", "Category", "Branches", "Status", "Actions"].map((h, i) => (
                <th key={h} className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={6} loading={loading} empty={!loading && banks.length === 0} />
            {visible.map((bank) => (
              <tr key={bank.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors">
                <td className="px-5 py-3.5 text-[13px] font-semibold text-[#0B3D2B]">{bank.name}</td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373]">{bank.code || "—"}</td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373]">{bank.category || "—"}</td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373] font-semibold">{bank.branch_count}</td>
                <td className="px-5 py-3.5"><ActiveBadge active={bank.is_active} /></td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(bank)} title="Edit" className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => toggle(bank)} title={bank.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors">{bank.is_active ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    <button onClick={() => remove(bank)} title="Delete" className="p-1.5 rounded-lg text-[#737373] hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPage={setPage}
          total={banks.length}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>
      {toast.node}
      {creating && <BankForm onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <BankForm initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

export function BranchesPanel() {
  const [rows, setRows] = useState<BankBranch[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [bankId, setBankId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BankBranch | null>(null);
  const toast = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page + 1));
    params.set("page_size", String(pageSize));
    if (bankId) params.set("bank", String(bankId));
    if (query) params.set("search", query);
    api<{ results: BankBranch[]; count: number; total_pages: number }>(`/api/crm/bank-branches/?${params.toString()}`)
      .then((res) => {
        setRows(res.results || []);
        setCount(res.count || 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page, pageSize, bankId, query]);

  const toggle = async (branch: BankBranch) => {
    try {
      await crm.updateBankBranch(branch.id, { is_active: !branch.is_active });
      toast.push(branch.is_active ? `"${branch.name}" deactivated.` : `"${branch.name}" activated.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Update failed.");
    }
  };

  const remove = async (branch: BankBranch) => {
    try {
      await crm.deleteBankBranch(branch.id);
      toast.push(`"${branch.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const pageCount = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 text-[#0B3D2B]">
          <MapPin size={18} />
          <span className="text-[13px] font-semibold">Bank Branches</span>
          <span className="text-[12px] text-[#737373]">{count}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative z-20 w-72">
            <BankPicker
              label=""
              activeOnly={false}
              value={bankId}
              placeholder="All banks"
              onChange={(id) => {
                setBankId(id);
                setPage(0);
              }}
            />
          </div>
          <input
            className="border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#0B3D2B] w-56"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search branch, district, address"
          />
          <button onClick={() => setCreating(true)} className={primaryBtnCls}><Plus size={14} /> Add Branch</button>
        </div>
      </div>
      {error && <div className="mb-3 text-[12px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2 rounded-r-lg">{error}</div>}
      <div className="border border-[#E8E8E5] rounded-2xl bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8]">
              {["Branch", "Bank", "District", "Address", "Status", "Actions"].map((h, i) => (
                <th key={h} className={`px-5 py-3 text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableState colSpan={6} loading={loading} empty={!loading && rows.length === 0} />
            {rows.map((branch) => (
              <tr key={branch.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8] transition-colors">
                <td className="px-5 py-3.5">
                  <div className="text-[13px] font-semibold text-[#0B3D2B]">{branch.name}</div>
                  {branch.code && <div className="text-[10px] text-[#737373]">{branch.code}</div>}
                </td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373]">{branch.bank_name}</td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373]">{branch.district || "—"}</td>
                <td className="px-5 py-3.5 text-[12px] text-[#737373] max-w-[220px] truncate">{branch.address || "—"}</td>
                <td className="px-5 py-3.5"><ActiveBadge active={branch.is_active} /></td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditing(branch)} title="Edit" className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => toggle(branch)} title={branch.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors">{branch.is_active ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                    <button onClick={() => remove(branch)} title="Delete" className="p-1.5 rounded-lg text-[#737373] hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPage={setPage}
          total={count}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>
      {toast.node}
      {creating && (
        <BranchForm
          presetBankId={bankId}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {editing && <BranchForm initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}
