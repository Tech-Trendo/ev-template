"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Field, Modal, inputCls, primaryBtnCls } from "@/admin/crm/ui";
import { LazySelect } from "./LazySelect";

export type CustomerOption = {
  id: number | string;
  display_id?: string;
  code?: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  location?: string;
  type?: string;
  pan_vat_number?: string;
  contact_person?: string;
};

export function CustomerPicker({
  value,
  onChange,
  label = "Customer",
  placeholder = "Select customer...",
  searchPlaceholder = "Search customer by name, company, phone, email, or code...",
  required = false,
  error,
  disabled = false,
  allowClear = true,
  compact = false,
  allowCreate = true,
}: {
  value: number | string | null | undefined;
  onChange: (customerId: number | null, customer: CustomerOption | null) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  allowClear?: boolean;
  compact?: boolean;
  allowCreate?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const res = await api<{
        results?: CustomerOption[];
        total_pages?: number;
        count?: number;
      } | CustomerOption[]>(`/api/crm/customers/?${params.toString()}`);

      if (Array.isArray(res)) {
        return { results: res, totalPages: 1, count: res.length };
      }
      return {
        results: res.results || [],
        totalPages: res.total_pages || 1,
        count: res.count ?? (res.results ? res.results.length : 0),
      };
    },
    []
  );

  const fetchById = useCallback(async (id: string | number) => {
    try {
      return await api<CustomerOption>(`/api/crm/customers/${id}/`);
    } catch {
      return null;
    }
  }, []);

  return (
    <>
      <LazySelect<CustomerOption>
        value={value}
        onChange={(id, item) => onChange(id !== null ? Number(id) : null, item)}
        fetchPage={fetchPage}
        fetchById={fetchById}
        getItemId={(c) => c.id}
        getItemLabel={(c) => {
          const code = c.code || c.display_id || `CU-${c.id}`;
          return compact ? `${c.name} (${code})` : `${c.name} (${code})${c.company ? ` · ${c.company}` : ""}`;
        }}
        label={label}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        required={required}
        error={error}
        disabled={disabled}
        allowClear={allowClear}
        pageSize={10}
        emptyMessage="No matching customers found."
        headerAction={
          allowCreate ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A] transition-colors"
            >
              <Plus size={13} /> Add new customer
            </button>
          ) : undefined
        }
        renderItem={(c) => {
          const code = c.code || c.display_id || `CU-${c.id}`;
          if (compact) {
            return (
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-[12px] font-bold text-[#04314A] truncate">{c.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#04314A] border border-[#E8E8E5] shrink-0">
                  {code}
                </span>
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-bold text-[#04314A]">{c.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#04314A] border border-[#E8E8E5]">
                  {code}
                </span>
                {c.type && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5]">
                    {c.type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#737373] flex-wrap">
                {c.company && <span className="font-medium text-[#04314A]">{c.company}</span>}
                {c.phone && <span>· {c.phone}</span>}
                {c.email && <span>· {c.email}</span>}
                {c.location && <span>· {c.location}</span>}
              </div>
            </div>
          );
        }}
        renderSelected={(c) => {
          const code = c.code || c.display_id || `CU-${c.id}`;
          return (
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
              <span className="text-[13px] font-medium text-[#04314A] truncate">{c.name}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#04314A] border border-[#E8E8E5] shrink-0">
                {code}
              </span>
              {!compact && c.company && (
                <span className="text-[11px] text-[#737373] truncate shrink-0 max-w-[100px] hidden sm:inline">({c.company})</span>
              )}
            </div>
          );
        }}
      />

      {modalOpen && (
        <NewCustomerModal
          onClose={() => setModalOpen(false)}
          onCreated={(newCust) => {
            setModalOpen(false);
            onChange(Number(newCust.id), newCust);
          }}
        />
      )}
    </>
  );
}

export function NewCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: CustomerOption) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [panVat, setPanVat] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);

  const submitCustomer = async (allowDuplicate = false) => {
    if (!name.trim()) return setError("Customer name is required.");
    if (!phone.trim()) return setError("Phone number is required.");
    setSaving(true);
    setError("");

    try {
      // type omitted — backend defaults to Individual
      const payload: any = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        pan_vat_number: panVat.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        allow_duplicate_phone: allowDuplicate,
      };

      const res = await api<any>("/api/crm/customers/", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onCreated(res);
    } catch (e: any) {
      const matching = (e as any)?.detail?.matching_customers || (e as any)?.data?.matching_customers;
      if (e instanceof ApiError && e.status === 409 && matching) {
        setDuplicateMatches(matching);
        setError("");
      } else {
        setError(e instanceof Error ? e.message : "Failed to create customer");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCustomer(false);
  };

  return (
    <Modal title="Add New Customer" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-[12px] text-[#00AAEB]">{error}</p>}

        {duplicateMatches.length > 0 && (
          <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-[#92400E] space-y-2.5">
            <p className="text-[13px] font-semibold text-[#92400E]">
              Existing customer found: {duplicateMatches[0].name} ({duplicateMatches[0].code || duplicateMatches[0].display_id || `CU-${duplicateMatches[0].id}`}). Use this customer?
            </p>
            {duplicateMatches[0].phone && (
              <p className="text-[11px] text-[#B45309]">
                Phone: {duplicateMatches[0].phone} {duplicateMatches[0].company ? `· Company: ${duplicateMatches[0].company}` : ""}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const match = duplicateMatches[0];
                  onCreated({
                    id: match.id,
                    display_id: match.code || match.display_id,
                    code: match.code || match.display_id,
                    name: match.name,
                    phone: match.phone,
                    company: match.company,
                    email: match.email,
                    type: match.type,
                  });
                }}
                className="px-3.5 py-2 min-h-[44px] bg-[#04314A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#064263] focus-visible:ring-2 focus-visible:ring-[#00AAEB] transition-colors"
              >
                Use Existing
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submitCustomer(true)}
                className="px-3.5 py-2 min-h-[44px] bg-white border border-[#D97706] text-[#B45309] text-[12px] font-semibold rounded-lg hover:bg-[#FEF3C7] focus-visible:ring-2 focus-visible:ring-[#D97706] transition-colors"
              >
                Create Separate
              </button>
            </div>
          </div>
        )}

        <Field label="Customer Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ram Bahadur"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone Number" required>
            <input
              type="text"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (duplicateMatches.length > 0) setDuplicateMatches([]);
              }}
              placeholder="e.g. 9841234567"
              className={inputCls}
            />
          </Field>

          <Field label="Email Address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ram@example.com"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Company / Entity Name">
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company Pvt. Ltd."
              className={inputCls}
            />
          </Field>

          <Field label="PAN / VAT Number">
            <input
              type="text"
              value={panVat}
              onChange={(e) => setPanVat(e.target.value)}
              placeholder="e.g. 601234567"
              className={inputCls}
            />
          </Field>

          <Field label="Contact Person">
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Shyam Manager"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Location / City">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Kathmandu, Bagmati"
            className={inputCls}
          />
        </Field>

        <div data-modal-actions className="mt-6 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#737373] hover:text-[#04314A] transition-colors"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryBtnCls}>
            {saving ? "Saving…" : "Save Customer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
