import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { buildBookingView } from "@/lib/service";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const schema = z.object({
  pnr: z.string().trim().min(5).max(8),
  lastName: z.string().trim().min(1),
});

export async function POST(req: Request) {
  // Blunt PNR enumeration: generous for a human, hostile to a script.
  if (!rateLimit(`lookup:${clientKey(req)}`)) {
    return Response.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Please enter your PNR and last name." },
      { status: 400 }
    );
  }

  const booking = store.findBooking(parsed.data.pnr, parsed.data.lastName);
  if (!booking) {
    return Response.json(
      {
        error:
          "We couldn't find a booking with that PNR and last name. (Try SJ7QK2 / Sharma.)",
      },
      { status: 404 }
    );
  }

  store.addAudit({
    bookingRef: booking.ref,
    action: "LOOKUP",
    detail: "Passenger opened self-service",
  });
  return Response.json(buildBookingView(booking));
}
