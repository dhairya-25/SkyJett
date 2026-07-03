// Ops/admin authentication for the flight-status panel.
//
// The console is guarded by a bearer token (same convention as the RAG
// reindex endpoint). In development we fall back to a well-known token so the
// panel works out-of-the-box; in production the token MUST come from the
// ADMIN_TOKEN env var, otherwise the admin surface stays disabled (503).
// All data here is simulated, so the dev fallback carries no real risk.

/** Well-known token used only outside production when ADMIN_TOKEN is unset. */
export const DEV_ADMIN_TOKEN = "skyjet-ops-2026";

/** The active admin token, or null when the panel is disabled (prod + unset). */
export function adminToken(): string | null {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  if (process.env.NODE_ENV !== "production") return DEV_ADMIN_TOKEN;
  return null;
}

export type AdminAuth =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Validate the `Authorization: Bearer <token>` header on an admin request. */
export function authorizeAdmin(req: Request): AdminAuth {
  const token = adminToken();
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "Admin panel is disabled — set ADMIN_TOKEN to enable it.",
    };
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return { ok: false, status: 401, error: "Invalid ops access token." };
  }
  return { ok: true };
}
