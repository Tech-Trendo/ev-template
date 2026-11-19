import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Save,
  Send,
  ExternalLink,
  Trash2,
  Loader2,
  Newspaper,
  Calendar,
  User,
  Tag,
  Folder,
  Globe,
  Share2,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  X,
  Upload,
  Image as ImageIcon,
  Settings,
  Flame,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import RichTextEditor, { isEmptyRichHtml } from "./RichTextEditor";
import { Modal, useToast } from "./crm/ui";
import {
  fetchStory,
  fetchStoryCategories,
  publishStory,
  unpublishStory,
  slugifyTitle,
  formatStoryDate,
  type StoryStatus,
} from "@/lib/stories";

type UserRow = { id: number; username: string; first_name: string; last_name: string };

function userLabel(u: UserRow): string {
  const full = `${u.first_name} ${u.last_name}`.trim();
  return full ? `${full} (${u.username})` : u.username;
}

type FormState = {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  author: string;
  author_role: string;
  author_bio: string;
  published_date: string;
  status: StoryStatus;
  image_url: string;
  alt_text: string;
  content: string;
  tagsCsv: string;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  is_featured: boolean;
  sort_order: number;
};

const EMPTY_FORM = (category = "Fleet Story"): FormState => ({
  title: "",
  slug: "",
  category,
  excerpt: "",
  author: "",
  author_role: "",
  author_bio: "",
  published_date: new Date().toISOString().slice(0, 10),
  status: "draft",
  image_url: "",
  alt_text: "",
  content: "",
  tagsCsv: "",
  seo_title: "",
  seo_description: "",
  og_image_url: "",
  is_featured: false,
  sort_order: 0,
});

const POPULAR_TAGS = [
  "Electric Trucks",
  "Kathmandu",
  "Cargo 10T",
  "Mountain Logistics",
  "Battery Tech",
  "Charging",
  "Fleet Operations",
  "Customer Story",
  "Green Transport",
];

export default function StoriesEditor({
  storyId,
  onNavigate,
  defaultCategory = "Fleet Story",
  basePath,
}: {
  storyId: string;
  onNavigate: (p: string) => void;
  /** Category pre-filled for new stories (e.g. "Servicing" in the Stories section). */
  defaultCategory?: string;
  /** Admin route prefix for back navigation ("stories" | "servicing-stories"). */
  basePath?: string;
}) {
  const basePathResolved = basePath ?? "stories";
  const isNew = storyId === "new";
  const [form, setForm] = useState<FormState>(() => EMPTY_FORM(defaultCategory));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [existingImageDisplay, setExistingImageDisplay] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [status, setStatus] = useState<StoryStatus>("draft");
  const [savedSlug, setSavedSlug] = useState("");
  const [activeTab, setActiveTab] = useState<"settings" | "media" | "seo">("settings");
  const [tagInput, setTagInput] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showAuthorOverride, setShowAuthorOverride] = useState(false);
  const [mediaUploadTab, setMediaUploadTab] = useState<"upload" | "url">("upload");

  const toast = useToast();
  const loadedRef = useRef<number | null>(null);

  useEffect(() => {
    api<UserRow[]>("/api/users/")
      .then((us) => {
        setUsers(us);
        if (isNew && us.length > 0) {
          const me =
            us.find(
              (u) =>
                u.username.toLowerCase() ===
                (localStorage.getItem("vt_username") ?? "").toLowerCase(),
            ) ?? us[0];
          setForm((f) => ({ ...f, author: String(me.id) }));
        }
      })
      .catch(() => undefined);
    fetchStoryCategories()
      .then((cats) => {
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isNew || loadedRef.current === Number(storyId)) return;
    setLoading(true);
    loadedRef.current = Number(storyId);
    fetchStory(storyId)
      .then((s) => {
        setForm({
          title: s.title,
          slug: s.slug,
          category: s.category || defaultCategory,
          excerpt: s.excerpt || "",
          author: s.author ? String(s.author) : "",
          author_role: s.author_role || "",
          author_bio: s.author_bio || "",
          published_date: s.published_date || new Date().toISOString().slice(0, 10),
          status: s.status,
          image_url: s.image_url || "",
          alt_text: s.alt_text || "",
          content: s.content || "",
          tagsCsv: (s.tags_display ?? []).map((t) => t.name).join(", "),
          seo_title: s.seo_title || "",
          seo_description: s.seo_description || "",
          og_image_url: s.og_image_url || "",
          is_featured: s.is_featured,
          sort_order: s.sort_order || 0,
        });
        setStatus(s.status);
        setSavedSlug(s.slug);
        setSlugTouched(true);
        setExistingImageDisplay(s.image_display || "");
        if (s.author_role || s.author_bio) setShowAuthorOverride(true);
        if (s.image_url && !s.image) setMediaUploadTab("url");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load story"))
      .finally(() => setLoading(false));
  }, [storyId, isNew]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const setTitle = (title: string) => {
    setForm((f) => ({
      ...f,
      title,
      slug: slugTouched ? f.slug : slugifyTitle(title),
    }));
  };

  // Tags handling
  const currentTags = useMemo(() => {
    return form.tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }, [form.tagsCsv]);

  const addTag = (tag: string) => {
    const clean = tag.trim().replace(/,/g, "");
    if (!clean) return;
    if (currentTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTagInput("");
      return;
    }
    const updated = [...currentTags, clean].join(", ");
    patch({ tagsCsv: updated });
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    const updated = currentTags.filter((t) => t !== tagToRemove).join(", ");
    patch({ tagsCsv: updated });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  };

  const buildBody = (): FormData | string => {
    const tags = currentTags;

    const base: Record<string, unknown> = {
      title: form.title,
      slug: form.slug,
      category: form.category,
      excerpt: form.excerpt,
      author: form.author || null,
      author_role: form.author_role,
      author_bio: form.author_bio,
      published_date: form.published_date,
      status: form.status,
      content: form.content,
      alt_text: form.alt_text,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      og_image_url: form.og_image_url,
      image_url: imageFile ? "" : form.image_url,
      is_featured: form.is_featured,
      sort_order: form.sort_order,
      tags,
    };

    if (!imageFile && !ogImageFile) return JSON.stringify(base);

    const fd = new FormData();
    Object.entries(base).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((item) => fd.append(k, String(item)));
      else fd.append(k, String(v));
    });
    if (imageFile) fd.append("image", imageFile);
    if (ogImageFile) fd.append("og_image", ogImageFile);
    return fd;
  };

  const save = async (nextStatus?: StoryStatus) => {
    setError("");
    if (!form.title.trim()) {
      setError("Please add a title for the story before saving.");
      return;
    }
    if (isEmptyRichHtml(form.content)) {
      setError("Please write some story content before saving.");
      return;
    }
    const effectiveStatus = nextStatus ?? status;
    setForm((f) => ({ ...f, status: effectiveStatus }));
    setBusy(true);
    try {
      const body = buildBodyWithStatus(effectiveStatus);
      if (isNew) {
        const created = await api<{ id: number; slug: string }>("/api/stories/", {
          method: "POST",
          body,
        });
        toast.push(nextStatus === "published" ? "Story published!" : "Draft saved successfully");
        onNavigate(`${basePathResolved}/${created.id}`);
      } else {
        await api(`/api/stories/${storyId}/`, { method: "PATCH", body });
        setStatus(effectiveStatus);
        toast.push(
          nextStatus === "published"
            ? "Story published successfully"
            : nextStatus === "draft"
              ? "Story reverted to draft"
              : "Story changes saved",
        );
        if (effectiveStatus !== "draft" || status !== "draft") load_Refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save story");
    } finally {
      setBusy(false);
    }
  };

  const buildBodyWithStatus = (s: StoryStatus): FormData | string => {
    const prev = form.status;
    form.status = s;
    try {
      return buildBody();
    } finally {
      form.status = prev;
    }
  };

  const load_Refresh = () => {
    fetchStory(storyId)
      .then((s) => {
        setStatus(s.status);
        setSavedSlug(s.slug);
        setExistingImageDisplay(s.image_display || "");
      })
      .catch(() => undefined);
  };

  const togglePublish = async () => {
    setBusy(true);
    try {
      if (status === "published") {
        await unpublishStory(Number(storyId));
        setStatus("draft");
        patch({ status: "draft" });
        toast.push("Story unpublished (back to draft)");
      } else {
        await publishStory(Number(storyId));
        setStatus("published");
        patch({ status: "published" });
        toast.push("Story published successfully");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await api(`/api/stories/${storyId}/`, { method: "DELETE" });
      toast.push("Story deleted");
      onNavigate(basePathResolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const publicBase = basePathResolved === "servicing-stories" ? "/stories" : "/blog";

  const preview = () => {
    const slug = savedSlug || form.slug;
    if (!slug) {
      setError("Please save the story first to generate a preview link.");
      return;
    }
    window.open(`${publicBase}/${slug}?all=1`, "_blank");
  };

  const copyPublicUrl = () => {
    const slug = form.slug || savedSlug;
    if (!slug) return;
    const url = `${window.location.origin}${publicBase}/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    toast.push("Public story URL copied to clipboard");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-[#737373] gap-3">
        <Loader2 size={24} className="animate-spin text-[#00AAEB]" />
        <span className="text-[14px] font-medium">Loading story details…</span>
      </div>
    );
  }

  const imagePreview = imageFile
    ? URL.createObjectURL(imageFile)
    : form.image_url || existingImageDisplay;

  const publicUrl = `${publicBase}/${form.slug || "your-story-slug"}`;

  return (
    <div className="max-w-[1400px] mx-auto pb-16">
      {/* Top Action Header Bar */}
      <div className="sticky top-0 z-30 -mt-8 pt-6 pb-4 bg-[#F7F7F5]/90 backdrop-blur-md mb-6 border-b border-[#E8E8E5]/70">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Back button & Breadcrumbs */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => onNavigate(basePathResolved)}
              className="w-9 h-9 border border-[#E8E8E5] bg-white rounded-xl flex items-center justify-center text-[#04314A] hover:bg-[#04314A] hover:text-white transition-all shadow-xs shrink-0"
              title="Back to stories list"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#737373] mb-0.5">
                <button
                  onClick={() => onNavigate(basePathResolved)}
                  className="hover:text-[#00AAEB] transition-colors"
                >
                  {basePathResolved === "servicing-stories" ? "Stories" : "Blog"}
                </button>
                <span>/</span>
                <span className="text-[#04314A] font-bold truncate max-w-[200px] sm:max-w-[320px]">
                  {form.title ? form.title : isNew ? "Create New Story" : "Untitled"}
                </span>
                <span className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${
                  status === "published" ? "text-[#00AAEB]" : "text-[#737373]"
                }`}>
                  {status}
                </span>
              </div>
              <h1 className="text-[20px] sm:text-[22px] font-black tracking-tight text-[#04314A] leading-none truncate">
                {isNew ? "Create Story" : "Story Editor"}
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isNew && (
              <>
                <button
                  type="button"
                  onClick={preview}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#04314A] hover:border-[#00AAEB] hover:text-[#00AAEB] shadow-xs transition-colors"
                  title="Preview story in public layout"
                >
                  <ExternalLink size={14} /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(true)}
                  className="w-9 h-9 bg-white border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center hover:bg-rose-600 hover:text-white shadow-xs transition-colors"
                  title="Delete this story"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}

            {/* Save / Publish buttons */}
            <button
              type="button"
              onClick={() => save(status === "published" ? undefined : "draft")}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-[#04314A]/20 text-[#04314A] rounded-xl text-[12px] font-bold hover:bg-[#04314A] hover:text-white shadow-xs transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {status === "published" ? "Save Changes" : "Save Draft"}
            </button>

            {status !== "published" ? (
              <button
                type="button"
                onClick={() => save("published")}
                disabled={busy}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#00AAEB] text-white rounded-xl text-[12px] font-bold hover:bg-[#04314A] shadow-sm transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Publish Now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => save("published")}
                disabled={busy}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#04314A] text-white rounded-xl text-[12px] font-bold hover:bg-[#00AAEB] shadow-sm transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Update Story
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-[13px] text-rose-800 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
          <button
            onClick={() => setError("")}
            className="text-rose-500 hover:text-rose-800 p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* MAIN DOCUMENT CANVAS */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white border border-[#E8E8E5] rounded-2xl shadow-xs overflow-hidden">
            {/* Optional Cover Banner Preview */}
            {imagePreview && (
              <div className="relative w-full h-48 sm:h-64 bg-slate-100 border-b border-[#E8E8E5] group overflow-hidden">
                <img
                  src={imagePreview}
                  alt={form.alt_text || form.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-4">
                  <span className="text-white text-[12px] font-medium bg-black/40 backdrop-blur-md px-3 py-1 rounded-lg">
                    Cover Image
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("media")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-[#04314A] hover:bg-white text-[11px] font-bold shadow-md transition-colors"
                  >
                    <ImageIcon size={13} /> Change Cover
                  </button>
                </div>
              </div>
            )}

            {/* Document Header (Title + Excerpt) */}
            <div className="p-6 sm:p-8 pb-4">
              {/* Category Pill Tag */}
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 text-[#00AAEB] text-[11px] font-semibold uppercase tracking-wider">
                  <Folder size={12} /> {form.category || "General"}
                </span>
                {form.is_featured && (
                  <span className="inline-flex items-center gap-1 text-[#04314A] text-[11px] font-semibold uppercase tracking-wider">
                    <Flame size={12} className="text-[#00AAEB]" /> Featured
                  </span>
                )}
              </div>

              {/* Title Input */}
              <textarea
                rows={2}
                value={form.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Story Title…"
                className="w-full text-[24px] sm:text-[32px] font-black tracking-tight text-[#04314A] placeholder:text-[#04314A]/25 border-0 focus:outline-none focus:ring-0 p-0 resize-none leading-tight"
              />

              {/* Excerpt / Lead deck */}
              <textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => patch({ excerpt: e.target.value })}
                placeholder="Write a captivating excerpt or summary for this story (shown on cards and social previews)…"
                className="w-full text-[15px] sm:text-[16px] text-[#555] italic font-normal border-0 focus:outline-none focus:ring-0 p-0 mt-2 resize-none leading-relaxed placeholder:text-[#A0A09A] placeholder:not-italic"
              />
            </div>

            <div className="h-px bg-[#E8E8E5] mx-6 sm:mx-8 mb-4" />

            {/* Rich Text Editor */}
            <div className="p-2 sm:p-4 pt-0">
              <RichTextEditor
                value={form.content}
                resetKey={storyId}
                placeholder="Start writing the story body… Click toolbar icons to format headings, add blockquotes, insert images, tables and links."
                onChange={(html) => patch({ content: html })}
              />
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">
          {/* Segmented Sidebar Tabs */}
          <div className="flex bg-white border border-[#E8E8E5] rounded-xl p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold rounded-lg transition-all ${
                activeTab === "settings"
                  ? "bg-[#04314A] text-white shadow-xs"
                  : "text-[#737373] hover:text-[#04314A]"
              }`}
            >
              <Settings size={14} /> Settings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("media")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold rounded-lg transition-all ${
                activeTab === "media"
                  ? "bg-[#04314A] text-white shadow-xs"
                  : "text-[#737373] hover:text-[#04314A]"
              }`}
            >
              <ImageIcon size={14} /> Media
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("seo")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-bold rounded-lg transition-all ${
                activeTab === "seo"
                  ? "bg-[#04314A] text-white shadow-xs"
                  : "text-[#737373] hover:text-[#04314A]"
              }`}
            >
              <Globe size={14} /> SEO & Social
            </button>
          </div>

          {/* TAB 1: STORY SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Publishing & Visibility */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Calendar size={14} className="text-[#00AAEB]" /> Publishing
                  </h3>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      status === "published"
                        ? "text-[#00AAEB]"
                        : "text-[#737373]"
                    }`}
                  >
                    {status}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                      Status
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => patch({ status: e.target.value as StoryStatus })}
                      className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-[#04314A] focus:outline-none focus:border-[#00AAEB] cursor-pointer"
                    >
                      <option value="draft">Draft (Private)</option>
                      <option value="published">Published (Public)</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">
                        Published Date
                      </label>
                      <button
                        type="button"
                        onClick={() => patch({ published_date: new Date().toISOString().slice(0, 10) })}
                        className="text-[10px] font-bold text-[#00AAEB] hover:underline"
                      >
                        Set to Today
                      </button>
                    </div>
                    <input
                      type="date"
                      value={form.published_date}
                      onChange={(e) => patch({ published_date: e.target.value })}
                      className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                      Author
                    </label>
                    <div className="relative">
                      <select
                        value={form.author}
                        onChange={(e) => patch({ author: e.target.value })}
                        className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB] cursor-pointer"
                      >
                        <option value="">(Current User)</option>
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {userLabel(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Featured story toggle */}
                  <label className="flex items-center justify-between p-3 bg-[#FAFAF8] border border-[#E8E8E5] rounded-xl cursor-pointer select-none hover:bg-[#F0F0ED] transition-colors">
                    <div>
                      <span className="text-[12px] font-bold text-[#04314A] block">
                        Featured Story
                      </span>
                      <span className="text-[10px] text-[#737373]">
                        Highlight on homepage & story hero
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.is_featured}
                      onChange={(e) => patch({ is_featured: e.target.checked })}
                      className="w-4 h-4 rounded text-[#00AAEB] focus:ring-[#00AAEB]"
                    />
                  </label>
                </div>
              </div>

              {/* Taxonomy (Category & Tags) */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Tag size={14} className="text-[#00AAEB]" /> Taxonomy
                  </h3>
                </div>

                {/* Category */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1.5">
                    Category
                  </label>
                  {/* Preset category chips */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {categories.slice(0, 5).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => patch({ category: cat })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          form.category.toLowerCase() === cat.toLowerCase()
                            ? "bg-[#04314A] text-white"
                            : "bg-[#F0F0ED] text-[#04314A] hover:bg-[#E8E8E5]"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    value={form.category}
                    onChange={(e) => patch({ category: e.target.value })}
                    placeholder="Enter or select category…"
                    list="category-suggestions"
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                  />
                  <datalist id="category-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                {/* Tags Chip Input */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1.5">
                    Tags ({currentTags.length})
                  </label>
                  <div className="border border-[#E8E8E5] rounded-xl bg-white p-2 min-h-[44px] flex flex-wrap items-center gap-1.5 focus-within:border-[#00AAEB] transition-colors">
                    {currentTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-[#00AAEB]/10 text-[#00AAEB] px-2.5 py-0.5 rounded-lg text-[11px] font-bold"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-red-600 transition-colors ml-0.5"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => tagInput.trim() && addTag(tagInput)}
                      placeholder={currentTags.length === 0 ? "Type tag & hit enter…" : "Add more…"}
                      className="flex-1 min-w-[100px] border-0 text-[12px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none p-1"
                    />
                  </div>

                  {/* Popular tag suggestions */}
                  <div className="mt-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#A0A09A] block mb-1">
                      Quick Suggestions:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {POPULAR_TAGS.filter((pt) => !currentTags.includes(pt))
                        .slice(0, 5)
                        .map((pt) => (
                          <button
                            key={pt}
                            type="button"
                            onClick={() => addTag(pt)}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#F7F7F5] border border-[#E8E8E5] text-[#737373] hover:border-[#00AAEB] hover:text-[#00AAEB] transition-colors"
                          >
                            + {pt}
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* URL & Permalink */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Globe size={14} className="text-[#00AAEB]" /> Public Permalink
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setSlugTouched(false);
                      patch({ slug: slugifyTitle(form.title) });
                      toast.push("Slug regenerated from title");
                    }}
                    title="Regenerate slug from title"
                    className="text-[10px] font-bold text-[#00AAEB] hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Auto-Generate
                  </button>
                </div>

                {/* URL preview pill */}
                <div className="flex items-center justify-between bg-[#F7F7F5] border border-[#E8E8E5] rounded-xl px-3 py-2 text-[12px] text-[#04314A]">
                  <span className="truncate text-[11px] text-[#737373]">
                    {publicUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyPublicUrl}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#00AAEB] hover:text-[#04314A] ml-2 shrink-0"
                  >
                    {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                    {copiedUrl ? "Copied" : "Copy"}
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                    Custom Slug
                  </label>
                  <input
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      patch({ slug: slugifyTitle(e.target.value) });
                    }}
                    placeholder="custom-story-slug"
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                  />
                </div>
              </div>

              {/* Author Profile Overrides */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-3">
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setShowAuthorOverride(!showAuthorOverride)}
                >
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <User size={14} className="text-[#00AAEB]" /> Custom Author Info
                  </h3>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-[#00AAEB]"
                  >
                    {showAuthorOverride ? "Collapse" : "Edit"}
                  </button>
                </div>

                {showAuthorOverride && (
                  <div className="space-y-3 pt-2 border-t border-[#E8E8E5] animate-in fade-in">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                        Author Role / Job Title
                      </label>
                      <input
                        value={form.author_role}
                        onChange={(e) => patch({ author_role: e.target.value })}
                        placeholder="e.g. Field Operations Lead"
                        className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                        Author Bio Note
                      </label>
                      <textarea
                        rows={2}
                        value={form.author_bio}
                        onChange={(e) => patch({ author_bio: e.target.value })}
                        placeholder="Brief bio shown at the footer of the story…"
                        className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB] resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {!isNew && (
                <button
                  type="button"
                  onClick={togglePublish}
                  disabled={busy}
                  className="w-full py-3 bg-white border border-[#E8E8E5] hover:border-[#04314A] rounded-xl text-[12px] font-bold text-[#04314A] shadow-xs transition-colors"
                >
                  {status === "published"
                    ? "Unpublish (Move back to Draft)"
                    : `Publish Story (${formatStoryDate(form.published_date)})`}
                </button>
              )}
            </div>
          )}

          {/* TAB 2: MEDIA & COVER */}
          {activeTab === "media" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Featured Cover Image */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <ImageIcon size={14} className="text-[#00AAEB]" /> Featured Image
                  </h3>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setExistingImageDisplay("");
                        patch({ image_url: "" });
                      }}
                      className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>

                {/* Preview Thumbnail */}
                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-[#E8E8E5] shadow-xs group aspect-video bg-slate-100">
                    <img
                      src={imagePreview}
                      alt={form.alt_text || "Featured image preview"}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="text-white text-[12px] font-bold bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur-xs">
                        Featured Cover
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-[#F7F7F5] border-2 border-dashed border-[#E8E8E5] rounded-xl flex flex-col items-center justify-center text-[#B0B0AA] gap-2 p-6 text-center">
                    <Newspaper size={28} strokeWidth={1.2} />
                    <span className="text-[12px] font-semibold text-[#737373]">
                      No featured image selected
                    </span>
                    <span className="text-[10px] text-[#A0A09A]">
                      Upload a cover image to make your story stand out
                    </span>
                  </div>
                )}

                {/* Tab selector for upload vs url */}
                <div className="flex bg-[#F7F7F5] p-1 rounded-xl border border-[#E8E8E5]">
                  <button
                    type="button"
                    onClick={() => setMediaUploadTab("upload")}
                    className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                      mediaUploadTab === "upload"
                        ? "bg-white text-[#04314A] shadow-xs"
                        : "text-[#737373]"
                    }`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaUploadTab("url")}
                    className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
                      mediaUploadTab === "url"
                        ? "bg-white text-[#04314A] shadow-xs"
                        : "text-[#737373]"
                    }`}
                  >
                    Image URL
                  </button>
                </div>

                {mediaUploadTab === "upload" ? (
                  <div>
                    <input
                      type="file"
                      id="sidebar-image-upload"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setImageFile(f);
                          patch({ image_url: "" });
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="sidebar-image-upload"
                      className="flex flex-col items-center justify-center p-4 border border-dashed border-[#D0D0CB] hover:border-[#00AAEB] bg-white rounded-xl cursor-pointer text-center transition-colors"
                    >
                      <Upload size={20} className="text-[#00AAEB] mb-1" />
                      <span className="text-[12px] font-bold text-[#04314A]">
                        {imageFile ? imageFile.name : "Choose an image file"}
                      </span>
                      <span className="text-[10px] text-[#A0A09A] mt-0.5">
                        JPG, PNG, WebP up to 10MB
                      </span>
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                      Direct Image URL
                    </label>
                    <input
                      value={form.image_url}
                      onChange={(e) => {
                        setImageFile(null);
                        patch({ image_url: e.target.value });
                      }}
                      placeholder="https://images.unsplash.com/..."
                      className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                    />
                  </div>
                )}

                {/* Alt text */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                    Image Alt Text (Accessibility & SEO)
                  </label>
                  <input
                    value={form.alt_text}
                    onChange={(e) => patch({ alt_text: e.target.value })}
                    placeholder="e.g. VT Cargo 10T truck on a highway"
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                  />
                </div>
              </div>

              {/* Social / Open Graph Image */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Share2 size={14} className="text-[#00AAEB]" /> Social / OG Image
                  </h3>
                </div>

                <p className="text-[11px] text-[#737373]">
                  By default, the featured image above is used for social media embeds. You can also specify a custom social sharing card below.
                </p>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-1">
                    Custom Social Image URL
                  </label>
                  <input
                    value={form.og_image_url}
                    onChange={(e) => patch({ og_image_url: e.target.value })}
                    placeholder="Defaults to featured image"
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                  />
                </div>

                <div>
                  <input
                    type="file"
                    id="sidebar-og-upload"
                    accept="image/*"
                    onChange={(e) => setOgImageFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="sidebar-og-upload"
                    className="flex items-center justify-center gap-2 py-2 px-3 border border-[#E8E8E5] rounded-xl text-[11px] font-semibold text-[#04314A] hover:bg-[#F7F7F5] cursor-pointer transition-colors"
                  >
                    <Upload size={13} /> {ogImageFile ? ogImageFile.name : "…or upload custom social image"}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SEO & SOCIAL PREVIEW */}
          {activeTab === "seo" && (
            <div className="space-y-4 animate-in fade-in">
              {/* Google Search Result Preview */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Globe size={14} className="text-[#00AAEB]" /> Google Search Snippet
                  </h3>
                  <span className="text-[10px] font-medium text-[#737373]">Live Preview</span>
                </div>

                {/* Google SERP Card Mockup */}
                <div className="bg-[#F8F9FA] p-3.5 rounded-xl border border-[#E8E8E5] space-y-1 font-sans">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#202124]">
                    <div className="w-4 h-4 rounded-full bg-[#04314A] text-white flex items-center justify-center text-[8px] font-bold">
                      F
                    </div>
                    <span className="text-[#202124] font-medium">Vehicle Template</span>
                    <span className="text-[#5f6368]">› stories › {form.slug || "story"}</span>
                  </div>
                  <h4 className="text-[15px] font-medium text-[#1a0dab] hover:underline cursor-pointer leading-snug line-clamp-1">
                    {form.seo_title || form.title || "First VT fleet crosses the Himalayas"}
                  </h4>
                  <p className="text-[12px] text-[#4d5156] line-clamp-2 leading-normal">
                    {form.seo_description ||
                      form.excerpt ||
                      "Read the latest fleet updates, technology breakthroughs, and commercial EV stories from Vehicle Template."}
                  </p>
                </div>
              </div>

              {/* SEO Title Input */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">
                      SEO Title
                    </label>
                    <span className="text-[10px] font-medium text-[#737373]">
                      {form.seo_title.length} / 60 chars
                    </span>
                  </div>
                  <input
                    value={form.seo_title}
                    maxLength={70}
                    onChange={(e) => patch({ seo_title: e.target.value })}
                    placeholder={form.title ? form.title : "Defaults to story title"}
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB]"
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => patch({ seo_title: form.title })}
                      className="text-[10px] font-bold text-[#00AAEB] hover:underline"
                    >
                      Copy story title
                    </button>
                  </div>
                </div>

                {/* SEO Description Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#737373]">
                      Meta Description
                    </label>
                    <span className="text-[10px] font-medium text-[#737373]">
                      {form.seo_description.length} / 160 chars
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={200}
                    value={form.seo_description}
                    onChange={(e) => patch({ seo_description: e.target.value })}
                    placeholder={form.excerpt ? form.excerpt : "Defaults to story excerpt…"}
                    className="w-full border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] focus:outline-none focus:border-[#00AAEB] resize-none"
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => patch({ seo_description: form.excerpt })}
                      className="text-[10px] font-bold text-[#00AAEB] hover:underline"
                    >
                      Copy story excerpt
                    </button>
                  </div>
                </div>
              </div>

              {/* Social Card Preview */}
              <div className="bg-white border border-[#E8E8E5] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E8E8E5]">
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-[#04314A] flex items-center gap-2">
                    <Share2 size={14} className="text-[#00AAEB]" /> Social Card Preview
                  </h3>
                  <span className="text-[10px] font-medium text-[#737373]">Facebook / LinkedIn</span>
                </div>

                <div className="rounded-xl border border-[#E8E8E5] overflow-hidden bg-white shadow-xs">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt=""
                      className="w-full h-32 object-cover border-b border-[#E8E8E5]"
                    />
                  ) : (
                    <div className="w-full h-24 bg-[#04314A] flex items-center justify-center text-white/50 text-[11px] font-semibold">
                      Vehicle Template Commercial EVs
                    </div>
                  )}
                  <div className="p-3 bg-[#F8FAFC]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#737373] block mb-0.5">
                      vehicletemplate.example.com
                    </span>
                    <h5 className="text-[12px] font-bold text-[#04314A] line-clamp-1 leading-snug">
                      {form.seo_title || form.title || "Story Title"}
                    </h5>
                    <p className="text-[11px] text-[#64748B] line-clamp-1 mt-0.5">
                      {form.seo_description || form.excerpt || "Read more at Vehicle Template."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleting && (
        <Modal title="Delete Story?" onClose={() => setDeleting(false)}>
          <div className="space-y-4">
            <p className="text-[13px] text-[#737373] leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-bold text-[#04314A]">&ldquo;{form.title}&rdquo;</span>?
              This action cannot be undone and will remove the story from the live website.
            </p>
            <div data-modal-actions className="flex gap-2.5 justify-end pt-3">
              <button
                type="button"
                onClick={() => setDeleting(false)}
                className="px-5 py-2.5 border border-[#E8E8E5] rounded-xl text-[12px] font-semibold text-[#737373] hover:border-[#04314A] hover:text-[#04314A] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteBusy}
                className="px-5 py-2.5 rounded-xl bg-[#B00020] text-white text-[12px] font-bold hover:bg-[#8B0000] transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {deleteBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deleteBusy ? "Deleting…" : "Delete Story"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}
