"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { LazySelect } from "./LazySelect";

export type VehicleModelOption = {
  id: number | string;
  brand: string;
  model_name: string;
  battery_capacity_kwh?: number | string;
  range_km?: number | string;
  payload_capacity_kg?: number | string;
  selling_price?: number | string;
  is_active?: boolean;
  has_active_variants?: boolean;
};

export function VehicleModelPicker({
  value,
  onChange,
  label = "Vehicle Model (Catalog)",
  required = false,
  error,
  disabled = false,
  placeholder = "Select vehicle model...",
  allowClear = true,
}: {
  value: number | string | null | undefined;
  onChange: (modelId: number | string | null, model: VehicleModelOption | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      params.set("is_active", "true");

      const res = await api<{
        results?: VehicleModelOption[];
        total_pages?: number;
        count?: number;
      } | VehicleModelOption[]>(`/api/inventory/models/?${params.toString()}`);

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
      return await api<VehicleModelOption>(`/api/inventory/models/${id}/`);
    } catch {
      return null;
    }
  }, []);

  return (
    <LazySelect<VehicleModelOption>
      value={value}
      onChange={(id, item) => onChange(id, item)}
      fetchPage={fetchPage}
      fetchById={fetchById}
      getItemId={(m) => m.id}
      getItemLabel={(m) => `${m.brand} ${m.model_name}`.trim()}
      label={label}
      placeholder={placeholder}
      searchPlaceholder="Search model by name or brand..."
      required={required}
      error={error}
      disabled={disabled}
      allowClear={allowClear}
      pageSize={10}
      renderItem={(m) => (
        <div className="flex flex-col">
          <span className="text-[12px] font-bold text-[#04314A]">
            {m.brand} {m.model_name}
          </span>
          <div className="flex items-center gap-2 text-[10px] text-[#737373]">
            {m.battery_capacity_kwh && <span>{m.battery_capacity_kwh} kWh</span>}
            {m.range_km && <span>· Range: {m.range_km} km</span>}
            {m.payload_capacity_kg && <span>· Payload: {m.payload_capacity_kg} kg</span>}
          </div>
        </div>
      )}
      renderSelected={(m) => (
        <span className="text-[13px] font-medium text-[#04314A] truncate block whitespace-nowrap">
          {m.brand} {m.model_name}
        </span>
      )}
    />
  );
}
