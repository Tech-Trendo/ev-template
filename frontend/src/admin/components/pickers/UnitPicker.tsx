"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Field, Modal, inputCls, primaryBtnCls } from "@/admin/crm/ui";
import { LazySelect } from "./LazySelect";

export type UnitOption = {
  id: number | string;
  vin_chassis_no: string;
  motor_no?: string;
  battery_no?: string;
  registration_no?: string;
  vehicle_model_id?: number | string;
  vehicle_model_name?: string;
  model_detail?: { id?: number | string; brand?: string; model_name?: string; selling_price?: number | string };
  variant?: number | string | null;
  variant_name?: string | null;
  variant_detail?: { id: number; name: string; body_type_detail?: { id: number; name: string } } | null;
  color?: string;
  status?: string;
  selling_price?: number | string;
  current_customer_name?: string;
  current_customer_id?: number | string;
  current_customer?: {
    id: number | string;
    name: string;
    phone?: string;
    email?: string;
    location?: string;
  };
  effective_battery_kw?: number | string;
  odometer_km?: number;
  sold_date?: string;
};

export function UnitPicker({
  value,
  onChange,
  statusFilter,
  statusExclude,
  modelFilter,
  allowExternal = false,
  onAddExternal,
  label = "Vehicle / VIN",
  placeholder = "Select vehicle unit...",
  searchPlaceholder = "Search VIN, chassis, motor, or owner...",
  required = false,
  error,
  disabled = false,
  allowClear = true,
  compact = false,
}: {
  value: number | string | null | undefined;
  onChange: (unitId: number | null, unit: UnitOption | null) => void;
  statusFilter?: string | string[];
  statusExclude?: string | string[];
  modelFilter?: number | string | null;
  allowExternal?: boolean;
  onAddExternal?: () => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  allowClear?: boolean;
  compact?: boolean;
}) {
  const [externalModalOpen, setExternalModalOpen] = useState(false);

  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      if (statusFilter) {
        if (Array.isArray(statusFilter)) {
          params.set("status__in", statusFilter.join(","));
        } else {
          params.set("status", statusFilter);
        }
      }
      if (statusExclude) {
        if (Array.isArray(statusExclude)) {
          params.set("status_exclude", statusExclude.join(","));
        } else {
          params.set("status_exclude", statusExclude);
        }
      }
      if (modelFilter) {
        params.set("model", String(modelFilter));
      }

      const res = await api<{
        results?: UnitOption[];
        total_pages?: number;
        count?: number;
      } | UnitOption[]>(`/api/inventory/units/?${params.toString()}`);

      if (Array.isArray(res)) {
        return { results: res, totalPages: 1, count: res.length };
      }
      return {
        results: res.results || [],
        totalPages: res.total_pages || 1,
        count: res.count ?? (res.results ? res.results.length : 0),
      };
    },
    [statusFilter, statusExclude, modelFilter]
  );

  const fetchById = useCallback(async (id: string | number) => {
    try {
      return await api<UnitOption>(`/api/inventory/units/${id}/`);
    } catch {
      return null;
    }
  }, []);

  const getModelTitle = (u: UnitOption) => {
    let base = "";
    if (u.model_detail) {
      base = `${u.model_detail.brand || "VT"} ${u.model_detail.model_name || ""}`.trim();
    } else {
      base = u.vehicle_model_name || "Vehicle Unit";
    }
    const variantName = u.variant_name || u.variant_detail?.name;
    if (variantName) {
      return `${base} (${variantName})`;
    }
    return base;
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const readable = status.replace(/_/g, " ");
    return (
      <span className="text-[10px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded bg-[#F4F7F9] text-[#04314A] border border-[#E8E8E5]">
        {readable}
      </span>
    );
  };

  return (
    <>
      <LazySelect<UnitOption>
        value={value}
        onChange={(id, item) => onChange(id !== null ? Number(id) : null, item)}
        fetchPage={fetchPage}
        fetchById={fetchById}
        getItemId={(u) => u.id}
        getItemLabel={(u) => `${u.vin_chassis_no} · ${getModelTitle(u)}`}
        label={label}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        required={required}
        error={error}
        disabled={disabled}
        allowClear={allowClear}
        pageSize={10}
        emptyMessage="No matching vehicle units found in inventory."
        headerAction={
          allowExternal ? (
            <button
              type="button"
              onClick={() => {
                if (onAddExternal) onAddExternal();
                else setExternalModalOpen(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A] transition-colors"
            >
              <Plus size={13} /> Add external vehicle
            </button>
          ) : null
        }
        renderItem={(u) => {
          if (compact) {
            return (
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-[12px] font-bold text-[#04314A] truncate">
                  {u.vin_chassis_no}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5] shrink-0">
                  {getModelTitle(u)}
                </span>
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-bold text-[#04314A]">
                  {u.vin_chassis_no}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5]">
                  {getModelTitle(u)}
                </span>
                {getStatusBadge(u.status)}
                {u.registration_no && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#04314A] text-white">
                    {u.registration_no}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#737373] flex-wrap">
                {u.color && <span>Color: {u.color}</span>}
                {u.motor_no && <span>· Motor: {u.motor_no}</span>}
                {u.battery_no && <span>· Batt: {u.battery_no}</span>}
                {u.current_customer?.name && (
                  <span>· Assigned: {u.current_customer.name}</span>
                )}
              </div>
            </div>
          );
        }}
        renderSelected={(u) => (
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
            <span className="text-[12px] font-bold text-[#04314A] truncate shrink-0">
              {u.vin_chassis_no}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FAFAF8] text-[#737373] border border-[#E8E8E5] shrink-0 truncate max-w-[120px]">
              {getModelTitle(u)}
            </span>
            {!compact && getStatusBadge(u.status)}
            {!compact && u.color && (
              <span className="text-[11px] text-[#737373] shrink-0 hidden sm:inline">({u.color})</span>
            )}
          </div>
        )}
      />

      {externalModalOpen && (
        <AddExternalVehicleModal
          onClose={() => setExternalModalOpen(false)}
          onAdded={(fake) => {
            setExternalModalOpen(false);
            onChange(null, fake);
          }}
        />
      )}
    </>
  );
}

function AddExternalVehicleModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (u: UnitOption) => void;
}) {
  const [chassis, setChassis] = useState("");
  const [model, setModel] = useState("");
  const [regNo, setRegNo] = useState("");
  const [motorNo, setMotorNo] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chassis.trim()) return;
    const fakeUnit: UnitOption = {
      id: "external",
      vin_chassis_no: chassis.trim(),
      vehicle_model_name: model.trim() || "External Vehicle",
      registration_no: regNo.trim(),
      motor_no: motorNo.trim(),
    };
    onAdded(fakeUnit);
  };

  return (
    <Modal title="Add External Vehicle (Not Sold by VT)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[12px] text-[#737373]">
          Record an external vehicle arriving for servicing or repairs.
        </p>

        <Field label="Chassis Number / VIN" required>
          <input
            type="text"
            value={chassis}
            onChange={(e) => setChassis(e.target.value)}
            placeholder="e.g. CH-EXT-9988"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Vehicle Model / Brand">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. Other Brand EV"
              className={inputCls}
            />
          </Field>

          <Field label="Registration Number">
            <input
              type="text"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. BA-01-PA-9988"
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Motor Number">
          <input
            type="text"
            value={motorNo}
            onChange={(e) => setMotorNo(e.target.value)}
            placeholder="e.g. MOT-EXT-123"
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
          <button type="submit" className={primaryBtnCls}>
            Use Vehicle
          </button>
        </div>
      </form>
    </Modal>
  );
}
