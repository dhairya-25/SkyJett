import { authorizeAdmin } from "@/lib/admin-auth";
import { store } from "@/lib/store";

// Ops worklist: every flight plus the recent change feed. Token-guarded read.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authorizeAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  return Response.json({
    flights: store.listFlights(),
    opsLog: store.opsLog.slice(0, 10),
    now: new Date().toISOString(),
  });
}
