import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Truck,
  Eye,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Image as ImageIcon,
  Trash,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Pagination } from "./crm/ui";
import type {
  Vehicle,
  VehicleStat,
  VehicleFeature,
  VehicleGalleryImage,
  SpecificationGroup,
} from "@/lib/vehicles";

type VehicleFormData = Omit<Vehicle, "id" | "image_display" | "slug"> & {
  slug?: string;
  gallery: (VehicleGalleryImage & { _preview?: string })[];
};

const ICON_OPTIONS = [
  "battery",
  "zap",
  "mountain",
  "shield",
  "truck",
  "gauge",
  "cog",
  "wind",
  "layers",
  "award",
  "sparkles",
];

const EMPTY: VehicleFormData = {
  name: "",
  category: "",
  payload: "",
  range_km: "",
  battery: "CATL LFP",
  image: null,
  image_url: "",
  tag: "",
  alt_text: "",
  description: "",
  hero_heading: "",
  hero_description: "",
  primary_cta_label: "Request a Quote",
  secondary_cta_label: "Request a Quote",
  engineered_heading: "Engineered for the toughest routes",
  engineered_description: "",
  is_active: true,
  sort_order: 0,
  stats: [],
  features: [],
  gallery: [],
  specification_groups: [],
};

function AccordionSection({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#E8E8E5] rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-[#F7F7F5] hover:bg-[#F0F0ED] transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#0B3D2B]">{title}</span>
            {count !== undefined && (
              <span className="text-[11px] font-bold text-[#737373]">({count})</span>
            )}
          </div>
          {subtitle && <div className="text-[11px] text-[#737373] mt-0.5">{subtitle}</div>}
        </div>
        <div className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center bg-white text-[#0B3D2B]">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

function VehicleForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Vehicle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<VehicleFormData>(() => {
    if (initial) {
      return {
        name: initial.name,
        category: initial.category,
        payload: initial.payload,
        range_km: initial.range_km,
        battery: initial.battery,
        image: null,
        image_url: initial.image_url,
        tag: initial.tag,
        alt_text: initial.alt_text,
        description: initial.description,
        hero_heading: initial.hero_heading || "",
        hero_description: initial.hero_description || "",
        primary_cta_label: initial.primary_cta_label || "Request a Quote",
        secondary_cta_label: initial.secondary_cta_label || "Request a Quote",
        engineered_heading: initial.engineered_heading || "Engineered for the toughest routes",
        engineered_description: initial.engineered_description || "",
        is_active: initial.is_active,
        sort_order: initial.sort_order,
        slug: initial.slug,
        stats: initial.stats.map((s) => ({ ...s })),
        features: initial.features.map((f) => ({ ...f })),
        gallery: initial.gallery.map((g) => ({ ...g })),
        specification_groups: initial.specification_groups.map((grp) => ({
          ...grp,
          specifications: grp.specifications.map((s) => ({ ...s })),
        })),
      };
    }
    return { ...EMPTY, stats: [], features: [], gallery: [], specification_groups: [] };
  });

  const [file, setFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<Record<number, File>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const input =
    "w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2.5 text-[13px] font-medium text-[#0B3D2B] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#10B981] transition-colors";
  const label = "text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373] block mb-1.5";
  const textarea = `${input} resize-none`;

  const addStat = () =>
    setForm({
      ...form,
      stats: [...form.stats, { label: "", value: "", sort_order: form.stats.length + 1 }],
    });
  const updateStat = (i: number, patch: Partial<VehicleStat>) =>
    setForm({ ...form, stats: form.stats.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const removeStat = (i: number) =>
    setForm({ ...form, stats: form.stats.filter((_, idx) => idx !== i) });
  const moveStat = (i: number, dir: number) => {
    const n = [...form.stats];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    n.forEach((s, idx) => (s.sort_order = idx + 1));
    setForm({ ...form, stats: n });
  };

  const addFeature = () =>
    setForm({
      ...form,
      features: [
        ...form.features,
        { title: "", description: "", icon: "zap", sort_order: form.features.length + 1 },
      ],
    });
  const updateFeature = (i: number, patch: Partial<VehicleFeature>) =>
    setForm({ ...form, features: form.features.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const removeFeature = (i: number) =>
    setForm({ ...form, features: form.features.filter((_, idx) => idx !== i) });
  const moveFeature = (i: number, dir: number) => {
    const n = [...form.features];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    n.forEach((f, idx) => (f.sort_order = idx + 1));
    setForm({ ...form, features: n });
  };

  const addGallery = () =>
    setForm({
      ...form,
      gallery: [
        ...form.gallery,
        {
          image_url: "",
          image_display: "",
          alt_text: "",
          caption: "",
          sort_order: form.gallery.length + 1,
          _preview: "",
        },
      ],
    });
  const updateGallery = (i: number, patch: Partial<VehicleGalleryImage> & { _preview?: string }) => {
    setForm({ ...form, gallery: form.gallery.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) });
  };
  const removeGallery = (i: number) => {
    const n = form.gallery.filter((_, idx) => idx !== i);
    n.forEach((g, idx) => (g.sort_order = idx + 1));
    setForm({ ...form, gallery: n });
    const np = { ...galleryFiles };
    delete np[i];
    // reindex files
    const reindexed: Record<number, File> = {};
    Object.entries(np).forEach(([k, v]) => {
      const ki = Number(k);
      if (ki > i) reindexed[ki - 1] = v;
      else if (ki < i) reindexed[ki] = v;
    });
    setGalleryFiles(reindexed);
  };
  const moveGallery = (i: number, dir: number) => {
    const n = [...form.gallery];
    const j = i + dir;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    n.forEach((g, idx) => (g.sort_order = idx + 1));
    // also swap files
    const nf = { ...galleryFiles };
    const a = nf[i];
    const b = nf[j];
    if (a) nf[j] = a;
    else delete nf[j];
    if (b) nf[i] = b;
    else delete nf[i];
    setGalleryFiles(nf);
    setForm({ ...form, gallery: n });
  };
  const handleGalleryFile = (i: number, file: File | null) => {
    if (file) {
      const preview = URL.createObjectURL(file);
      setGalleryFiles({ ...galleryFiles, [i]: file });
      updateGallery(i, { _preview: preview, image_url: "" });
    } else {
      const np = { ...galleryFiles };
      delete np[i];
      setGalleryFiles(np);
      updateGallery(i, { _preview: "" });
    }
  };

  const addSpecGroup = () =>
    setForm({
      ...form,
      specification_groups: [
        ...form.specification_groups,
        { title: "", sort_order: form.specification_groups.length + 1, specifications: [] },
      ],
    });
  const updateSpecGroup = (gi: number, patch: Partial<SpecificationGroup>) =>
    setForm({
      ...form,
      specification_groups: form.specification_groups.map((g, idx) => (idx === gi ? { ...g, ...patch } : g)),
    });
  const removeSpecGroup = (gi: number) =>
    setForm({ ...form, specification_groups: form.specification_groups.filter((_, idx) => idx !== gi) });
  const moveSpecGroup = (gi: number, dir: number) => {
    const n = [...form.specification_groups];
    const j = gi + dir;
    if (j < 0 || j >= n.length) return;
    [n[gi], n[j]] = [n[j], n[gi]];
    n.forEach((g, idx) => (g.sort_order = idx + 1));
    setForm({ ...form, specification_groups: n });
  };
  const addSpec = (gi: number) =>
    setForm({
      ...form,
      specification_groups: form.specification_groups.map((g, idx) =>
        idx === gi
          ? {
              ...g,
              specifications: [
                ...g.specifications,
                { label: "", value: "", sort_order: g.specifications.length + 1 },
              ],
            }
          : g,
      ),
    });
  const updateSpec = (gi: number, si: number, patch: { label?: string; value?: string }) =>
    setForm({
      ...form,
      specification_groups: form.specification_groups.map((g, idx) =>
        idx === gi
          ? {
              ...g,
              specifications: g.specifications.map((s, sidx) => (sidx === si ? { ...s, ...patch } : s)),
            }
          : g,
      ),
    });
  const removeSpec = (gi: number, si: number) =>
    setForm({
      ...form,
      specification_groups: form.specification_groups.map((g, idx) =>
        idx === gi ? { ...g, specifications: g.specifications.filter((_, sidx) => sidx !== si) } : g,
      ),
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.category.trim()) {
      setError("Name and Category are required");
      return;
    }
    setBusy(true);
    try {
      const hasFiles = !!file || Object.keys(galleryFiles).length > 0;
      let body: FormData | string;
      if (hasFiles) {
        const fd = new FormData();
        // basic fields
        fd.append("name", form.name);
        fd.append("category", form.category);
        fd.append("payload", form.payload || "");
        fd.append("range_km", form.range_km || "");
        fd.append("battery", form.battery || "");
        fd.append("tag", form.tag || "");
        fd.append("alt_text", form.alt_text || "");
        fd.append("description", form.description || "");
        fd.append("hero_heading", form.hero_heading || "");
        fd.append("hero_description", form.hero_description || "");
        fd.append("primary_cta_label", form.primary_cta_label || "Request a Quote");
        fd.append("secondary_cta_label", form.secondary_cta_label || "Request a Quote");
        fd.append("engineered_heading", form.engineered_heading || "Engineered for the toughest routes");
        fd.append("engineered_description", form.engineered_description || "");
        fd.append("is_active", String(form.is_active));
        fd.append("sort_order", String(form.sort_order));
        if (form.image_url) fd.append("image_url", form.image_url);
        if (file) fd.append("image", file);

        // stats
        const statsPayload = form.stats
          .filter((s) => s.label.trim() && s.value.trim())
          .map((s, i) => ({ label: s.label, value: s.value, sort_order: i + 1 }));
        fd.append("stats", JSON.stringify(statsPayload));

        // features
        const featuresPayload = form.features
          .filter((f) => f.title.trim())
          .map((f, i) => ({
            title: f.title,
            description: f.description,
            icon: f.icon || "sparkles",
            sort_order: i + 1,
          }));
        fd.append("features", JSON.stringify(featuresPayload));

        // gallery
        const galleryPayload = form.gallery.map((g, i) => ({
          image_url: galleryFiles[i] ? "" : g.image_url || "",
          alt_text: g.alt_text || "",
          caption: g.caption || "",
          sort_order: i + 1,
        }));
        fd.append("gallery", JSON.stringify(galleryPayload));
        Object.entries(galleryFiles).forEach(([idx, f]) => {
          fd.append(`gallery_${idx}_image`, f);
        });

        // spec groups
        const specGroupsPayload = form.specification_groups
          .filter((grp) => grp.title.trim())
          .map((grp, gi) => ({
            title: grp.title,
            sort_order: gi + 1,
            specifications: grp.specifications
              .filter((s) => s.label.trim())
              .map((s, si) => ({ label: s.label, value: s.value || "", sort_order: si + 1 })),
          }));
        fd.append("specification_groups", JSON.stringify(specGroupsPayload));

        body = fd;
      } else {
        const payload: Record<string, unknown> = {
          name: form.name,
          category: form.category,
          payload: form.payload || "",
          range_km: form.range_km || "",
          battery: form.battery || "",
          image_url: form.image_url || "",
          tag: form.tag || "",
          alt_text: form.alt_text || "",
          description: form.description || "",
          hero_heading: form.hero_heading || "",
          hero_description: form.hero_description || "",
          primary_cta_label: form.primary_cta_label || "Request a Quote",
          secondary_cta_label: form.secondary_cta_label || "Request a Quote",
          engineered_heading: form.engineered_heading || "Engineered for the toughest routes",
          engineered_description: form.engineered_description || "",
          is_active: form.is_active,
          sort_order: form.sort_order,
          stats: form.stats
            .filter((s) => s.label.trim() && s.value.trim())
            .map((s, i) => ({ label: s.label, value: s.value, sort_order: i + 1 })),
          features: form.features
            .filter((f) => f.title.trim())
            .map((f, i) => ({
              title: f.title,
              description: f.description,
              icon: f.icon || "sparkles",
              sort_order: i + 1,
            })),
          gallery: form.gallery.map((g, i) => ({
            image_url: g.image_url || "",
            alt_text: g.alt_text || "",
            caption: g.caption || "",
            sort_order: i + 1,
          })),
          specification_groups: form.specification_groups
            .filter((grp) => grp.title.trim())
            .map((grp, gi) => ({
              title: grp.title,
              sort_order: gi + 1,
              specifications: grp.specifications
                .filter((s) => s.label.trim())
                .map((s, si) => ({ label: s.label, value: s.value || "", sort_order: si + 1 })),
            })),
        };
        body = JSON.stringify(payload);
      }

      if (initial) {
        await api(`/api/vehicles/${initial.id}/`, { method: "PATCH", body });
      } else {
        await api("/api/vehicles/", { method: "POST", body });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-3">
      <form
        onSubmit={submit}
        encType="multipart/form-data"
        className="bg-[#F7F7F5] w-full max-w-[880px] border border-[#E8E8E5] rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-7 py-5 bg-white border-b border-[#E8E8E5] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-black tracking-tight text-[#0B3D2B]">
              {initial ? `Edit ${initial.name}` : "New Vehicle"}
            </h2>
            {form.slug && <p className="text-[11px] text-[#737373] mt-0.5">Slug: /model/{form.slug}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 border border-[#E8E8E5] rounded-xl flex items-center justify-center hover:bg-[#F7F7F5] transition-colors bg-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* BASIC INFO */}
          <AccordionSection title="Basic Information" subtitle="Core vehicle identity" defaultOpen count={undefined}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Name *</label>
                <input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cargo 6T" />
              </div>
              <div>
                <label className={label}>Category *</label>
                <input required className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Electric Light Truck" />
              </div>
              <div>
                <label className={label}>Tag / Badge</label>
                <input className={input} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="FLAGSHIP / Mountain King" />
              </div>
              <div>
                <label className={label}>Sort Order</label>
                <input type="number" className={input} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Description</label>
                <textarea rows={3} className={textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short marketing description" />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-[#10B981]" />
                  <span className="text-[12px] font-semibold text-[#0B3D2B]">Active / visible on site</span>
                </label>
              </div>
            </div>
          </AccordionSection>

          {/* MAIN IMAGE */}
          <AccordionSection title="Main Image" subtitle="Hero vehicle image" defaultOpen>
            <div className="space-y-4">
              <div>
                <label className={label}>Image URL</label>
                <input className={input} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className={label}>…or Upload Image File</label>
                <input ref={fileRef} type="file" accept="image/*" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <p className="text-[11px] text-[#10B981] mt-1">Selected: {file.name}</p>}
                {!file && initial?.image_display && (
                  <div className="mt-3 flex items-center gap-3">
                    <img src={initial.image_display} alt="" className="w-20 h-14 object-cover rounded-lg border border-[#E8E8E5] bg-white" />
                    <span className="text-[11px] text-[#737373]">Current image</span>
                  </div>
                )}
              </div>
              <div>
                <label className={label}>Alt Text</label>
                <input className={input} value={form.alt_text} onChange={(e) => setForm({ ...form, alt_text: e.target.value })} placeholder="VT Cargo 6T on mountain road" />
              </div>
              {/* Legacy fields kept for compatibility */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#F0F0ED]">
                <div>
                  <label className={label}>Payload (legacy)</label>
                  <input className={input} value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} placeholder="6 TON" />
                </div>
                <div>
                  <label className={label}>Range (legacy)</label>
                  <input className={input} value={form.range_km} onChange={(e) => setForm({ ...form, range_km: e.target.value })} placeholder="260 KM" />
                </div>
                <div>
                  <label className={label}>Battery (legacy)</label>
                  <input className={input} value={form.battery} onChange={(e) => setForm({ ...form, battery: e.target.value })} placeholder="CATL LFP" />
                </div>
              </div>
            </div>
          </AccordionSection>

          {/* HERO / MARKETING */}
          <AccordionSection title="Hero / Marketing Content" subtitle="Headlines and CTAs displayed in hero" count={undefined}>
            <div className="space-y-4">
              <div>
                <label className={label}>Hero Heading</label>
                <input className={input} value={form.hero_heading} onChange={(e) => setForm({ ...form, hero_heading: e.target.value })} placeholder="Mountain King" />
              </div>
              <div>
                <label className={label}>Hero Description</label>
                <textarea rows={2} className={textarea} value={form.hero_description} onChange={(e) => setForm({ ...form, hero_description: e.target.value })} placeholder="High torque, high capacity — built for the steepest commercial routes." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={label}>Primary CTA Label</label>
                  <input className={input} value={form.primary_cta_label} onChange={(e) => setForm({ ...form, primary_cta_label: e.target.value })} placeholder="Request a Quote" />
                </div>
                <div>
                  <label className={label}>Secondary CTA Label</label>
                  <input className={input} value={form.secondary_cta_label} onChange={(e) => setForm({ ...form, secondary_cta_label: e.target.value })} placeholder="Request a Quote" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 pt-3 border-t border-[#F0F0ED]">
                <div>
                  <label className={label}>Engineered Heading</label>
                  <input className={input} value={form.engineered_heading} onChange={(e) => setForm({ ...form, engineered_heading: e.target.value })} placeholder="Engineered for the toughest routes" />
                </div>
                <div>
                  <label className={label}>Engineered Description</label>
                  <textarea rows={2} className={textarea} value={form.engineered_description} onChange={(e) => setForm({ ...form, engineered_description: e.target.value })} placeholder="Describe engineering highlights for demanding roads..." />
                </div>
              </div>
            </div>
          </AccordionSection>

          {/* KEY STATISTICS */}
          <AccordionSection title="Key Statistics" subtitle="Stats shown below hero" count={form.stats.length} defaultOpen={form.stats.length > 0}>
            <div className="space-y-3">
              {form.stats.length === 0 && <p className="text-[12px] text-[#737373]">No statistics yet. Add stats like Payload, Range, Battery etc.</p>}
              {form.stats.map((s, i) => (
                <div key={i} className="flex gap-2 items-end bg-white border border-[#E8E8E5] rounded-xl p-3">
                  <div className="flex-1">
                    <label className={label}>Label</label>
                    <input className={input} value={s.label} onChange={(e) => updateStat(i, { label: e.target.value })} placeholder="Payload" />
                  </div>
                  <div className="flex-1">
                    <label className={label}>Value</label>
                    <input className={input} value={s.value} onChange={(e) => updateStat(i, { value: e.target.value })} placeholder="6 TON" />
                  </div>
                  <div className="flex gap-1 pb-1">
                    <button type="button" onClick={() => moveStat(i, -1)} className="w-8 h-8 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronUp size={13} /></button>
                    <button type="button" onClick={() => moveStat(i, 1)} className="w-8 h-8 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronDown size={13} /></button>
                    <button type="button" onClick={() => removeStat(i)} className="w-8 h-8 border border-[#E8E8E5] rounded-lg flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white"><Trash size={13} /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addStat} className="w-full py-2.5 border border-dashed border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors flex items-center justify-center gap-2 bg-white">
                <Plus size={14} /> Add Statistic
              </button>
            </div>
          </AccordionSection>

          {/* FEATURES */}
          <AccordionSection title="Vehicle Features" subtitle="Engineering cards" count={form.features.length} defaultOpen={form.features.length > 0}>
            <div className="space-y-3">
              {form.features.length === 0 && <p className="text-[12px] text-[#737373]">Add feature cards like High torque motor, Gradeability etc.</p>}
              {form.features.map((f, i) => (
                <div key={i} className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#737373] flex items-center gap-2"><GripVertical size={12} /> Feature {i + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveFeature(i, -1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronUp size={12} /></button>
                      <button type="button" onClick={() => moveFeature(i, 1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronDown size={12} /></button>
                      <button type="button" onClick={() => removeFeature(i)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white"><Trash size={12} /></button>
                    </div>
                  </div>
                  <div>
                    <label className={label}>Title *</label>
                    <input className={input} value={f.title} onChange={(e) => updateFeature(i, { title: e.target.value })} placeholder="High torque motor" />
                  </div>
                  <div>
                    <label className={label}>Description *</label>
                    <textarea rows={2} className={textarea} value={f.description} onChange={(e) => updateFeature(i, { description: e.target.value })} placeholder="18,000 Nm peak torque for demanding mountain routes." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Icon</label>
                      <select className={input} value={f.icon} onChange={(e) => updateFeature(i, { icon: e.target.value })}>
                        {ICON_OPTIONS.map((ic) => (
                          <option key={ic} value={ic}>{ic}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Preview</label>
                      <div className="h-[42px] border border-[#E8E8E5] rounded-xl bg-[#F7F7F5] flex items-center justify-center text-[11px] text-[#737373]">{f.icon || "sparkles"}</div>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addFeature} className="w-full py-2.5 border border-dashed border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors flex items-center justify-center gap-2 bg-white">
                <Plus size={14} /> Add Feature
              </button>
            </div>
          </AccordionSection>

          {/* GALLERY */}
          <AccordionSection title="Vehicle Gallery" subtitle="Multiple images" count={form.gallery.length} defaultOpen={form.gallery.length > 0}>
            <div className="space-y-3">
              {form.gallery.length === 0 && <p className="text-[12px] text-[#737373]">Add gallery images. Each supports Image URL or Upload.</p>}
              {form.gallery.map((g, i) => (
                <div key={i} className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#737373] flex items-center gap-2"><ImageIcon size={12} /> Image {i + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveGallery(i, -1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronUp size={12} /></button>
                      <button type="button" onClick={() => moveGallery(i, 1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronDown size={12} /></button>
                      <button type="button" onClick={() => removeGallery(i)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white"><Trash size={12} /></button>
                    </div>
                  </div>

                  {(g.image_display || g._preview || g.image_url) && (
                    <div className="w-full h-28 bg-[#F7F7F5] border border-[#E8E8E5] rounded-xl overflow-hidden flex items-center justify-center">
                      <img
                        src={g._preview || g.image_display || g.image_url}
                        alt={`gallery-${i}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div>
                    <label className={label}>Image URL</label>
                    <input className={input} value={g.image_url} onChange={(e) => updateGallery(i, { image_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div>
                    <label className={label}>…or Upload Image</label>
                    <input type="file" accept="image/*" className={input} onChange={(e) => handleGalleryFile(i, e.target.files?.[0] ?? null)} />
                  </div>
                </div>
              ))}
              <button type="button" onClick={addGallery} className="w-full py-2.5 border border-dashed border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors flex items-center justify-center gap-2 bg-white">
                <Plus size={14} /> Add Gallery Image
              </button>
            </div>
          </AccordionSection>

          {/* TECHNICAL SPECIFICATIONS */}
          <AccordionSection title="Technical Specifications" subtitle="Groups with label/value pairs" count={form.specification_groups.length} defaultOpen={form.specification_groups.length > 0}>
            <div className="space-y-4">
              {form.specification_groups.length === 0 && <p className="text-[12px] text-[#737373]">Create specification groups like Dimensions, Battery & Charging etc.</p>}
              {form.specification_groups.map((grp, gi) => (
                <div key={gi} className="bg-white border border-[#E8E8E5] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-[#0B3D2B]">Group {gi + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveSpecGroup(gi, -1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronUp size={12} /></button>
                      <button type="button" onClick={() => moveSpecGroup(gi, 1)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center hover:bg-[#F7F7F5]"><ChevronDown size={12} /></button>
                      <button type="button" onClick={() => removeSpecGroup(gi)} className="w-7 h-7 border border-[#E8E8E5] rounded-lg flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white"><Trash size={12} /></button>
                    </div>
                  </div>
                  <div>
                    <label className={label}>Group Title *</label>
                    <input className={input} value={grp.title} onChange={(e) => updateSpecGroup(gi, { title: e.target.value })} placeholder="Dimensions" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#737373]">Specifications</div>
                    {grp.specifications.map((s, si) => (
                      <div key={si} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <input className={input} value={s.label} onChange={(e) => updateSpec(gi, si, { label: e.target.value })} placeholder="Overall Length" />
                        </div>
                        <div className="flex-1">
                          <input className={input} value={s.value} onChange={(e) => updateSpec(gi, si, { value: e.target.value })} placeholder="5,995 mm" />
                        </div>
                        <button type="button" onClick={() => removeSpec(gi, si)} className="w-8 h-8 border border-[#E8E8E5] rounded-lg flex items-center justify-center text-[#737373] hover:bg-[#10B981] hover:text-white shrink-0"><X size={13} /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addSpec(gi)} className="w-full py-2 border border-dashed border-[#E8E8E5] rounded-lg text-[11px] font-semibold text-[#737373] hover:border-[#10B981] hover:text-[#10B981] bg-[#F7F7F5] flex items-center justify-center gap-1">
                      <Plus size={12} /> Add Specification
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addSpecGroup} className="w-full py-2.5 border border-dashed border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#0B3D2B] hover:border-[#10B981] hover:text-[#10B981] transition-colors flex items-center justify-center gap-2 bg-white">
                <Plus size={14} /> Add Specification Group
              </button>
            </div>
          </AccordionSection>
        </div>

        {error && (
          <div className="mx-5 mb-3 text-[12px] font-medium text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2 rounded-r-lg">{error}</div>
        )}

        <div className="flex gap-3 p-5 bg-white border-t border-[#E8E8E5] flex-shrink-0">
          <button type="submit" disabled={busy} className="flex-1 py-3.5 rounded-full bg-[#0B3D2B] text-white text-[13px] font-semibold tracking-[0.06em] hover:bg-[#10B981] transition-colors disabled:opacity-50">
            {busy ? "Saving…" : initial ? "Save Changes" : "Create Vehicle"}
          </button>
          <button type="button" onClick={onClose} className="px-8 py-3.5 border border-[#E8E8E5] rounded-full text-[13px] font-semibold text-[#737373] hover:border-[#0B3D2B] hover:text-[#0B3D2B] transition-colors bg-white">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const VEHICLES_PER_PAGE = 10;

export default function VehiclesManager() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const load = () => {
    setLoading(true);
    api<Vehicle[]>("/api/vehicles/?all=1")
      .then(setVehicles)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const pageCount = Math.ceil(vehicles.length / VEHICLES_PER_PAGE);
  const paginatedVehicles = vehicles.slice(page * VEHICLES_PER_PAGE, (page + 1) * VEHICLES_PER_PAGE);

  const remove = async (v: Vehicle) => {
    if (!window.confirm(`Delete ${v.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/vehicles/${v.id}/`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-[36px] font-black tracking-tight text-[#0B3D2B]">Vehicles.</h1>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#0B3D2B] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#10B981] transition-colors">
          <Plus size={14} /> Add Vehicle
        </button>
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#10B981] bg-[#10B981]/5 border-l-2 border-[#10B981] px-3 py-2">{error}</p>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[820px]">
          <thead>
            <tr className="border-b border-[#E8E8E5]">
              {["Vehicle", "Category", "Payload", "Range", "Order", "Status", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td></tr>
            ) : vehicles.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#737373]">No vehicles yet.</td></tr>
            ) : (
              paginatedVehicles.map((v) => (
                <tr key={v.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {v.image_display ? (
                        <img src={v.image_display} alt="" className="w-12 h-9 object-cover bg-[#F7F7F5] rounded-lg border border-[#E8E8E5]" />
                      ) : (
                        <div className="w-12 h-9 bg-[#F7F7F5] flex items-center justify-center rounded-lg border border-[#E8E8E5]"><Truck size={14} className="text-[#B0B0AA]" /></div>
                      )}
                      <div>
                        <div className="text-[13px] font-bold text-[#0B3D2B]">{v.name}</div>
                        <div className="flex items-center gap-1.5">
                          {v.tag && <div className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#10B981]">{v.tag}</div>}
                          <span className="text-[10px] text-[#B0B0AA]">/{v.slug}</span>
                        </div>
                        {v.stock_summary && v.stock_summary.total_units > 0 && (
                          <div className="text-[11px] text-[#737373] mt-1 font-medium">
                            <span className="text-[#0B3D2B] font-semibold">{v.stock_summary.in_stock} in stock</span>
                            {v.stock_summary.sold > 0 && <span> · {v.stock_summary.sold} sold</span>}
                            {v.stock_summary.in_servicing > 0 && <span> · {v.stock_summary.in_servicing} in service</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{v.category}</td>
                  <td className="px-5 py-3.5 text-[12px] font-medium text-[#0B3D2B]">{v.payload}</td>
                  <td className="px-5 py-3.5 text-[12px] font-medium text-[#0B3D2B]">{v.range_km}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373]">{v.sort_order}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${v.is_active ? "text-[#0B3D2B]" : "text-[#737373]"}`}>
                      {v.is_active ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/model/${v.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(`/model/${v.slug}`, "_blank");
                        }}
                        className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"
                        title="View"
                      >
                        <Eye size={13} />
                      </a>
                      <button onClick={() => setEditing(v)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#0B3D2B] hover:bg-[#0B3D2B] hover:text-white transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => remove(v)} className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#10B981] hover:bg-[#10B981] hover:text-white transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onPage={setPage} total={vehicles.length} />
      </div>

      {(creating || editing) && (
        <VehicleForm initial={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={load} />
      )}
    </div>
  );
}
