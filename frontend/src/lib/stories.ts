import { api } from "./api";
import { normalizeLegacyLabels } from "./textNormalize";

export type StoryStatus = "draft" | "published" | "archived";

export type AuthorDetail = {
  id: number | null;
  name: string;
  role: string;
  bio: string;
  photo: string;
};

export type TagRef = { id: number; name: string; slug: string };

export type StoryListItem = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  image: string | null;
  image_url: string;
  image_display: string;
  alt_text: string;
  author: number | null;
  author_detail: AuthorDetail;
  published_date: string;
  status: StoryStatus;
  reading_time: number;
  reading_time_override: number | null;
  is_featured: boolean;
  tags: string[];
  updated_at?: string;
};

export type StoryNav = {
  title: string;
  slug: string;
  image_display: string;
} | null;

export type Story = StoryListItem & {
  content: string;
  author_role: string;
  author_bio: string;
  author_photo: string | null;
  author_photo_url: string;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  og_image: string | null;
  og_image_url: string;
  created_at: string;
  updated_at: string;
  tags_display: TagRef[];
  seo_image_display: string;
  previous?: StoryNav;
  next?: StoryNav;
};

export type PagedStories = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: StoryListItem[];
};

/** Category used to mark stories as servicing stories (case-insensitive match server-side). */
export const SERVICING_CATEGORY = "Servicing";

export function fetchStories(params?: Record<string, string | number>): Promise<StoryListItem[]> {
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return api<StoryListItem[]>(`/api/stories/${qs}`).then((rows) => normalizeLegacyLabels(rows));
}

export function fetchStoriesPaged(
  params?: Record<string, string | number>,
): Promise<PagedStories> {
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return api<PagedStories>(`/api/stories/${qs}`).then((page) => normalizeLegacyLabels(page));
}

export function fetchStory(slugOrId: string | number): Promise<Story> {
  return api<Story>(`/api/stories/${slugOrId}/?all=1`).then((story) => normalizeLegacyLabels(story));
}
export function fetchServicingStoriesPaged(
  params?: Record<string, string | number>,
): Promise<PagedStories> {
  return fetchStoriesPaged({ category: SERVICING_CATEGORY, ...params });
}

export function publishStory(id: number): Promise<{ id: number; status: StoryStatus }> {
  return api(`/api/stories/${id}/publish/`, { method: "POST" });
}

export function unpublishStory(id: number): Promise<{ id: number; status: StoryStatus }> {
  return api(`/api/stories/${id}/unpublish/`, { method: "POST" });
}

export function uploadStoryImage(file: File, alt?: string): Promise<{ url: string; alt: string }> {
  const fd = new FormData();
  fd.append("image", file);
  if (alt) fd.append("alt", alt);
  return api("/api/stories/upload_image/", { method: "POST", body: fd });
}

export function fetchStoryCategories(): Promise<string[]> {
  return api<string[]>("/api/stories/categories/");
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatStoryDate(value?: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
