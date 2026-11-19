"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Store, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  Button,
  Input,
  Select,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
  EmptyState,
  useToast,
} from "@/components/ui";

export type Dealer = {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  district: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

function DealerForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Dealer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    contact_person: initial?.contact_person ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    district: initial?.district ?? "",
    status: (initial?.status ?? "active") as "active" | "inactive",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = !!initial;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    if (!form.name.trim()) {
      setFieldErrors({ name: "Name is required." });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        district: form.district.trim(),
        status: form.status,
      };
      if (initial) {
        await api(`/api/dealers/${initial.id}/`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/dealers/", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.detail && typeof err.detail === "object") {
        const d = err.detail as Record<string, unknown>;
        const fe: Record<string, string> = {};
        let generic = "";
        for (const [k, v] of Object.entries(d)) {
          const msg = Array.isArray(v) ? String(v[0]) : String(v);
          if (["name", "contact_person", "phone", "email", "address", "district", "status"].includes(k)) {
            fe[k] = msg;
          } else if (k === "detail") {
            generic = msg;
          } else {
            generic = `${k}: ${msg}`;
          }
        }
        if (Object.keys(fe).length) setFieldErrors(fe);
        setError(generic || err.message);
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      title={isEdit ? `Edit ${initial?.name}` : "Add Dealer"}
      subtitle="Dealer outlets manage inventory assignments, local staff, and customer deliveries."
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Dealer Name" required error={fieldErrors.name}>
          <Input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Kathmandu Motors"
          />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Contact Person" error={fieldErrors.contact_person}>
            <Input
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              placeholder="Full name"
            />
          </FormField>
          <FormField label="Phone" error={fieldErrors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="01-XXXXXXX"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="dealer@example.com"
            />
          </FormField>
          <FormField label="District" error={fieldErrors.district}>
            <Input
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              placeholder="Kathmandu"
            />
          </FormField>
        </div>

        <FormField label="Address" error={fieldErrors.address}>
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Street, city"
          />
        </FormField>

        <FormField
          label="Status"
          error={fieldErrors.status}
          helpText="Inactive dealers cannot be assigned to vehicles, quotations, or staff accounts."
        >
          <Select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </FormField>

        {error && (
          <div className="text-[12px] font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 rounded-lg">
            {error}
          </div>
        )}

        <div data-modal-actions className="flex justify-end gap-3 pt-3 border-t border-[#E8E8E5]">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {isEdit ? "Save Changes" : "Create Dealer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export async function fetchDealers(): Promise<Dealer[]> {
  const data = await api<Dealer[] | { results: Dealer[] }>("/api/dealers/");
  return Array.isArray(data) ? data : (data.results ?? []);
}

export default function DealersManager() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingDealer, setDeletingDealer] = useState<Dealer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    const qs = params.toString();
    api<Dealer[] | { results: Dealer[] }>(`/api/dealers/${qs ? `?${qs}` : ""}`)
      .then((data) => setDealers(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dealers"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = async () => {
    if (!deletingDealer) return;
    setDeleteBusy(true);
    try {
      await api(`/api/dealers/${deletingDealer.id}/`, { method: "DELETE" });
      toast.success(`Dealer "${deletingDealer.name}" deleted.`);
      setDeletingDealer(null);
      load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dealers"
        subtitle="Manage internal dealership outlets, contact persons, and operational status."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => setCreating(true)}
          >
            Add Dealer
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, contact, phone, district…"
            leftIcon={<Search size={15} />}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="text-[12px] font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 rounded-lg flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="ghost" onClick={() => setError("")}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[#F7F7F5] border-b border-[#E8E8E5] text-[11px] font-semibold tracking-wider uppercase text-[#737373]">
                <th className="px-5 py-3">Dealer</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">District</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-[#737373]">
                    Loading dealers…
                  </td>
                </tr>
              ) : dealers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      icon={<Store size={32} className="text-[#A3A39E]" />}
                      title="No dealers found"
                      description="Try adjusting your search criteria or add a new dealership location."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Plus size={14} />}
                          onClick={() => setCreating(true)}
                        >
                          Add Dealer
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                dealers.map((d) => (
                  <tr key={d.id} className="hover:bg-[#FAFAF8] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#04314A]">{d.name}</div>
                      {d.address && <div className="text-[11px] text-[#737373] mt-0.5">{d.address}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-[#525252]">
                      <div className="font-medium text-[#27272A]">{d.contact_person || "—"}</div>
                      {d.phone && <div className="text-[11px] text-[#737373]">{d.phone}</div>}
                      {d.email && <div className="text-[11px] text-[#737373]">{d.email}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-[#525252]">{d.district || "—"}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={d.status === "active" ? "success" : "neutral"}>
                        {d.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Pencil size={13} />}
                          onClick={() => setEditing(d)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[#991B1B] hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                          leftIcon={<Trash2 size={13} />}
                          onClick={() => setDeletingDealer(d)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <DealerForm
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        isOpen={deletingDealer !== null}
        title={`Delete Dealer "${deletingDealer?.name}"?`}
        description="Associated vehicles and service records will retain their history, but will be detached from this dealership location."
        confirmLabel="Delete Dealer"
        cancelLabel="Keep Dealer"
        variant="danger"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingDealer(null)}
      />
    </div>
  );
}
