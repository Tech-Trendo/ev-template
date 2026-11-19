"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Plus,
  Pencil,
  Trash2,
  Search,
  Layers,
  Car,
  Check,
  X,
  ChevronRight,
  AlertCircle,
  Copy,
  Settings2,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "../AuthContext";
import {
  fetchChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  fetchModels,
  fetchVariants,
  getModelDisplayName,
  type ChecklistTemplate,
  type ChecklistItem,
  type VehicleModel,
  type VehicleVariant,
  type InspectionType,
} from "@/lib/inventory";
import {
  Button,
  Input,
  Select,
  FormField,
  Modal,
  PageHeader,
  Badge,
  ConfirmDialog,
} from "@/components/ui";

const SECTION_OPTIONS = [
  { value: "TOOLS_AND_EQUIPMENT", label: "Tools & Equipment" },
  { value: "FUNCTIONALITY", label: "Functionality" },
  { value: "APPEARANCE_AND_CONDITION", label: "Appearance & Condition" },
];

const SUB_SECTION_OPTIONS = [
  { value: "", label: "None (Main Section)" },
  { value: "INTERIOR_CLEANLINESS", label: "Interior Cleanliness" },
  { value: "EXTERIOR_BODY_PARTS", label: "Exterior Body Parts" },
];

export default function ChecklistTemplateManager({
  onNavigate,
}: {
  onNavigate?: (route: string) => void;
}) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("inventory.manage_pditemplate");

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [variants, setVariants] = useState<VehicleVariant[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Filters
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PDI" | "VEI">("ALL");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<InspectionType>("PDI");
  const [createName, setCreateName] = useState("");
  const [createModelId, setCreateModelId] = useState<string>("");
  const [createVariantId, setCreateVariantId] = useState<string>("");
  const [createCloneDefault, setCreateCloneDefault] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit template modal
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<ChecklistTemplate | null>(null);

  // Item modal
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemLabel, setItemLabel] = useState("");
  const [itemSection, setItemSection] = useState("FUNCTIONALITY");
  const [itemSubSection, setItemSubSection] = useState("");
  const [itemSortOrder, setItemSortOrder] = useState<number>(0);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState<ChecklistItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [tmplRes, mRes, vRes] = await Promise.all([
        fetchChecklistTemplates(),
        fetchModels(),
        fetchVariants(),
      ]);
      setTemplates(tmplRes);
      setModels(mRes);
      setVariants(vRes);

      if (tmplRes.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(tmplRes[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load checklist templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Filter templates list
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (typeFilter !== "ALL" && t.inspection_type !== typeFilter) {
        return false;
      }
      if (modelFilter && String(t.vehicle_model) !== modelFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (t.name || "").toLowerCase().includes(q);
        const matchesModel = (t.vehicle_model_name || "").toLowerCase().includes(q);
        const matchesVariant = (t.variant_name || "").toLowerCase().includes(q);
        if (!matchesName && !matchesModel && !matchesVariant) return false;
      }
      return true;
    });
  }, [templates, typeFilter, modelFilter, search]);

  // Model-variant cascade for create modal
  const createModalVariants = useMemo(() => {
    if (!createModelId) return [];
    return variants.filter((v) => String(v.vehicle_model) === createModelId);
  }, [variants, createModelId]);

  // Handle template creation
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setCreating(true);
    setError("");
    try {
      const payload: Partial<ChecklistTemplate> = {
        name: createName.trim() || undefined,
        inspection_type: createType,
        vehicle_model: createModelId ? Number(createModelId) : null,
        variant: createVariantId ? Number(createVariantId) : null,
        is_active: true,
      };
      const created = await createChecklistTemplate(payload);

      // If user checked clone default items, copy items from active default template
      if (createCloneDefault) {
        const defaultTmpl = templates.find(
          (t) => t.inspection_type === createType && !t.vehicle_model && !t.variant && t.is_active
        );
        if (defaultTmpl && defaultTmpl.items && defaultTmpl.items.length > 0) {
          for (const item of defaultTmpl.items) {
            await addChecklistItem(created.id, {
              label: item.label,
              section: item.section,
              sub_section: item.sub_section,
              sort_order: item.sort_order,
            });
          }
        }
      }

      setStatusMsg("Checklist template created successfully.");
      setIsCreateModalOpen(false);
      setCreateName("");
      setCreateModelId("");
      setCreateVariantId("");
      await loadData();
      setSelectedTemplateId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create template.");
    } finally {
      setCreating(false);
    }
  };

  // Handle template update
  const handleUpdateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate || !canManage) return;

    setUpdatingTemplate(true);
    setError("");
    try {
      await updateChecklistTemplate(selectedTemplate.id, {
        name: editName.trim(),
        is_active: editIsActive,
      });
      setStatusMsg("Template updated successfully.");
      setIsEditTemplateModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update template.");
    } finally {
      setUpdatingTemplate(false);
    }
  };

  // Handle template deletion
  const handleDeleteTemplate = async () => {
    if (!deletingTemplate || !canManage) return;
    try {
      await deleteChecklistTemplate(deletingTemplate.id);
      setStatusMsg("Template deleted.");
      setDeletingTemplate(null);
      if (selectedTemplateId === deletingTemplate.id) {
        setSelectedTemplateId(null);
      }
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete template.");
    }
  };

  // Item form modal open
  const openAddItemModal = () => {
    setEditingItem(null);
    setItemLabel("");
    setItemSection("FUNCTIONALITY");
    setItemSubSection("");
    const maxOrder = selectedTemplate?.items
      ? Math.max(...selectedTemplate.items.map((i) => i.sort_order), 0) + 10
      : 10;
    setItemSortOrder(maxOrder);
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: ChecklistItem) => {
    setEditingItem(item);
    setItemLabel(item.label);
    setItemSection(item.section);
    setItemSubSection(item.sub_section || "");
    setItemSortOrder(item.sort_order);
    setIsItemModalOpen(true);
  };

  // Handle item submit
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate || !canManage) return;
    if (!itemLabel.trim()) {
      setError("Please provide a checklist item label.");
      return;
    }

    setSavingItem(true);
    setError("");
    try {
      if (editingItem) {
        await updateChecklistItem(selectedTemplate.id, editingItem.id, {
          label: itemLabel.trim(),
          section: itemSection,
          sub_section: itemSubSection || null,
          sort_order: Number(itemSortOrder),
        });
        setStatusMsg("Checklist item updated.");
      } else {
        await addChecklistItem(selectedTemplate.id, {
          label: itemLabel.trim(),
          section: itemSection,
          sub_section: itemSubSection || null,
          sort_order: Number(itemSortOrder),
        });
        setStatusMsg("Checklist item added.");
      }
      setIsItemModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save checklist item.");
    } finally {
      setSavingItem(false);
    }
  };

  // Handle item deletion
  const handleDeleteItem = async () => {
    if (!selectedTemplate || !deletingItem || !canManage) return;
    try {
      await deleteChecklistItem(selectedTemplate.id, deletingItem.id);
      setStatusMsg("Checklist item deleted.");
      setDeletingItem(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete checklist item.");
    }
  };

  // Group items by section
  const groupedItems = useMemo(() => {
    if (!selectedTemplate || !selectedTemplate.items) return {};
    const map: Record<string, ChecklistItem[]> = {};
    for (const item of selectedTemplate.items) {
      const sec = item.section || "OTHER";
      if (!map[sec]) map[sec] = [];
      map[sec].push(item);
    }
    // Sort items within each section by sort_order
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    });
    return map;
  }, [selectedTemplate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Checklist Templates"
        subtitle="Configure checklist inspection templates for Pre-Delivery Inspection (PDI) and Vehicle Entry Inspection (VEI). Create model and variant overrides with fallback to default."
        actions={
          canManage ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateType("PDI");
                setCreateName("");
                setCreateModelId("");
                setCreateVariantId("");
                setCreateCloneDefault(true);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Template
            </Button>
          ) : undefined
        }
      />

      {/* Status or Error alerts */}
      {statusMsg && (
        <div className="bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl p-3.5 flex items-center justify-between text-[13px] text-[#065F46]">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#059669]" />
            <span>{statusMsg}</span>
          </div>
          <button
            onClick={() => setStatusMsg("")}
            className="text-[#059669] hover:text-[#065F46] text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5 flex items-center justify-between text-[13px] text-[#991B1B]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#DC2626]" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-[#DC2626] hover:text-[#991B1B] text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Left sidebar of templates, Right panel of template details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Filter & Template Cards */}
        <div className="lg:col-span-4 space-y-4">
          {/* Filters Card */}
          <div className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-3">
            <div className="text-[12px] font-semibold text-[#0B3D2B] uppercase tracking-wider">
              Filter Templates
            </div>

            {/* Type Tabs */}
            <div className="flex rounded-lg bg-[#F5F5F4] p-1 gap-1">
              {(["ALL", "PDI", "VEI"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    typeFilter === t
                      ? "bg-white text-[#0B3D2B] shadow-sm"
                      : "text-[#737373] hover:text-[#0B3D2B]"
                  }`}
                >
                  {t === "ALL" ? "All" : t}
                </button>
              ))}
            </div>

            {/* Model Filter */}
            <Select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="text-xs"
            >
              <option value="">All Vehicle Models</option>
              {models.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {getModelDisplayName(m)}
                </option>
              ))}
            </Select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
          </div>

          {/* Templates List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                Templates ({filteredTemplates.length})
              </span>
            </div>

            {loading ? (
              <div className="bg-white border border-[#E8E8E5] rounded-xl p-8 text-center text-xs text-[#737373]">
                Loading checklist templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="bg-white border border-[#E8E8E5] rounded-xl p-6 text-center text-xs text-[#737373]">
                No checklist templates found matching filters.
              </div>
            ) : (
              filteredTemplates.map((t) => {
                const isSelected = t.id === selectedTemplateId;
                const isDefault = !t.vehicle_model && !t.variant;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-[#F0F9FF] border-[#10B981] ring-1 ring-[#10B981]"
                        : "bg-white border-[#E8E8E5] hover:border-[#CBD5E1]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.inspection_type === "PDI"
                              ? "bg-[#EFF6FF] text-[#1E40AF]"
                              : "bg-[#FEF3C7] text-[#92400E]"
                          }`}
                        >
                          {t.inspection_type}
                        </span>
                        <span className="font-semibold text-[13px] text-[#0B3D2B]">
                          {t.name || (isDefault ? "Global Default Template" : "EV OS")}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-[#737373]">
                        v{t.version_no}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#737373] mt-2">
                      <div className="flex items-center gap-1.5 truncate">
                        {isDefault ? (
                          <span className="text-[#059669] font-medium">Default Template</span>
                        ) : t.variant_name ? (
                          <span className="truncate">Variant: {t.variant_name}</span>
                        ) : t.vehicle_model_name ? (
                          <span className="truncate">Model: {t.vehicle_model_name}</span>
                        ) : (
                          <span>Override</span>
                        )}
                      </div>
                      <span className="font-medium shrink-0">
                        {t.items?.length ?? 0} items
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Template Checklist Items */}
        <div className="lg:col-span-8">
          {selectedTemplate ? (
            <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-hidden shadow-sm">
              {/* Template Header Banner */}
              <div className="p-5 border-b border-[#E8E8E5] bg-[#FAFAF9]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                          selectedTemplate.inspection_type === "PDI"
                            ? "bg-[#EFF6FF] text-[#1E40AF]"
                            : "bg-[#FEF3C7] text-[#92400E]"
                        }`}
                      >
                        {selectedTemplate.inspection_type_display || selectedTemplate.inspection_type}
                      </span>
                      <h2 className="text-lg font-bold text-[#0B3D2B]">
                        {selectedTemplate.name ||
                          (!selectedTemplate.vehicle_model && !selectedTemplate.variant
                            ? "Global Default Checklist"
                            : selectedTemplate.variant_name
                            ? `${selectedTemplate.variant_name} Checklist`
                            : `${selectedTemplate.vehicle_model_name} Checklist`)}
                      </h2>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#737373]">
                      <span>Version: v{selectedTemplate.version_no}</span>
                      <span>·</span>
                      <span>
                        Scope:{" "}
                        {!selectedTemplate.vehicle_model && !selectedTemplate.variant
                          ? "Global Default (all vehicles)"
                          : selectedTemplate.variant_name
                          ? `Variant Override: ${selectedTemplate.variant_name}`
                          : `Model Override: ${selectedTemplate.vehicle_model_name}`}
                      </span>
                      <span>·</span>
                      <span
                        className={`font-semibold ${
                          selectedTemplate.is_active ? "text-[#059669]" : "text-[#737373]"
                        }`}
                      >
                        {selectedTemplate.is_active ? "Active" : "Archived"}
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditName(selectedTemplate.name || "");
                          setEditIsActive(selectedTemplate.is_active);
                          setIsEditTemplateModalOpen(true);
                        }}
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-1" />
                        Settings
                      </Button>
                      <Button variant="primary" size="sm" onClick={openAddItemModal}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Item
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List grouped by Section */}
              <div className="p-5 space-y-6">
                {Object.keys(groupedItems).length === 0 ? (
                  <div className="text-center py-12 text-[#737373]">
                    <ClipboardCheck className="w-8 h-8 mx-auto text-[#CBD5E1] mb-2" />
                    <p className="text-sm font-medium">No checklist items in this template.</p>
                    {canManage && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={openAddItemModal}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add First Item
                      </Button>
                    )}
                  </div>
                ) : (
                  Object.entries(groupedItems).map(([secKey, secItems]) => {
                    const secLabel =
                      selectedTemplate.section_labels?.[secKey] ||
                      SECTION_OPTIONS.find((o) => o.value === secKey)?.label ||
                      secKey.replace(/_/g, " ");

                    return (
                      <div
                        key={secKey}
                        className="border border-[#E8E8E5] rounded-xl overflow-hidden"
                      >
                        <div className="bg-[#F8FAFC] px-4 py-2.5 border-b border-[#E8E8E5] flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0B3D2B] tracking-wide uppercase">
                            {secLabel}
                          </span>
                          <span className="text-[11px] font-medium text-[#737373]">
                            {secItems.length} items
                          </span>
                        </div>

                        <div className="divide-y divide-[#E8E8E5]">
                          {secItems.map((item) => (
                            <div
                              key={item.id}
                              className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-[#FAFAF9] transition-colors"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <span className="text-[11px] font-mono text-[#737373] w-6 shrink-0 pt-0.5 text-right">
                                  {item.sort_order}
                                </span>
                                <div>
                                  <div className="text-[13px] font-medium text-[#0B3D2B]">
                                    {item.label}
                                  </div>
                                  {item.sub_section && (
                                    <div className="text-[11px] text-[#737373] mt-0.5">
                                      Sub-section:{" "}
                                      {item.sub_section === "INTERIOR_CLEANLINESS"
                                        ? "Interior Cleanliness"
                                        : item.sub_section === "EXTERIOR_BODY_PARTS"
                                        ? "Exterior Body Parts"
                                        : item.sub_section}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {canManage && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEditItemModal(item)}
                                    className="p-1.5 text-[#737373] hover:text-[#10B981] hover:bg-[#F0F9FF] rounded-lg transition-colors"
                                    title="Edit item"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItem(item)}
                                    className="p-1.5 text-[#737373] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                                    title="Delete item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E8E8E5] rounded-xl p-12 text-center text-[#737373]">
              <ClipboardCheck className="w-8 h-8 mx-auto text-[#CBD5E1] mb-2" />
              <p className="text-sm font-medium">Select a checklist template from the left.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Template */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Checklist Template"
      >
        <form onSubmit={handleCreateTemplate} className="space-y-4">
          <FormField label="Inspection Type">
            <Select
              value={createType}
              onChange={(e) => setCreateType(e.target.value as InspectionType)}
              required
            >
              <option value="PDI">Pre-Delivery Inspection (PDI)</option>
              <option value="VEI">Vehicle Entry Inspection (VEI)</option>
            </Select>
          </FormField>

          <FormField label="Template Name (Optional)">
            <Input
              placeholder="e.g. Joylong Commercial Variant Checklist"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </FormField>

          <FormField label="Specific Vehicle Model (Optional Override)">
            <Select
              value={createModelId}
              onChange={(e) => {
                setCreateModelId(e.target.value);
                setCreateVariantId("");
              }}
            >
              <option value="">Global Default (Applies to all models)</option>
              {models.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {getModelDisplayName(m)}
                </option>
              ))}
            </Select>
          </FormField>

          {createModelId && (
            <FormField label="Specific Vehicle Variant (Optional Override)">
              <Select
                value={createVariantId}
                onChange={(e) => setCreateVariantId(e.target.value)}
              >
                <option value="">All Variants of this Model</option>
                {createModalVariants.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-[#0B3D2B] font-medium">
              <input
                type="checkbox"
                checked={createCloneDefault}
                onChange={(e) => setCreateCloneDefault(e.target.checked)}
                className="w-4 h-4 rounded text-[#10B981] focus:ring-[#10B981]"
              />
              <span>Copy checklist items from active default template</span>
            </label>
            <p className="text-[11px] text-[#737373] mt-1 pl-6">
              Copies standard checklist items to start with so you can customize them.
            </p>
          </div>

          <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? "Creating..." : "Create Template"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Template Settings */}
      {selectedTemplate && (
        <Modal
          isOpen={isEditTemplateModalOpen}
          onClose={() => setIsEditTemplateModalOpen(false)}
          title="Edit Template Settings"
        >
          <form onSubmit={handleUpdateTemplate} className="space-y-4">
            <FormField label="Template Name">
              <Input
                placeholder="Template name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </FormField>

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#0B3D2B] font-medium">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#10B981] focus:ring-[#10B981]"
                />
                <span>Active Template</span>
              </label>
              <p className="text-[11px] text-[#737373] mt-1 pl-6">
                Active templates are used by technicians during inspections.
              </p>
            </div>

            <div data-modal-actions className="flex items-center justify-between pt-2 border-t border-[#E8E8E5]">
              {!selectedTemplate.vehicle_model && !selectedTemplate.variant ? (
                <span className="text-[11px] text-[#737373]">Global default cannot be deleted</span>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setIsEditTemplateModalOpen(false);
                    setDeletingTemplate(selectedTemplate);
                  }}
                >
                  Delete Template
                </Button>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsEditTemplateModalOpen(false)}
                  disabled={updatingTemplate}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={updatingTemplate}>
                  {updatingTemplate ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add or Edit Checklist Item */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editingItem ? "Edit Checklist Item" : "Add Checklist Item"}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <FormField label="Checklist Item Label">
            <Input
              placeholder="e.g. Check high-voltage wiring and terminal insulation"
              value={itemLabel}
              onChange={(e) => setItemLabel(e.target.value)}
              required
            />
          </FormField>

          <FormField label="Section">
            <Select
              value={itemSection}
              onChange={(e) => setItemSection(e.target.value)}
              required
            >
              {SECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Sub-Section (Optional)">
            <Select
              value={itemSubSection}
              onChange={(e) => setItemSubSection(e.target.value)}
            >
              {SUB_SECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Sort Order">
            <Input
              type="number"
              value={itemSortOrder}
              onChange={(e) => setItemSortOrder(parseInt(e.target.value) || 0)}
              required
            />
          </FormField>

          <div data-modal-actions className="flex justify-end gap-2 pt-2 border-t border-[#E8E8E5]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsItemModalOpen(false)}
              disabled={savingItem}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingItem}>
              {savingItem ? "Saving..." : editingItem ? "Update Item" : "Add Item"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Item Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingItem)}
        title="Delete Checklist Item"
        description={`Delete "${deletingItem?.label}" from this template? Technicians will no longer see this question on new inspections.`}
        confirmLabel="Delete Item"
        variant="danger"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeletingItem(null)}
      />

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingTemplate)}
        title="Delete Checklist Template"
        description={`Delete template "${deletingTemplate?.name || deletingTemplate?.variant_name || deletingTemplate?.vehicle_model_name}"?`}
        confirmLabel="Delete Template"
        variant="danger"
        onConfirm={handleDeleteTemplate}
        onCancel={() => setDeletingTemplate(null)}
      />
    </div>
  );
}
