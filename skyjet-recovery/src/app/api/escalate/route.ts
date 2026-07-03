import { z } from "zod";
import { buildBookingView, evaluateEscalation, shortRef } from "@/lib/service";
import { store } from "@/lib/store";

const schema = z.object({
  ref: z.string().trim().min(5),
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
    return Response.json({ error: "Missing booking reference." }, { status: 400 });
  }

  // Every write re-authenticates (PNR + last name) — a PNR alone is guessable.
  const booking = store.findBooking(parsed.data.ref, parsed.data.lastName);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });
  const flight = store.getFlight(booking.flightId);

  const esc = evaluateEscalation(booking);
  // Asking again joins the same case rather than opening a duplicate.
  const alreadyOpen = booking.status === "ESCALATED" && booking.handoffReference;
  const reference = booking.handoffReference ?? shortRef("AG");
  booking.handoffReference = reference;
  booking.status = "ESCALATED";
  if (!alreadyOpen) booking.version += 1;

  // Warm handoff: package full context so the agent never asks the passenger
  // to repeat themselves.
  const handoff = {
    reference,
    passenger: `${booking.passenger.firstName} ${booking.passenger.lastName}`,
    pnr: booking.ref,
    tier: booking.passenger.tier,
    context: [
      flight
        ? `Flight ${flight.flightNo} ${flight.origin}→${flight.destination} — ${flight.status}${
            flight.cause !== "NONE" ? ` (${flight.cause.toLowerCase()})` : ""
          }`
        : "Flight details unavailable",
      ...(esc.reasons.length ? esc.reasons : ["Passenger requested a human agent"]),
      "Passenger used self-service before escalating — context attached.",
    ],
  };

  if (!alreadyOpen) {
    store.addAudit({
      bookingRef: booking.ref,
      action: "ESCALATE",
      detail: `Warm handoff to agent ${reference}`,
    });
  }

  return Response.json({
    ...buildBookingView(booking),
    handoff,
    stats: store.stats(),
  });
}
