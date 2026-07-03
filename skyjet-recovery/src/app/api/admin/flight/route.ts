import { z } from "zod";
import { authorizeAdmin } from "@/lib/admin-auth";
import { store } from "@/lib/store";

// Apply an ops/admin change to a single flight (delay, cause, boarding
// progress, cancellation). Token-guarded write. Passenger booking views read
// the flight live, so one update reaches every affected PNR without a per-PNR
// write. The change is recorded on the ops feed for the console's history.
const schema = z
  .object({
    flightId: z.string().trim().min(2),
    status: z.enum(["SCHEDULED", "CANCELLED", "DELAYED"]).optional(),
    cause: z
      .enum(["WEATHER", "ATC", "SECURITY", "TECHNICAL", "CREW", "OPERATIONAL", "NONE"])
      .optional(),
    delayMinutes: z.number().int().min(0).max(2880).optional(),
    opsStatus: z.enum(["ON_TIME", "REPORTING", "BOARDING", "DEPARTED"]).optional(),
    note: z.string().trim().max(160).optional(),
    // A "sorry for the inconvenience" goodwill gesture; `null` clears it.
    goodwill: z
      .object({
        freeMeal: z.boolean(),
        freeAccommodation: z.boolean(),
        discountPercent: z.number().int().min(0).max(100),
        message: z.string().trim().max(200).optional(),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.cause !== undefined ||
      v.delayMinutes !== undefined ||
      v.opsStatus !== undefined ||
      v.note !== undefined ||
      v.goodwill !== undefined,
    { message: "No change supplied." }
  );

export async function POST(req: Request) {
  const auth = authorizeAdmin(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update." },
      { status: 400 }
    );
  }

  const { flightId, ...patch } = parsed.data;
  const flight = store.applyOps(flightId, patch);
  if (!flight) return Response.json({ error: "Flight not found." }, { status: 404 });

  return Response.json({ ok: true, flight, opsLog: store.opsLog.slice(0, 10) });
}
