import { z } from "zod";
import { evaluateEligibility } from "@/lib/eligibility";
import { buildBookingView, shortRef } from "@/lib/service";
import { store } from "@/lib/store";

const schema = z.object({
  ref: z.string().trim().min(5),
  lastName: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
  expectedVersion: z.number().int().nonnegative().optional(),
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
    return Response.json({ error: "Missing refund details." }, { status: 400 });
  }
  const { ref, lastName, idempotencyKey, expectedVersion } = parsed.data;

  // Every write re-authenticates (PNR + last name) — a PNR alone is guessable.
  const booking = store.findBooking(ref, lastName);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  const idemKey = `refund:${booking.ref}:${idempotencyKey}`;
  const cached = store.idempotency.get(idemKey);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: { "content-type": "application/json", "idempotent-replay": "true" },
    });
  }

  const flight = store.getFlight(booking.flightId);
  if (!flight) return Response.json({ error: "Flight not found." }, { status: 404 });

  // State guards — refund and rebooking are mutually exclusive (DGCA: the
  // passenger chooses one), and escalated cases belong to the agent.
  if (booking.status === "REBOOKED") {
    return Response.json(
      { error: "You're already rebooked on a new flight. To switch to a refund instead, talk to an agent." },
      { status: 409 }
    );
  }
  if (booking.status === "REFUND_REQUESTED") {
    return Response.json(
      { error: `A refund is already in progress for this booking (${booking.refundReference}).` },
      { status: 409 }
    );
  }
  if (booking.status === "ESCALATED") {
    return Response.json(
      { error: "This booking is with an agent — they will complete any changes with you." },
      { status: 409 }
    );
  }

  // Optimistic concurrency: reject a write based on a stale copy of the booking.
  if (expectedVersion !== undefined && expectedVersion !== booking.version) {
    return Response.json(
      { error: "This booking was changed in another session. Please refresh and try again." },
      { status: 409 }
    );
  }

  const eligibility = evaluateEligibility(booking, flight);
  if (!eligibility.refund.eligible) {
    return Response.json(
      { error: "This booking isn't eligible for a refund." },
      { status: 409 }
    );
  }

  const reference = shortRef("RF");
  booking.refundReference = reference;
  booking.status = "REFUND_REQUESTED";
  booking.version += 1;
  store.addAudit({
    bookingRef: booking.ref,
    action: "REFUND",
    detail: `Refund initiated ${reference} for ₹${booking.farePaid}`,
  });

  const payload = JSON.stringify({
    ...buildBookingView(booking),
    refund: { reference, amount: booking.farePaid },
    stats: store.stats(),
  });
  store.idempotency.set(idemKey, payload);
  return new Response(payload, {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
