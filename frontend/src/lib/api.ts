// On the server (SSR/SSG), use the absolute backend URL.
// In the browser, use a relative base ("") so requests go to /api/... and
// are proxied by Next.js rewrites to the Django backend.
export const API_BASE: string =
  typeof window === "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ||
       process.env.VITE_API_URL ||
       (process.env.NODE_ENV === "production"
         ? "http://backend:8000"
         : "http://127.0.0.1:8000"))
    : "";

type Tokens = { access: string; refresh: string };

const TOKEN_KEY = "vt_tokens";

export function getTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens | null) {
  if (typeof window === "undefined") return;
  if (tokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const bin = window.atob(b64);
      try {
        const json = decodeURIComponent(
          Array.prototype.map
            .call(bin, (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        return JSON.parse(json);
      } catch {
        return JSON.parse(bin);
      }
    }
    return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null | undefined, bufferSeconds = 30): boolean {
  if (!token) return true;
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return Date.now() >= (payload.exp - bufferSeconds) * 1000;
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const tokens = getTokens();
      if (!tokens?.refresh) {
        setTokens(null);
        return null;
      }

      // If the refresh token itself is expired, wipe tokens immediately
      if (isTokenExpired(tokens.refresh, 0)) {
        setTokens(null);
        return null;
      }

      const res = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: tokens.refresh }),
        cache: "no-store",
      });

      if (!res.ok) {
        setTokens(null);
        return null;
      }

      const data = await res.json();
      const newAccess = data.access as string;
      const newRefresh = (data.refresh as string) || tokens.refresh;
      setTokens({ access: newAccess, refresh: newRefresh });
      return newAccess;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.access) return null;
  if (!isTokenExpired(tokens.access)) return tokens.access;
  return await refreshAccessToken();
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  let detail: unknown = null;
  try {
    const data = await res.json();
    detail = data;
    if (typeof data === "string") message = data;
    else if (data?.detail) message = String(data.detail);
    else if (typeof data === "object") {
      const first = Object.entries(data as Record<string, unknown>)[0];
      if (first) message = `${first[0]}: ${Array.isArray(first[1]) ? first[1][0] : first[1]}`;
    }
  } catch {
    /* keep default */
  }
  throw new ApiError(res.status, message, detail);
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const { retry = true, ...init } = options;
  const headers = new Headers(init.headers);
  const isFormData = init.body instanceof FormData;
  if (!isFormData && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Pre-flight token freshness check:
  // If tokens are stored and access is expired, proactively refresh it.
  // This eliminates 401s on page load and avoids multiple simultaneous 401 retries.
  let tokens = getTokens();
  if (tokens) {
    if (isTokenExpired(tokens.access)) {
      const newAccess = await refreshAccessToken();
      tokens = newAccess ? getTokens() : null;
    }
    if (tokens?.access) {
      headers.set("Authorization", `Bearer ${tokens.access}`);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers });

  if (res.status === 401 && retry) {
    if (tokens) {
      const access = await refreshAccessToken();
      if (access) {
        headers.set("Authorization", `Bearer ${access}`);
        const retried = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers });
        if (retried.ok || retried.status === 204) {
          if (retried.status === 204) return undefined as T;
          return (await retried.json()) as T;
        }
      }
      setTokens(null);
    }

    // If refresh failed (or token was invalid) and Authorization was present,
    // retry once without Authorization. If the endpoint allows public access (e.g. stories, CMS),
    // it will succeed cleanly instead of throwing 401.
    if (headers.has("Authorization")) {
      headers.delete("Authorization");
      const unauthRetry = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers });
      if (unauthRetry.ok || unauthRetry.status === 204) {
        if (unauthRetry.status === 204) return undefined as T;
        return (await unauthRetry.json()) as T;
      }
      await parseError(unauthRetry);
    }
  }

  if (!res.ok) await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

api.get = <T = unknown>(path: string, options?: RequestInit) =>
  api<T>(path, { ...options, method: "GET" });

api.post = <T = unknown>(path: string, body?: unknown, options?: RequestInit) =>
  api<T>(path, {
    ...options,
    method: "POST",
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

api.patch = <T = unknown>(path: string, body?: unknown, options?: RequestInit) =>
  api<T>(path, {
    ...options,
    method: "PATCH",
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

api.delete = <T = unknown>(path: string, options?: RequestInit) =>
  api<T>(path, { ...options, method: "DELETE" });

