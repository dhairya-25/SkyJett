import { z } from "zod";
import { buildBookingView } from "@/lib/service";
import { store } from "@/lib/store";

// Quiet re-fetch of the booking view, used by the passenger app to poll for
// live flight updates (a delay change, boarding call, or cancellation pushed
// from the ops panel). Re-authenticates (PNR + last name) like every read, but
// records no audit entry and applies no rate-limit friction so polling is cheap.
export const dynamic = "force-dynamic";

const schema = z.object({
  pnr: z.string().trim().min(5).max(8),
  lastName: z.string().trim().min(1),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Missing booking details." }, { status: 400 });
  }

  const booking = store.findBooking(parsed.data.pnr, parsed.data.lastName);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  return Response.json(buildBookingView(booking));
}
