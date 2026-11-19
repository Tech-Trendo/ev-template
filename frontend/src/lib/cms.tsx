"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, API_BASE } from "./api";
import { CMS_DEFAULTS, type CmsContent, type CmsPageKey } from "./cmsDefaults";
import { normalizeLegacyLabels, repairMojibake } from "./textNormalize";

export { normalizeLegacyLabels, repairMojibake };

type StoredPage = { page: string; data?: Record<string, unknown> };

export type StoredMap = Partial<Record<CmsPageKey, Record<string, unknown>>>;

const CmsContext = createContext<StoredMap | null>(null);

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    return (Array.isArray(override) ? override : base) as T;
  }
  if (base !== null && typeof base === "object") {
    if (!override || typeof override !== "object" || Array.isArray(override)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out as T;
  }
  return (override === undefined || override === null ? base : override) as T;
}

export function CmsProvider({
  children,
  initialData,
}: {
  children: ReactNode;
  initialData?: StoredMap;
}) {
  const [stored, setStored] = useState<StoredMap>(initialData || {});

  useEffect(() => {
    let cancelled = false;
    api<StoredPage[]>("/api/cms/pages/", { cache: "no-store" } as RequestInit)
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const map: StoredMap = {};
        for (const row of rows) {
          if (row?.page && row.data && typeof row.data === "object") {
            map[row.page as CmsPageKey] = row.data;
          }
        }
        setStored((prev) => ({ ...prev, ...map }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <CmsContext.Provider value={stored}>{children}</CmsContext.Provider>;
}

export function useCms<K extends CmsPageKey>(page: K): CmsContent[K] {
  const stored = useContext(CmsContext);
  let override = stored?.[page];
  // Fallback: if requesting calculator but only roi exists in CMS, use roi data
  if (page === "calculator" && !override && stored?.["roi"]) {
    override = stored["roi"];
  }
  // Reverse fallback for legacy callers
  if (page === "roi" && !override && stored?.["calculator"]) {
    override = stored["calculator"];
  }
  const merged = deepMerge(CMS_DEFAULTS[page], override);
  return normalizeLegacyLabels(merged);
}

export function resolveImg(src: string): string {
  if (!src) return "";
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  // Backend-served uploads live under /media/ — resolve those against the
  // API host. Everything else (frontend-public assets such as
  // /favicon.svg or /static/...) is served by the site host
  // itself, so keep it relative. Prefixing those with the API base made the
  // logo 404 against the API host and loop in local dev.
  if (!src.startsWith("/media/")) return src;
  const base = API_BASE;
  return `${base}${src}`;
}

/**
 * One-shot <img> error fallback that is safe with React.
 *
 * NOTE: `img.onerror = null` does NOT detach React's synthetic onError
 * listener (React listens at the root container), so a failing fallback URL
 * re-triggers the handler forever. This guard applies the fallback only
 * once; if it also fails, the image is hidden to break the loop.
 */
export function imgFallback(e: { currentTarget: HTMLImageElement }, fallback: string) {
  const img = e.currentTarget;
  if (img.dataset.fb) {
    img.style.display = "none";
    return;
  }
  img.dataset.fb = "1";
  img.src = fallback;
}
