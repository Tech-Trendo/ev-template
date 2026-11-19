/** Repair UTF-8 text that was stored/served as Latin-1 (e.g. "â€"" → "—"). */
export function repairMojibake(s: string): string {
  if (!s || (!s.includes("â") && !/[ÃÂ]/.test(s))) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (decoded.includes("\uFFFD") || decoded === s) return s;
    return decoded;
  } catch {
    return s;
  }
}

export function normalizeLegacyLabels<T>(data: T): T {
  if (typeof data === "string") {
    let s: string = repairMojibake(data);
    if (s.trim().toLowerCase() === "book a test drive") {
      s = "Request a Quote";
    }
    if (s.includes("–") || s.includes("—")) {
      s = s
        .replace(/Kathmandu[–—]Pokhara/g, "Kathmandu to Pokhara")
        .replace(/(\d+)\s*[–—]\s*(\d+)/g, "$1 to $2")
        .replace(/\s*[–—]\s*/g, ": ")
        .replace(/[–—]/g, "-");
    }
    return s as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((v) => normalizeLegacyLabels(v)) as T;
  }
  if (data !== null && typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = normalizeLegacyLabels(v);
    }
    return out as T;
  }
  return data;
}
