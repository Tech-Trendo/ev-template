import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cpu,
  Eye,
  ExternalLink,
  Factory,
  Globe,
  Home,
  Info,
  Layers,
  Loader2,
  MapPin,
  Mountain,
  Newspaper,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Star,
  TrendingUp,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { CMS_DEFAULTS, CMS_PAGE_LABELS, type CmsPageKey } from "@/lib/cmsDefaults";
import { PageHeader } from "../crm/ui";
import {
  CMS_PAGE_METAS,
  type CmsFieldDef,
  type CmsGroupDef,
  type CmsPrimitiveFieldDef,
  type CmsListFieldDef,
} from "./schemas";
import { CmsImageField } from "./CmsImageField";
import { CmsListField } from "./CmsListField";
import { CmsLivePreview } from "./CmsLivePreview";

export type PrimitiveFieldType = "text" | "textarea" | "image" | "number";
export type { CmsFieldDef, CmsGroupDef };

type Json = Record<string, unknown>;

const inputCls =
  "border border-[#E8E8E5] rounded-xl bg-white px-3.5 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/10 transition-all w-full";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Json)[part];
  }, obj);
}

function setByPath(obj: Json, path: string, value: unknown) {
  const parts = path.split(".");
  let node: Json = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]];
    if (!next || typeof next !== "object") {
      node[parts[i]] = {};
    }
    node = node[parts[i]] as Json;
  }
  node[parts[parts.length - 1]] = value;
}

function getSectionIcon(iconName?: string) {
  switch (iconName) {
    case "Sparkles":
      return <Sparkles size={16} />;
    case "ShieldCheck":
      return <ShieldCheck size={16} />;
    case "TrendingUp":
      return <TrendingUp size={16} />;
    case "Zap":
      return <Zap size={16} />;
    case "Mountain":
      return <Mountain size={16} />;
    case "Cpu":
      return <Cpu size={16} />;
    case "MapPin":
      return <MapPin size={16} />;
    case "Calculator":
      return <Calculator size={16} />;
    case "Truck":
      return <Truck size={16} />;
    case "Factory":
      return <Factory size={16} />;
    case "Sliders":
      return <Sliders size={16} />;
    case "Settings2":
      return <Settings2 size={16} />;
    case "Info":
      return <Info size={16} />;
    case "Star":
      return <Star size={16} />;
    case "CheckCircle2":
      return <CheckCircle2 size={16} />;
    case "Newspaper":
      return <Newspaper size={16} />;
    case "Phone":
      return <Phone size={16} />;
    case "Building2":
      return <Building2 size={16} />;
    case "Globe":
      return <Globe size={16} />;
    default:
      return <Layers size={16} />;
  }
}

function getPageIcon(key: CmsPageKey) {
  switch (key) {
    case "home":
      return <Home size={15} />;
    case "vehicles":
      return <Truck size={15} />;
    case "industries":
      return <Factory size={15} />;
    case "calculator":
      return <Calculator size={15} />;
    case "roi":
      return <Calculator size={15} />;
    case "about":
      return <Info size={15} />;
    case "stories":
      return <Newspaper size={15} />;
    case "contact":
      return <Phone size={15} />;
    case "quote":
      return <Phone size={15} />;
    case "global":
      return <Globe size={15} />;
  }
}

const ALL_PAGE_KEYS: CmsPageKey[] = [
  "home",
  "vehicles",
  "industries",
  "calculator",
  "roi",
  "about",
  "stories",
  "contact",
  "quote",
  "global",
];

export interface CmsEditorProps {
  pageKey: CmsPageKey;
  schema: CmsGroupDef[];
  sitePath: string;
  onNavigate?: (pageKey: CmsPageKey) => void;
}

export default function CmsEditor({
  pageKey,
  schema,
  sitePath,
  onNavigate,
}: CmsEditorProps) {
  const [data, setData] = useState<Json>(() => clone(CMS_DEFAULTS[pageKey] as unknown as Json));
  const [savedData, setSavedData] = useState<Json>(() => clone(CMS_DEFAULTS[pageKey] as unknown as Json));
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const hubScrollRef = useRef<HTMLDivElement>(null);
  const sectionScrollRef = useRef<HTMLDivElement>(null);

  const meta = CMS_PAGE_METAS[pageKey];

  // Load content
  const load = useCallback(() => {
    setLoading(true);
    setStatus(null);
    api<{ data: Json; updated_at?: string; updated_by_name?: string }>(`/api/cms/pages/${pageKey}/`)
      .then((row) => {
        setExists(true);
        setUpdatedAt(row.updated_at ?? "");
        setUpdatedBy(row.updated_by_name ?? "");
        const merged = { ...clone(CMS_DEFAULTS[pageKey] as unknown as Json), ...row.data };
        setData(merged);
        setSavedData(merged);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setExists(false);
          const def = clone(CMS_DEFAULTS[pageKey] as unknown as Json);
          setData(def);
          setSavedData(def);
        } else {
          setStatus({
            kind: "error",
            message: e instanceof Error ? e.message : "Failed to load content.",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [pageKey]);

  useEffect(load, [load]);

  // Track if there are unsaved changes
  const isDirty = useMemo(() => {
    if (loading) return false;
    return JSON.stringify(data) !== JSON.stringify(savedData);
  }, [data, savedData, loading]);

  const update = (path: string, value: unknown) => {
    setStatus(null);
    setData((prev) => {
      const next = clone(prev);
      setByPath(next, path, value);
      return next;
    });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const row = exists
        ? await api<{ updated_at?: string; updated_by_name?: string }>(`/api/cms/pages/${pageKey}/`, {
            method: "PUT",
            body: JSON.stringify({ page: pageKey, data }),
          })
        : await api<{ updated_at?: string; updated_by_name?: string }>("/api/cms/pages/", {
            method: "POST",
            body: JSON.stringify({ page: pageKey, data }),
          });
      setExists(true);
      setSavedData(clone(data));
      setUpdatedAt(row.updated_at ?? new Date().toISOString());
      setUpdatedBy(row.updated_by_name ?? "Admin");
      setStatus({ kind: "ok", message: "Changes published to the live website." });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to save content.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut: Ctrl+S or Cmd+S to publish
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  const resetAllToDefaults = () => {
    const def = clone(CMS_DEFAULTS[pageKey] as unknown as Json);
    setData(def);
    setResetModalOpen(false);
    setStatus({ kind: "ok", message: "Reset to default template. Click Publish to apply to live site." });
  };

  const discardChanges = () => {
    setData(clone(savedData));
    setStatus({ kind: "ok", message: "Unsaved edits discarded." });
  };

  const resetSection = (group: CmsGroupDef) => {
    group.fields.forEach((field) => {
      const defVal = getByPath(CMS_DEFAULTS[pageKey], field.key);
      update(field.key, clone(defVal));
    });
    setStatus({ kind: "ok", message: `Section "${group.title}" reset to defaults.` });
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("image", file);
    const res = await api<{ url: string }>("/api/cms/pages/upload-image/", {
      method: "POST",
      body: fd,
    });
    return res.url;
  };

  const toggleSectionCollapse = (title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const expandAllSections = () => setCollapsedSections({});
  const collapseAllSections = () => {
    const all: Record<string, boolean> = {};
    schema.forEach((g) => {
      all[g.title] = true;
    });
    setCollapsedSections(all);
  };

  // Filter sections and fields by search query and selected section tab
  const filteredSchema = useMemo(() => {
    return schema
      .filter((group) => {
        if (selectedSection !== "all" && (group.id || group.title) !== selectedSection) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        if (group.title.toLowerCase().includes(q)) return true;
        if (group.description && group.description.toLowerCase().includes(q)) return true;
        return group.fields.some((f) => {
          if (f.label.toLowerCase().includes(q)) return true;
          if (f.hint && f.hint.toLowerCase().includes(q)) return true;
          const val = getByPath(data, f.key);
          if (typeof val === "string" && val.toLowerCase().includes(q)) return true;
          return false;
        });
      })
      .map((group) => {
        if (!searchQuery.trim()) return group;
        const q = searchQuery.toLowerCase();
        const matchingFields = group.fields.filter((f) => {
          if (f.label.toLowerCase().includes(q)) return true;
          if (f.hint && f.hint.toLowerCase().includes(q)) return true;
          const val = getByPath(data, f.key);
          if (typeof val === "string" && val.toLowerCase().includes(q)) return true;
          return true; // Keep group context
        });
        return { ...group, fields: matchingFields };
      });
  }, [schema, selectedSection, searchQuery, data]);

  const renderPrimitiveField = (
    field: CmsPrimitiveFieldDef,
    value: unknown,
    onChange: (v: unknown) => void,
    idPrefix: string,
  ): ReactNode => {
    const id = `${idPrefix}-${field.key}`;
    const strValue = value === undefined || value === null ? "" : String(value);
    const defaultVal = getByPath(CMS_DEFAULTS[pageKey], field.key);

    if (field.type === "image") {
      return (
        <CmsImageField
          key={field.key}
          label={field.label}
          value={strValue}
          defaultValue={typeof defaultVal === "string" ? defaultVal : undefined}
          hint={field.hint}
          onChange={onChange}
          onUpload={uploadImage}
        />
      );
    }

    return (
      <div key={field.key} className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#737373] flex items-center gap-1.5">
            {field.label}
            {field.isAccent && (
              <span className="px-1.5 py-0.2 rounded-sm bg-[#10B981]/10 text-[#10B981] text-[9px] font-bold lowercase tracking-normal">
                accent blue
              </span>
            )}
          </label>
          {defaultVal !== undefined && strValue !== String(defaultVal) && (
            <button
              type="button"
              onClick={() => onChange(defaultVal)}
              title="Reset field to default"
              className="text-[9px] font-semibold text-[#B0B0AA] hover:text-[#10B981] flex items-center gap-0.5 transition-colors"
            >
              <RefreshCw size={9} /> Reset
            </button>
          )}
        </div>

        {field.type === "textarea" ? (
          <textarea
            id={id}
            rows={3}
            className={`${inputCls} resize-y min-h-[75px]`}
            value={strValue}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <div className="relative">
            <input
              id={id}
              type={field.type === "number" ? "number" : "text"}
              className={`${inputCls} ${field.unit ? "pr-14" : ""}`}
              value={strValue}
              placeholder={field.placeholder}
              onChange={(e) =>
                onChange(field.type === "number" ? Number(e.target.value || 0) : e.target.value)
              }
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#737373] pointer-events-none uppercase bg-[#F0F0ED] px-1.5 py-0.5 rounded">
                {field.unit}
              </span>
            )}
          </div>
        )}

        {field.isAccent && strValue && (
          <div className="p-2 rounded-lg bg-[#10B981]/5 border border-[#10B981]/20 text-[11px] text-[#0B3D2B]">
            <span className="text-[10px] font-bold text-[#10B981] uppercase block mb-0.5">Live Style Preview:</span>
            <span className="font-bold text-[#10B981]">{strValue}</span>
          </div>
        )}

        {field.hint && <span className="text-[11px] text-[#737373]">{field.hint}</span>}
      </div>
    );
  };

  const renderListField = (field: CmsListFieldDef) => {
    const raw = getByPath(data, field.key);
    const items = Array.isArray(raw) ? (raw as Json[]) : [];
    return (
      <CmsListField
        key={field.key}
        field={field}
        items={items}
        onChange={(next) => update(field.key, next)}
        renderSubField={renderPrimitiveField}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP WEBSITE CONTENT PAGE SWITCHER HUB */}
      <div className="bg-white border border-[#E8E8E5] rounded-2xl p-2.5 shadow-xs space-y-2">
        <div className="flex items-center justify-between px-2.5 py-1 border-b border-[#E8E8E5]/70">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.16em] uppercase text-[#0B3D2B]">
              Website Content Hub
            </span>
            <span className="text-[10px] font-semibold text-[#737373]">· 8 Editable Pages</span>
          </div>
          <span className="text-[10px] text-[#737373] hidden sm:inline">
            Click any page tab to edit its content
          </span>
        </div>

        <div className="relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              hubScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
            }}
            title="Scroll pages left"
            className="w-7 h-7 rounded-lg border border-[#E8E8E5] bg-[#FAFAF8] hover:bg-[#0B3D2B] hover:text-white hover:border-[#0B3D2B] text-[#737373] flex items-center justify-center flex-shrink-0 transition-colors shadow-2xs"
          >
            <ChevronLeft size={14} />
          </button>

          <div
            ref={hubScrollRef}
            onWheel={(e) => {
              if (e.deltaY !== 0 && hubScrollRef.current) {
                hubScrollRef.current.scrollLeft += e.deltaY;
              }
            }}
            className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2 pt-0.5 flex-1 min-w-0"
          >
            {ALL_PAGE_KEYS.map((key) => {
              const pageMeta = CMS_PAGE_METAS[key];
              const isActive = key === pageKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onNavigate?.(key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold tracking-[0.02em] whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? "bg-[#0B3D2B] text-white shadow-sm ring-2 ring-[#0B3D2B]/10"
                      : "bg-[#FAFAF8] text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] border border-[#E8E8E5]"
                  }`}
                >
                  <span className={isActive ? "text-[#10B981]" : "text-[#737373]"}>
                    {getPageIcon(key)}
                  </span>
                  {pageMeta.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              hubScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });
            }}
            title="Scroll pages right"
            className="w-7 h-7 rounded-lg border border-[#E8E8E5] bg-[#FAFAF8] hover:bg-[#0B3D2B] hover:text-white hover:border-[#0B3D2B] text-[#737373] flex items-center justify-center flex-shrink-0 transition-colors shadow-2xs"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 2. PAGE HEADER & PRIMARY ACTION CONTROLS */}
      <PageHeader
        eyebrow="Website Content"
        title={CMS_PAGE_LABELS[pageKey]}
        subtitle={
          updatedAt
            ? `Published ${new Date(updatedAt).toLocaleDateString()} at ${new Date(
                updatedAt,
              ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${
                updatedBy ? ` · by ${updatedBy}` : ""
              }`
            : "Using default template content — publish to override live site."
        }
        action={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live Preview Button */}
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#E8E8E5] bg-white text-[12px] font-bold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors shadow-xs"
            >
              <Eye size={14} /> Live Preview
            </button>

            {/* Direct Link */}
            <a
              href={sitePath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#E8E8E5] bg-white text-[12px] font-bold text-[#737373] hover:text-[#0B3D2B] hover:border-[#0B3D2B] transition-colors shadow-xs"
            >
              View Page <ExternalLink size={13} />
            </a>

            {/* Reset Page */}
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-transparent text-[11px] font-semibold text-[#737373] hover:text-[#B85C5C] hover:bg-[#B85C5C]/10 transition-colors"
              title="Reset all sections on this page to defaults"
            >
              <RotateCcw size={12} /> Reset
            </button>

            {/* Primary Publish CTA */}
            <button
              type="button"
              onClick={save}
              disabled={loading || saving}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold tracking-[0.06em] uppercase transition-all shadow-md ${
                isDirty
                  ? "bg-[#10B981] text-white hover:bg-[#0B3D2B] scale-[1.02] ring-2 ring-[#10B981]/30"
                  : "bg-[#0B3D2B] text-white hover:bg-[#10B981]"
              } disabled:opacity-50`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isDirty ? "Publish Changes" : "Published"}
            </button>
          </div>
        }
      />

      {/* 3. STATUS ALERTS */}
      {status && (
        <div
          role="status"
          className={`flex items-center justify-between px-4 py-3 rounded-xl border text-[13px] font-medium transition-all ${
            status.kind === "ok"
              ? "bg-white text-[#0B3D2B] border-[#E8E8E5]"
              : "bg-[#F7F7F5] text-[#0B3D2B] border-[#0B3D2B]"
          }`}
        >
          <div className="flex items-center gap-2">
            {status.kind === "ok" ? <Check size={16} className="text-[#10B981]" /> : <X size={16} className="text-[#737373]" />}
            <span>{status.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 4. SECTION FILTER & QUICK NAVIGATION TOOLBAR */}
      {schema.length > 1 && (
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
          {/* Top Row: Search & Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-[#E8E8E5]/60">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black tracking-[0.1em] uppercase text-[#0B3D2B]">
                Page Sections
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0B3D2B]/8 text-[#0B3D2B] text-[10px] font-bold">
                {schema.length} sections
              </span>
              {selectedSection !== "all" && (
                <button
                  type="button"
                  onClick={() => setSelectedSection("all")}
                  className="text-[10px] font-bold text-[#10B981] hover:underline ml-1"
                >
                  (Show All)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0B0AA]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search fields, labels, text…"
                  className="w-full pl-8 pr-7 py-1.5 bg-[#FAFAF8] border border-[#E8E8E5] rounded-lg text-[12px] text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#B0B0AA] hover:text-[#0B3D2B]"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 text-[11px] font-semibold text-[#737373] flex-shrink-0">
                <button
                  type="button"
                  onClick={expandAllSections}
                  className="px-2 py-1 hover:bg-[#FAFAF8] rounded hover:text-[#10B981] transition-colors"
                  title="Expand all sections"
                >
                  Expand
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={collapseAllSections}
                  className="px-2 py-1 hover:bg-[#FAFAF8] rounded hover:text-[#10B981] transition-colors"
                  title="Collapse all sections"
                >
                  Collapse
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Scrollable Section Tabs with Left/Right arrows & Custom Scrollbar */}
          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sectionScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
              }}
              title="Scroll left"
              className="w-7 h-7 rounded-lg border border-[#E8E8E5] bg-[#FAFAF8] hover:bg-[#10B981] hover:text-white hover:border-[#10B981] text-[#737373] flex items-center justify-center flex-shrink-0 transition-colors shadow-2xs"
            >
              <ChevronLeft size={14} />
            </button>

            <div
              ref={sectionScrollRef}
              onWheel={(e) => {
                if (e.deltaY !== 0 && sectionScrollRef.current) {
                  sectionScrollRef.current.scrollLeft += e.deltaY;
                }
              }}
              className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2.5 pt-0.5 flex-1 min-w-0"
            >
              <button
                type="button"
                onClick={() => setSelectedSection("all")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.04em] uppercase transition-all whitespace-nowrap flex-shrink-0 ${
                  selectedSection === "all"
                    ? "bg-[#10B981] text-white shadow-xs"
                    : "bg-[#FAFAF8] text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] border border-[#E8E8E5]"
                }`}
              >
                All Sections ({schema.length})
              </button>

              {schema.map((group) => {
                const id = group.id || group.title;
                const isSelected = selectedSection === id;
                return (
                  <button
                    key={group.title}
                    type="button"
                    onClick={() => setSelectedSection(id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-[0.04em] uppercase transition-all whitespace-nowrap flex-shrink-0 ${
                      isSelected
                        ? "bg-[#10B981] text-white shadow-xs"
                        : "bg-[#FAFAF8] text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] border border-[#E8E8E5]"
                    }`}
                  >
                    <span className={isSelected ? "text-white" : "text-[#737373]"}>
                      {getSectionIcon(group.icon)}
                    </span>
                    {group.title}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                sectionScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });
              }}
              title="Scroll right"
              className="w-7 h-7 rounded-lg border border-[#E8E8E5] bg-[#FAFAF8] hover:bg-[#10B981] hover:text-white hover:border-[#10B981] text-[#737373] flex items-center justify-center flex-shrink-0 transition-colors shadow-2xs"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 5. CONTENT SECTIONS GRID */}
      {loading ? (
        <div className="bg-white border border-[#E8E8E5] rounded-2xl p-16 flex flex-col items-center justify-center gap-3 text-[13px] text-[#737373]">
          <Loader2 size={24} className="animate-spin text-[#10B981]" />
          <span className="font-bold">Loading website content…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredSchema.map((group) => {
            const isCollapsed = !!collapsedSections[group.title];
            return (
              <section
                key={group.title}
                className={`bg-white border rounded-2xl transition-all shadow-xs overflow-hidden ${
                  isCollapsed ? "border-[#E8E8E5]" : "border-[#10B981]/25 ring-1 ring-[#10B981]/5"
                }`}
              >
                {/* Section Header */}
                <div
                  onClick={() => toggleSectionCollapse(group.title)}
                  className="flex items-center justify-between px-5 sm:px-6 py-4 bg-white hover:bg-[#FAFAF8] cursor-pointer select-none border-b border-transparent data-[open=true]:border-[#E8E8E5]/70 transition-colors"
                  data-open={!isCollapsed}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#10B981]/10 text-[#10B981] flex items-center justify-center flex-shrink-0">
                      {getSectionIcon(group.icon)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[14px] font-black tracking-[0.06em] uppercase text-[#0B3D2B]">
                          {group.title}
                        </h2>
                        <span className="px-2 py-0.5 rounded-full bg-[#0B3D2B]/8 text-[#0B3D2B] text-[10px] font-bold">
                          {group.fields.length} {group.fields.length === 1 ? "field" : "fields"}
                        </span>
                      </div>
                      {group.description && (
                        <p className="text-[12px] text-[#737373] mt-0.5">{group.description}</p>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => resetSection(group)}
                      title="Reset this section to defaults"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors"
                    >
                      <RotateCcw size={11} /> Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse(group.title)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[#737373] hover:bg-[#F0F0ED] transition-colors"
                    >
                      {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </div>
                </div>

                {/* Section Body */}
                {!isCollapsed && (
                  <div className="p-5 sm:p-7 space-y-5 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {group.fields.map((field) => {
                        if (field.type === "list") {
                          return (
                            <div key={field.key} className="sm:col-span-2">
                              {renderListField(field)}
                            </div>
                          );
                        }
                        const isFullWidth =
                          field.type === "textarea" ||
                          field.type === "image" ||
                          field.key.includes("subtext") ||
                          field.key.includes("description");
                        const value = getByPath(data, field.key);
                        return (
                          <div
                            key={field.key}
                            className={isFullWidth ? "sm:col-span-2" : "sm:col-span-1"}
                          >
                            {renderPrimitiveField(
                              field,
                              value,
                              (v) => update(field.key, v),
                              field.key,
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {filteredSchema.length === 0 && (
            <div className="bg-white border border-dashed border-[#E8E8E5] rounded-2xl p-12 text-center">
              <Search size={24} className="mx-auto text-[#B0B0AA] mb-2" />
              <p className="text-[13px] font-bold text-[#0B3D2B]">No fields match your search</p>
              <p className="text-[11px] text-[#737373] mt-1 mb-4">
                Try searching for a different keyword or reset filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSection("all");
                }}
                className="px-4 py-2 rounded-full bg-[#10B981] text-white text-[12px] font-bold uppercase tracking-[0.04em]"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* 6. FLOATING STICKY ACTION BAR (When Unsaved Changes Exist) */}
      {isDirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#0B3D2B] text-white px-5 py-3 rounded-full shadow-2xl border border-white/20 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[12px] font-bold">Unsaved changes on {meta.label}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              className="px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#10B981] text-white text-[11px] font-bold uppercase tracking-[0.04em] hover:bg-white hover:text-[#0B3D2B] transition-colors shadow-xs"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Publish (Ctrl+S)
            </button>
          </div>
        </div>
      )}

      {/* 7. LIVE RESPONSIVE PREVIEW MODAL */}
      <CmsLivePreview
        sitePath={sitePath}
        pageTitle={meta.label}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      {/* 8. RESET CONFIRMATION MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E8E8E5]">
            <div className="w-10 h-10 rounded-full bg-[#B85C5C]/10 text-[#B85C5C] flex items-center justify-center mb-3">
              <RotateCcw size={18} />
            </div>
            <h3 className="text-[16px] font-black text-[#0B3D2B] tracking-tight">
              Reset {meta.label} to default content?
            </h3>
            <p className="text-[13px] text-[#737373] mt-2 mb-6 leading-relaxed">
              This will replace all fields on this page with the default template values. You can review the values before publishing.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 rounded-full border border-[#E8E8E5] text-[12px] font-bold text-[#737373] hover:text-[#0B3D2B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetAllToDefaults}
                className="px-5 py-2 rounded-full bg-[#B85C5C] text-white text-[12px] font-bold uppercase tracking-[0.04em] hover:bg-[#8B0000] transition-colors shadow-xs"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
