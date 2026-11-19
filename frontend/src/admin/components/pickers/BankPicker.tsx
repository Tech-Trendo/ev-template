"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { LazySelect } from "./LazySelect";

export type BankOption = {
  id: number;
  name: string;
  code?: string;
  category?: string;
  is_active?: boolean;
};

export type BankBranchOption = {
  id: number;
  bank: number;
  bank_name?: string;
  name: string;
  code?: string;
  address?: string;
  district?: string;
  is_active?: boolean;
};

type Page<T> = { results?: T[]; total_pages?: number; count?: number } | T[];

function unwrap<T>(res: Page<T>): { results: T[]; totalPages: number; count: number } {
  if (Array.isArray(res)) {
    return { results: res, totalPages: 1, count: res.length };
  }
  const results = res.results || [];
  return {
    results,
    totalPages: res.total_pages || 1,
    count: res.count ?? results.length,
  };
}

export async function findBankByName(name: string): Promise<BankOption | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exact = unwrap(
    await api<Page<BankOption>>(
      `/api/crm/banks/?exact_name=${encodeURIComponent(trimmed)}&page_size=5&is_active=true`
    )
  );
  if (exact.results[0]) return exact.results[0];

  const loose = trimmed
    .replace(/\b(ltd|limited|pvt\.?|private|co\.?|bank)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!loose) return null;
  const found = unwrap(
    await api<Page<BankOption>>(
      `/api/crm/banks/?search=${encodeURIComponent(loose)}&page_size=10&is_active=true`
    )
  );
  const wanted = trimmed.toLowerCase();
  const query = loose.toLowerCase();
  const best = [...found.results].sort(
    (a, b) => scoreName(b.name, query, wanted) - scoreName(a.name, query, wanted)
  )[0];
  if (!best || scoreName(best.name, query, wanted) < 40) return null;
  return best;
}

export async function findBranchByName(bankId: number, name: string): Promise<BankBranchOption | null> {
  const trimmed = name.trim();
  if (!trimmed || !bankId) return null;
  const exact = unwrap(
    await api<Page<BankBranchOption>>(
      `/api/crm/bank-branches/?bank=${bankId}&exact_name=${encodeURIComponent(trimmed)}&page_size=5&is_active=true`
    )
  );
  if (exact.results[0]) return exact.results[0];

  const loose = trimmed.replace(/\bbranch\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!loose) return null;
  const found = unwrap(
    await api<Page<BankBranchOption>>(
      `/api/crm/bank-branches/?bank=${bankId}&search=${encodeURIComponent(loose)}&page_size=10&is_active=true`
    )
  );
  const wanted = trimmed.toLowerCase();
  return (
    found.results.find((branch) => branch.name.toLowerCase() === wanted) ||
    found.results.find((branch) => branch.name.toLowerCase().includes(loose.toLowerCase())) ||
    found.results[0] ||
    null
  );
}

function scoreName(name: string, query: string, original: string) {
  const value = name.toLowerCase();
  if (value === original) return 100;
  let score = 0;
  if (value.startsWith(query)) score += 40;
  else if (value.includes(query)) score += 20;
  if (/\bbank\b/.test(original) && /\bbank\b/.test(value) && !/laghubitta|finance|micro/i.test(value)) {
    score += 25;
  }
  return score;
}

export function BankPicker({
  value,
  onChange,
  label = "Bank Name",
  placeholder = "Select bank...",
  required = false,
  disabled = false,
  activeOnly = true,
}: {
  value: number | null | undefined;
  onChange: (bankId: number | null, bank: BankOption | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  activeOnly?: boolean;
}) {
  const fetchPage = useCallback(async (query: string, page: number, pageSize: number) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (activeOnly) params.set("is_active", "true");
    return unwrap(await api<Page<BankOption>>(`/api/crm/banks/?${params.toString()}`));
  }, [activeOnly]);

  const fetchById = useCallback(async (id: string | number) => {
    try {
      return await api<BankOption>(`/api/crm/banks/${id}/`);
    } catch {
      return null;
    }
  }, []);

  return (
    <LazySelect<BankOption>
      value={value}
      onChange={(id, item) => onChange(id !== null ? Number(id) : null, item)}
      fetchPage={fetchPage}
      fetchById={fetchById}
      getItemId={(bank) => bank.id}
      getItemLabel={(bank) => bank.name}
      label={label}
      placeholder={placeholder}
      searchPlaceholder="Search bank by name or code..."
      required={required}
      disabled={disabled}
      allowClear
      pageSize={10}
      emptyMessage="No matching banks found."
      renderItem={(bank) => (
        <div className="py-0.5">
          <div className="text-[12px] font-bold text-[#04314A] truncate">{bank.name}</div>
          {(bank.category || bank.code) && (
            <div className="text-[10px] text-[#737373] truncate">
              {[bank.category, bank.code].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}
    />
  );
}

export function BankBranchPicker({
  bankId,
  value,
  onChange,
  label = "Bank Branch",
  placeholder,
  disabled = false,
}: {
  bankId: number | null | undefined;
  value: number | null | undefined;
  onChange: (branchId: number | null, branch: BankBranchOption | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      if (!bankId) return { results: [], totalPages: 1, count: 0 };
      const params = new URLSearchParams();
      params.set("bank", String(bankId));
      if (query.trim()) params.set("search", query.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("is_active", "true");
      return unwrap(await api<Page<BankBranchOption>>(`/api/crm/bank-branches/?${params.toString()}`));
    },
    [bankId]
  );

  const fetchById = useCallback(async (id: string | number) => {
    try {
      return await api<BankBranchOption>(`/api/crm/bank-branches/${id}/`);
    } catch {
      return null;
    }
  }, []);

  return (
    <LazySelect<BankBranchOption>
      value={value}
      onChange={(id, item) => onChange(id !== null ? Number(id) : null, item)}
      fetchPage={fetchPage}
      fetchById={fetchById}
      getItemId={(branch) => branch.id}
      getItemLabel={(branch) =>
        branch.district ? `${branch.name} · ${branch.district}` : branch.name
      }
      label={label}
      placeholder={placeholder || (bankId ? "Select bank branch..." : "Select a bank first")}
      searchPlaceholder="Search branch by name, district, or address..."
      disabled={disabled || !bankId}
      allowClear
      pageSize={10}
      emptyMessage="No matching branches found."
      renderItem={(branch) => (
        <div className="py-0.5">
          <div className="text-[12px] font-bold text-[#04314A] truncate">{branch.name}</div>
          <div className="text-[10px] text-[#737373] truncate">
            {[branch.district, branch.address].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}
    />
  );
}
