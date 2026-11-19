"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { LazySelect } from "./LazySelect";

export type LeadOption = {
  id: number | string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  status?: string;
  vehicle?: string;
};

export function LeadPicker({
  value,
  onChange,
  label = "Lead",
  placeholder = "Select lead...",
  searchPlaceholder = "Search lead by name, phone, email, or company...",
  required = false,
  error,
  disabled = false,
  allowClear = true,
}: {
  value: number | string | null | undefined;
  onChange: (leadId: number | null, lead: LeadOption | null) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const res = await api<{
        results?: LeadOption[];
        total_pages?: number;
        count?: number;
      } | LeadOption[]>(`/api/crm/leads/?${params.toString()}`);

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
      return await api<LeadOption>(`/api/crm/leads/${id}/`);
    } catch {
      return null;
    }
  }, []);

  return (
    <LazySelect<LeadOption>
      value={value}
      onChange={(id, item) => onChange(id !== null ? Number(id) : null, item)}
      fetchPage={fetchPage}
      fetchById={fetchById}
      getItemId={(l) => l.id}
      getItemLabel={(l) => `${l.name} (LD-${l.id})${l.company ? ` · ${l.company}` : ""}`}
      label={label}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      required={required}
      error={error}
      disabled={disabled}
      allowClear={allowClear}
      pageSize={10}
      emptyMessage="No matching leads found."
      renderItem={(l) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold text-[#0B3D2B]">{l.name}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#0B3D2B] border border-[#E8E8E5]">
              LD-{l.id}
            </span>
            {l.status && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5]">
                {l.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#737373] flex-wrap">
            {l.company && <span className="font-medium text-[#0B3D2B]">{l.company}</span>}
            {l.phone && <span>· {l.phone}</span>}
            {l.vehicle && <span>· Vehicle: {l.vehicle}</span>}
          </div>
        </div>
      )}
      renderSelected={(l) => (
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
          <span className="text-[13px] font-medium text-[#0B3D2B] truncate">{l.name}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#0B3D2B] border border-[#E8E8E5] shrink-0">
            LD-{l.id}
          </span>
          {l.company && (
            <span className="text-[11px] text-[#737373] truncate shrink-0 max-w-[100px] hidden sm:inline">({l.company})</span>
          )}
        </div>
      )}
    />
  );
}
