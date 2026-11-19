"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Search,
  Filter,
  Truck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  fetchModels,
  fetchBodyTypes,
  createBodyType,
  updateBodyType,
  deleteBodyType,
  fetchVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  fetchModelSpecs,
  createModelSpec,
  updateModelSpec,
  deleteModelSpec,
  getModelDisplayName,
  type VehicleModel,
  type VehicleBodyType,
  type VehicleVariant,
  type VehicleModelSpec,
} from "@/lib/inventory";
import {
  Button,
  Input,
  Select,
  Textarea,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
} from "@/components/ui";

type Tab = "variants" | "battery" | "cargo";

export default function VariantsManager({
  onNavigate,
}: {
  onNavigate?: (route: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canManage =
    hasPerm("inventory.manage_vehiclevariant") ||
    hasPerm("inventory.add_vehiclevariant") ||
    hasPerm("inventory.change_vehiclevariant");

  const [tab, setTab] = useState<Tab>("variants");
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [bodyTypes, setBodyTypes] = useState<VehicleBodyType[]>([]);
  const [specs, setSpecs] = useState<VehicleModelSpec[]>([]);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Variant filters
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modals
  const [editingVariant, setEditingVariant] = useState<VehicleVariant | null>(null);
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [deletingVariant, setDeletingVariant] = useState<VehicleVariant | null>(null);

  const [editingBodyType, setEditingBodyType] = useState<VehicleBodyType | null>(null);
  const [isBodyTypeModalOpen, setIsBodyTypeModalOpen] = useState(false);
  const [deletingBodyType, setDeletingBodyType] = useState<VehicleBodyType | null>(null);
  const [editingSpec, setEditingSpec] = useState<VehicleModelSpec | null>(null);
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [deletingSpec, setDeletingSpec] = useState<VehicleModelSpec | null>(null);

  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [mRes, bRes, vRes, sRes] = await Promise.all([
        fetchModels(),
        fetchBodyTypes(),
        fetchVariants(),
        fetchModelSpecs(),
      ]);
      setModels(mRes);
      setBodyTypes(bRes);
      setVariants(vRes);
      setSpecs(sRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered variants
  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      if (modelFilter && String(v.vehicle_model) !== modelFilter) return false;
      if (statusFilter === "active" && !v.is_active) return false;
      if (statusFilter === "inactive" && v.is_active) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const vName = v.name.toLowerCase();
        const mName = (
          v.vehicle_model_detail
            ? getModelDisplayName(v.vehicle_model_detail)
            : ""
        ).toLowerCase();
        const btName = (v.body_type_detail?.name || "").toLowerCase();
        const spec = (v.spec_text || "").toLowerCase();
        if (
          !vName.includes(q) &&
          !mName.includes(q) &&
          !btName.includes(q) &&
          !spec.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [variants, modelFilter, statusFilter, search]);

  // Filtered body types
  const filteredBodyTypes = useMemo(() => {
    if (!search.trim()) return bodyTypes;
    const q = search.toLowerCase();
    return bodyTypes.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q)
    );
  }, [bodyTypes, search]);

  // Handle delete variant
  const confirmDeleteVariant = async () => {
    if (!deletingVariant) return;
    setSaving(true);
    try {
      await deleteVariant(deletingVariant.id);
      setStatusMsg(`Variant "${deletingVariant.name}" deleted.`);
      setDeletingVariant(null);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete body type
  const confirmDeleteBodyType = async () => {
    if (!deletingBodyType) return;
    setSaving(true);
    try {
      await deleteBodyType(deletingBodyType.id);
      setStatusMsg(`Body Type "${deletingBodyType.name}" deleted.`);
      setDeletingBodyType(null);
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Variants"
        subtitle="Configure model variants, battery capacities, and cargo lengths."
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "variants" ? (
                <Button
                  variant="primary"
                  leftIcon={<Plus size={15} />}
                  onClick={() => {
                    setEditingVariant(null);
                    setIsVariantModalOpen(true);
                  }}
                >
                  New Variant
                </Button>
              ) : (
                <Button
                  variant="primary"
                  leftIcon={<Plus size={15} />}
                  onClick={() => {
                    setEditingSpec(null);
                    setIsSpecModalOpen(true);
                  }}
                >
                  {tab === "battery" ? "New Battery Capacity" : "New Cargo Length"}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {statusMsg && (
        <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[12px] font-medium rounded-xl flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg("")}
            className="text-[#166534] hover:opacity-70 text-[11px] font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="text-[#991B1B] hover:opacity-70 text-[11px] font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#E8E8E5]">
        <button
          onClick={() => {
            setTab("variants");
            setSearch("");
          }}
          className={`px-5 py-3 text-[13px] font-semibold tracking-[0.02em] border-b-2 transition-colors flex items-center gap-2 ${
            tab === "variants"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Truck size={16} />
          <span>Vehicle Variants</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              tab === "variants"
                ? "bg-[#0B3D2B] text-white"
                : "bg-[#F0F0ED] text-[#737373]"
            }`}
          >
            {variants.length}
          </span>
        </button>

        <button
          onClick={() => {
            setTab("battery");
            setSearch("");
          }}
          className={`px-5 py-3 text-[13px] font-semibold tracking-[0.02em] border-b-2 transition-colors flex items-center gap-2 ${
            tab === "battery"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Layers size={16} />
          <span>Battery Capacity</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              tab === "battery" ? "bg-[#0B3D2B] text-white" : "bg-[#F0F0ED] text-[#737373]"
            }`}
          >
            {specs.filter((row) => row.kind === "battery").length}
          </span>
        </button>
        <button
          onClick={() => {
            setTab("cargo");
            setSearch("");
          }}
          className={`px-5 py-3 text-[13px] font-semibold tracking-[0.02em] border-b-2 transition-colors flex items-center gap-2 ${
            tab === "cargo"
              ? "border-[#10B981] text-[#0B3D2B]"
              : "border-transparent text-[#737373] hover:text-[#0B3D2B]"
          }`}
        >
          <Layers size={16} />
          <span>Cargo Length</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              tab === "cargo" ? "bg-[#0B3D2B] text-white" : "bg-[#F0F0ED] text-[#737373]"
            }`}
          >
            {specs.filter((row) => row.kind === "cargo_length").length}
          </span>
        </button>
      </div>

      {/* Tab 1: Vehicle Variants */}
      {tab === "variants" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variant name, specs, body type..."
                leftIcon={<Search size={14} />}
              />
            </div>
            <div className="w-48">
              <Select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                options={[
                  { value: "", label: "All Vehicle Models" },
                  ...models.map((m) => ({
                    value: String(m.id),
                    label: getModelDisplayName(m),
                  })),
                ]}
              />
            </div>
            <div className="w-36">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "all", label: "All Status" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[880px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em]">
                    <th className="px-5 py-3">Variant Name</th>
                    <th className="px-5 py-3">Vehicle Model</th>
                    <th className="px-5 py-3">Key Specs</th>
                    <th className="px-5 py-3">Status</th>
                    {canManage && <th className="px-5 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E5]">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`vskel-${i}`}>
                        <td colSpan={canManage ? 5 : 4} className="px-5 py-4">
                          <div className="h-4 bg-[#F0F0ED] rounded max-w-[60%]" />
                        </td>
                      </tr>
                    ))
                  ) : filteredVariants.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManage ? 5 : 4}
                        className="px-5 py-12 text-center text-[13px] text-[#737373]"
                      >
                        No vehicle variants found.
                      </td>
                    </tr>
                  ) : (
                    filteredVariants.map((v) => (
                      <tr
                        key={v.id}
                        className="hover:bg-[#FAFAF8] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="text-[13px] font-bold text-[#0B3D2B]">
                            {v.name}
                          </div>
                          {v.product_code && (
                            <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#737373]">
                              {v.product_code}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                          {v.vehicle_model_name
                            || (v.vehicle_model_detail ? getModelDisplayName(v.vehicle_model_detail) : "")
                            || getModelDisplayName(models.find((model) => model.id === v.vehicle_model))
                            || `Model #${v.vehicle_model}`}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {v.spec_text ? (
                            <div className="line-clamp-2 text-[11px]">{v.spec_text}</div>
                          ) : (
                            <span className="text-[#B0B0AA]">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={v.is_active ? "success" : "neutral"} size="sm">
                            {v.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Pencil size={13} />}
                                onClick={() => {
                                  setEditingVariant(v);
                                  setIsVariantModalOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Trash2 size={13} />}
                                className="text-[#DC2626] hover:bg-[#FEF2F2]"
                                onClick={() => setDeletingVariant(v)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Battery capacity and cargo length */}
      {(tab === "battery" || tab === "cargo") && (
        <ModelSpecTable
          kind={tab === "battery" ? "battery" : "cargo_length"}
          title={tab === "battery" ? "Battery capacity" : "Cargo length"}
          specs={specs}
          models={models}
          search={search}
          onSearch={setSearch}
          canManage={canManage}
          onEdit={(row) => {
            setEditingSpec(row);
            setIsSpecModalOpen(true);
          }}
          onDelete={setDeletingSpec}
        />
      )}

      {/* Tab 2: Body Types */}
      {false && tab === "variants" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search body type name or description..."
                leftIcon={<Search size={14} />}
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em]">
                    <th className="px-5 py-3">Body Type Name</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Sort Order</th>
                    <th className="px-5 py-3">Status</th>
                    {canManage && <th className="px-5 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E5]">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`btskel-${i}`}>
                        <td colSpan={canManage ? 5 : 4} className="px-5 py-4">
                          <div className="h-4 bg-[#F0F0ED] rounded max-w-[60%]" />
                        </td>
                      </tr>
                    ))
                  ) : filteredBodyTypes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManage ? 5 : 4}
                        className="px-5 py-12 text-center text-[13px] text-[#737373]"
                      >
                        No vehicle body types found.
                      </td>
                    </tr>
                  ) : (
                    filteredBodyTypes.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-[#FAFAF8] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="text-[13px] font-bold text-[#0B3D2B]">
                            {b.name}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {b.description || "-"}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-[#737373]">
                          {b.sort_order}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={b.is_active ? "success" : "neutral"} size="sm">
                            {b.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Pencil size={13} />}
                                onClick={() => {
                                  setEditingBodyType(b);
                                  setIsBodyTypeModalOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Trash2 size={13} />}
                                className="text-[#DC2626] hover:bg-[#FEF2F2]"
                                onClick={() => setDeletingBodyType(b)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Variant Modal */}
      {isVariantModalOpen && (
        <VariantModal
          initial={editingVariant}
          models={models}
          onClose={() => setIsVariantModalOpen(false)}
          onSaved={() => {
            setIsVariantModalOpen(false);
            setStatusMsg(
              editingVariant ? "Variant updated successfully." : "Variant created successfully."
            );
            loadData();
          }}
        />
      )}

      {isSpecModalOpen && (
        <ModelSpecModal
          kind={tab === "cargo" ? "cargo_length" : "battery"}
          models={models}
          initial={editingSpec}
          onClose={() => setIsSpecModalOpen(false)}
          onSaved={(message) => {
            setIsSpecModalOpen(false);
            setStatusMsg(message);
            loadData();
          }}
        />
      )}

      {deletingSpec && (
        <ConfirmDialog
          isOpen={true}
          title={deletingSpec.kind === "battery" ? "Delete battery capacity?" : "Delete cargo length?"}
          description={`Remove "${deletingSpec.label}" from ${deletingSpec.vehicle_model_name}?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          loading={saving}
          onConfirm={async () => {
            setSaving(true);
            try {
              await deleteModelSpec(deletingSpec.id);
              setStatusMsg(`Removed "${deletingSpec.label}".`);
              setDeletingSpec(null);
              loadData();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Delete failed");
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => setDeletingSpec(null)}
        />
      )}

      {/* Body Type Modal */}
      {isBodyTypeModalOpen && (
        <BodyTypeModal
          initial={editingBodyType}
          onClose={() => setIsBodyTypeModalOpen(false)}
          onSaved={() => {
            setIsBodyTypeModalOpen(false);
            setStatusMsg(
              editingBodyType
                ? "Body type updated successfully."
                : "Body type created successfully."
            );
            loadData();
          }}
        />
      )}

      {/* Delete Variant Confirmation Dialog */}
      {deletingVariant && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Variant?"
          description={`Are you sure you want to delete "${deletingVariant.name}"? This cannot be undone.`}
          confirmLabel="Delete Variant"
          cancelLabel="Cancel"
          variant="danger"
          loading={saving}
          onConfirm={confirmDeleteVariant}
          onCancel={() => setDeletingVariant(null)}
        />
      )}

      {/* Delete Body Type Confirmation Dialog */}
      {deletingBodyType && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Body Type?"
          description={`Are you sure you want to delete "${deletingBodyType.name}"? This cannot be undone.`}
          confirmLabel="Delete Body Type"
          cancelLabel="Cancel"
          variant="danger"
          loading={saving}
          onConfirm={confirmDeleteBodyType}
          onCancel={() => setDeletingBodyType(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant Create / Edit Modal
// ---------------------------------------------------------------------------
function VariantModal({
  initial,
  models,
  onClose,
  onSaved,
}: {
  initial: VehicleVariant | null;
  models: VehicleModel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleModel, setVehicleModel] = useState(
    initial ? String(initial.vehicle_model) : models[0]?.id ? String(models[0].id) : ""
  );
  const [name, setName] = useState(initial?.name || "");
  const [productCode, setProductCode] = useState(initial?.product_code || "");
  const [specText, setSpecText] = useState(initial?.spec_text || "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleModel) return setError("Please select a vehicle model.");
    if (!name.trim()) return setError("Variant name is required.");

    setSaving(true);
    setError("");

    const payload = {
      vehicle_model: Number(vehicleModel),
      name: name.trim(),
      product_code: productCode.trim().toUpperCase(),
      spec_text: specText.trim(),
      is_active: isActive,
    };

    try {
      if (initial) {
        await updateVariant(initial.id, payload);
      } else {
        await createVariant(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to save variant"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      title={initial ? "Edit Variant" : "New Vehicle Variant"}
      subtitle="Name the variant and the vehicle model it belongs to."
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-xl">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Vehicle Model" required>
            <Select
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              options={models.map((m) => ({
                value: String(m.id),
                label: getModelDisplayName(m),
              }))}
            />
          </FormField>

          <FormField label="Variant Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chassis, Hi-Deck Container"
            />
          </FormField>
        </div>

        <FormField label="Product Code">
          <Input
            value={productCode}
            onChange={(e) => setProductCode(e.target.value.toUpperCase())}
            placeholder="e.g. CHA, HDC, COT"
            maxLength={20}
          />
        </FormField>

        <FormField label="Specifications & Features">
          <Textarea
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            rows={3}
            placeholder="Detailed cargo box dimensions, hydraulic tipping mechanism, hydraulic ram capacity, etc."
          />
        </FormField>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            id="variant_is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-[#E8E8E5] text-[#10B981] focus:ring-0"
          />
          <span className="text-[12px] font-semibold text-[#0B3D2B]">
            Variant is active and available for selection
          </span>
        </label>

        <div data-modal-actions className="flex justify-end gap-3 pt-3 border-t border-[#E8E8E5]">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {initial ? "Save Changes" : "Create Variant"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Body Type Create / Edit Modal
// ---------------------------------------------------------------------------
function BodyTypeModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: VehicleBodyType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Body type name is required.");

    setSaving(true);
    setError("");

    const payload = {
      name: name.trim(),
      description: description.trim(),
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    };

    try {
      if (initial) {
        await updateBodyType(initial.id, payload);
      } else {
        await createBodyType(payload);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to save body type"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      title={initial ? "Edit Body Type" : "New Body Type"}
      subtitle="Define commercial vehicle build types (e.g., Tipper, Cargo Box, Flatbed)."
      onClose={onClose}
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-medium rounded-xl">
            {error}
          </div>
        )}

        <FormField label="Body Type Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tipper, Cargo Box, Flatbed, Van, Refrigerated"
          />
        </FormField>

        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Brief explanation of body configuration."
          />
        </FormField>

        <FormField label="Sort Order">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="0"
          />
        </FormField>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="body_type_is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-[#E8E8E5] text-[#10B981] focus:ring-0"
          />
          <label
            htmlFor="body_type_is_active"
            className="text-[12px] font-semibold text-[#0B3D2B] cursor-pointer"
          >
            Body type is active
          </label>
        </div>

        <div data-modal-actions className="flex justify-end gap-3 pt-3 border-t border-[#E8E8E5]">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {initial ? "Save Changes" : "Create Body Type"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ModelSpecTable({
  kind,
  title,
  specs,
  models,
  search,
  onSearch,
  canManage,
  onEdit,
  onDelete,
}: {
  kind: "battery" | "cargo_length";
  title: string;
  specs: VehicleModelSpec[];
  models: VehicleModel[];
  search: string;
  onSearch: (value: string) => void;
  canManage: boolean;
  onEdit: (row: VehicleModelSpec) => void;
  onDelete: (row: VehicleModelSpec) => void;
}) {
  const [modelFilter, setModelFilter] = useState("");
  const rows = specs.filter((row) => {
    if (row.kind !== kind) return false;
    if (modelFilter && String(row.vehicle_model) !== modelFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!row.label.toLowerCase().includes(q) && !row.vehicle_model_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}...`} leftIcon={<Search size={14} />} />
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            options={[
              { value: "", label: "All vehicle models" },
              ...models.map((model) => ({ value: String(model.id), label: getModelDisplayName(model) })),
            ]}
          />
        </div>
      </div>
      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-[#E8E8E5] bg-[#FAFAF8] text-[11px] font-semibold text-[#0B3D2B]">
              <th className="px-5 py-3">Vehicle model</th>
              <th className="px-5 py-3">{title}</th>
              <th className="px-5 py-3">Status</th>
              {canManage && <th className="px-5 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-5 py-10 text-center text-[13px] text-[#737373]">
                  No {title.toLowerCase()} values yet. Add one for a vehicle model.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-[#F0F0ED] last:border-0">
                  <td className="px-5 py-3.5 text-[13px] font-semibold text-[#0B3D2B]">{row.vehicle_model_name}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#0B3D2B]">{row.label}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={row.is_active ? "success" : "neutral"} size="sm">{row.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="sm" leftIcon={<Pencil size={13} />} onClick={() => onEdit(row)}>Edit</Button>
                        <Button variant="ghost" size="sm" leftIcon={<Trash2 size={13} />} className="text-[#DC2626]" onClick={() => onDelete(row)}>Delete</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelSpecModal({
  kind,
  models,
  initial,
  onClose,
  onSaved,
}: {
  kind: "battery" | "cargo_length";
  models: VehicleModel[];
  initial: VehicleModelSpec | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [modelId, setModelId] = useState(initial ? String(initial.vehicle_model) : "");
  const [label, setLabel] = useState(initial?.label || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const noun = kind === "battery" ? "battery capacity" : "cargo length";

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modelId || !label.trim()) {
      setError("Choose a vehicle model and enter a value.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (initial) {
        await updateModelSpec(initial.id, { vehicle_model: Number(modelId), label: label.trim() });
        onSaved("Saved.");
      } else {
        await createModelSpec({ vehicle_model: Number(modelId), kind, label: label.trim() });
        onSaved("Saved.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <Modal isOpen title={initial ? `Edit ${noun}` : `New ${noun}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <FormField label="Vehicle model" required>
          <Select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            options={[
              { value: "", label: "Select vehicle model" },
              ...models.map((model) => ({ value: String(model.id), label: getModelDisplayName(model) })),
            ]}
          />
        </FormField>
        <FormField label={kind === "battery" ? "Battery capacity" : "Cargo length"} required>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === "battery" ? "e.g. CATL, 100.07 kWh" : "e.g. 16 FT"}
          />
        </FormField>
        {error ? <p className="text-[12px] text-[#DC2626]">{error}</p> : null}
        <div data-modal-actions className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
