// Minimal fixed-window, in-memory rate limiter — enough to blunt PNR/last-name
// enumeration on a single instance. Production would enforce this at the edge
// (WAF / API gateway) or in Redis so it holds across instances.

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export const LOOKUP_LIMIT = 30; // attempts per window — generous for humans, hostile to scripts
export const WINDOW_MS = 60_000;

/** Returns true when the caller is within the limit (and records the hit). */
export function rateLimit(
  key: string,
  max = LOOKUP_LIMIT,
  windowMs = WINDOW_MS
): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= max;
}

/** Client key for a request — best-effort IP, fine for a demo. */
export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Test hook. */
export function resetRateLimits() {
  windows.clear();
}
