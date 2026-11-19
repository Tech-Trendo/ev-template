import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Eye, EyeOff, Newspaper, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  fetchStories,
  fetchStoryCategories,
  publishStory,
  unpublishStory,
  formatStoryDate,
  type StoryListItem,
} from "@/lib/stories";
import { Pagination, PageHeader, Modal, useToast } from "./crm/ui";

type UserRow = { id: number; username: string; first_name: string; last_name: string };

function userName(u?: UserRow | null): string {
  if (!u) return "—";
  const full = `${u.first_name} ${u.last_name}`.trim();
  return full || u.username;
}

export default function StoriesManager({
  onNavigate,
  initialCategory = "",
  lockedCategory = false,
  basePath = "stories",
  title,
  subtitle,
}: {
  onNavigate: (p: string) => void;
  /** Pre-filter the list (e.g. "Servicing" for the Stories section). */
  initialCategory?: string;
  /** Hide the category filter — every story here belongs to `initialCategory`. */
  lockedCategory?: boolean;
  /** Admin route prefix for create/edit navigation ("stories" | "servicing-stories"). */
  basePath?: string;
  /** Header title override (default "Blog."). */
  title?: string;
  /** Header subtitle override. */
  subtitle?: string;
}) {
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [author, setAuthor] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [deleting, setDeleting] = useState<StoryListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const toast = useToast();
  const firstRender = useRef(true);
  const publicBase = basePath === "servicing-stories" ? "/stories" : "/blog";

  const PER_PAGE = 10;

  const load = () => {
    setLoading(true);
    setError("");
    const params: Record<string, string> = { all: "1" };
    if (search.trim()) params.search = search.trim();
    if (status) params.status = status;
    if (category) params.category = category;
    if (author) params.author = author;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    fetchStories(params)
      .then(setStories)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api<UserRow[]>("/api/users/")
      .then(setUsers)
      .catch(() => undefined);
    fetchStoryCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  // Debounced search reloads from backend
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Non-search filters reload from backend (skipped on first render — covered above)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(0);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, author, dateFrom, dateTo]);

  const pageCount = Math.ceil(stories.length / PER_PAGE);
  const rows = useMemo(
    () => stories.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    [stories, page],
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const togglePublish = async (s: StoryListItem) => {
    try {
      if (s.status === "published") await unpublishStory(s.id);
      else await publishStory(s.id);
      toast.push(s.status === "published" ? "Story unpublished" : "Story published");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/stories/${deleting.id}/`, { method: "DELETE" });
      toast.push("Story deleted");
      setDeleting(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const input =
    "border border-[#E8E8E5] rounded-xl bg-white px-3 py-2 text-[12px] font-medium text-[#04314A] placeholder:text-[#B0B0AA] focus:outline-none focus:border-[#00AAEB] transition-colors";

  return (
    <div>
      <PageHeader
        eyebrow="Content Management"
        title={title ?? (lockedCategory ? `${initialCategory} Stories.` : "Blog.")}
        subtitle={
          subtitle ??
          (lockedCategory
            ? "Workshop reports, maintenance wins and after-sales field notes."
            : "Field reports, news and customer stories.")
        }
        action={
          <button
            onClick={() => onNavigate(`${basePath}/new`)}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#04314A] text-white text-[12px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00AAEB] transition-colors"
          >
            <Plus size={14} /> New Story
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, author…"
          className={`${input} w-56`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} cursor-pointer`}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        {lockedCategory ? (
          <span className="inline-block px-3 py-2 rounded-xl bg-[#04314A] text-white text-[11px] font-bold tracking-[0.1em] uppercase whitespace-nowrap">
            {initialCategory || category}
          </span>
        ) : (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${input} cursor-pointer`}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select value={author} onChange={(e) => setAuthor(e.target.value)} className={`${input} cursor-pointer`}>
          <option value="">All authors</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>{userName(u)}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={input} title="Published from" />
          <span className="text-[11px] text-[#737373]">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={input} title="Published to" />
        </div>
        {(search || status || (lockedCategory ? "" : category) || author || dateFrom || dateTo) !== "" && (
          <button
            onClick={() => {
              setSearch("");
              setStatus("");
              setCategory(initialCategory);
              setAuthor("");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-[11px] font-semibold text-[#00AAEB] hover:underline flex items-center gap-1 px-2"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 text-[13px] text-[#00AAEB] bg-[#00AAEB]/5 border-l-2 border-[#00AAEB] px-3 py-2">{error}</p>
      )}

      <div className="bg-white border border-[#E8E8E5] rounded-xl overflow-x-auto">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-[#E8E8E5]">
              {["Story", "Category", "Author", "Status", "Published", "Updated", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#737373]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#737373]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[13px] text-[#737373]">No stories match your filters.</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-b border-[#F0F0ED] last:border-0 hover:bg-[#FAFAF8]">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {s.image_display ? (
                        <img src={s.image_display} alt="" className="w-14 h-10 object-cover bg-[#F7F7F5]" />
                      ) : (
                        <div className="w-14 h-10 bg-[#F7F7F5] flex items-center justify-center rounded-lg"><Newspaper size={14} className="text-[#B0B0AA]" /></div>
                      )}
                      <div className="max-w-[320px]">
                        <div className="text-[13px] font-bold text-[#04314A] truncate">{s.title}</div>
                        <div className="text-[10px] text-[#B0B0AA] truncate">{publicBase}/{s.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {s.category ? (
                      <span className="text-[11px] font-semibold text-[#04314A] uppercase tracking-[0.04em] whitespace-nowrap">{s.category}</span>
                    ) : (
                      <span className="text-[12px] text-[#B0B0AA]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                    {userById.get(s.author ?? -1) ? userName(userById.get(s.author ?? -1)) : s.author_detail?.name || "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => togglePublish(s)}
                      title={s.status === "published" ? "Click to unpublish" : "Click to publish"}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] whitespace-nowrap transition-colors ${
                        s.status === "published"
                          ? "text-[#00AAEB] hover:text-[#04314A]"
                          : "text-[#737373] hover:text-[#00AAEB]"
                      }`}
                    >
                      {s.status === "published" ? <Eye size={12} /> : <EyeOff size={12} />}
                      {s.status === "published" ? "Live" : s.status}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">{formatStoryDate(s.published_date)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-[#737373] whitespace-nowrap">
                    {s.updated_at ? formatStoryDate(s.updated_at) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`${publicBase}/${s.slug}?all=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          window.open(`${publicBase}/${s.slug}?all=1`, "_blank");
                        }}
                        className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors"
                        title="View / Preview"
                      >
                        <ExternalLink size={13} />
                      </a>
                      <button
                        onClick={() => onNavigate(`${basePath}/${s.id}`)}
                        className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#04314A] hover:bg-[#04314A] hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleting(s)}
                        className="w-8 h-8 border border-[#E8E8E5] rounded-xl flex items-center justify-center text-[#00AAEB] hover:bg-[#00AAEB] hover:text-white transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onPage={setPage} total={stories.length} />
      </div>

      {/* Delete confirmation modal */}
      {deleting && (
        <Modal title="Delete Story?" onClose={() => setDeleting(null)}>
          <p className="text-[13px] text-[#737373] leading-relaxed mb-6">
            Are you sure you want to delete{" "}
            <span className="font-bold text-[#04314A]">&ldquo;{deleting.title}&rdquo;</span>?
            <br />
            This action cannot be undone.
          </p>
          <div data-modal-actions className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleting(null)}
              className="px-6 py-2.5 border border-[#E8E8E5] rounded-full text-[12px] font-semibold text-[#737373] hover:border-[#04314A] hover:text-[#04314A] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleteBusy}
              className="px-6 py-2.5 rounded-full bg-[#B00020] text-white text-[12px] font-semibold hover:bg-[#8B0000] transition-colors disabled:opacity-50"
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}

      {toast.node}
    </div>
  );
}
