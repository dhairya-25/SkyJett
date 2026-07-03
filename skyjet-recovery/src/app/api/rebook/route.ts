import { z } from "zod";
import {
  buildBookingView,
  fareDifference,
  getRebookingOptions,
  makeBoardingPass,
} from "@/lib/service";
import { allocateSeat, buildSeatMap, isSeatFree, seatSelectable } from "@/lib/seatmap";
import { computePriority } from "@/lib/priority";
import { store } from "@/lib/store";

const schema = z.object({
  ref: z.string().trim().min(5),
  lastName: z.string().trim().min(1),
  flightId: z.string().trim().min(2),
  // Chosen from the seat map. Optional — omitted picks the first free seat.
  seat: z.string().trim().min(2).max(4).optional(),
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
    return Response.json({ error: "Missing rebooking details." }, { status: 400 });
  }
  const { ref, lastName, flightId, seat, idempotencyKey, expectedVersion } = parsed.data;

  // Every write re-authenticates (PNR + last name) — a PNR alone is guessable.
  const booking = store.findBooking(ref, lastName);
  if (!booking) return Response.json({ error: "Booking not found." }, { status: 404 });

  // Idempotency: replay the stored response for a repeated key (double-tap safe).
  // Keys are scoped per action + booking so one can never replay another operation.
  const idemKey = `rebook:${booking.ref}:${idempotencyKey}`;
  const cached = store.idempotency.get(idemKey);
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: { "content-type": "application/json", "idempotent-replay": "true" },
    });
  }

  const original = store.getFlight(booking.flightId);
  if (!original) return Response.json({ error: "Flight not found." }, { status: 404 });

  // State guards — rebooking and refund are mutually exclusive (DGCA: the
  // passenger chooses one), and escalated cases belong to the agent.
  if (booking.status === "REFUND_REQUESTED") {
    return Response.json(
      { error: "A refund is already in progress for this booking. Talk to an agent to change course." },
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

  // Revalidate the selection against freshly-computed options — a stale pick fails.
  const chosen = getRebookingOptions(booking).find((o) => o.flight.id === flightId);
  if (!chosen) {
    return Response.json(
      { error: "That flight is no longer available. Please choose another." },
      { status: 409 }
    );
  }

  // Priority scheduling: a lower-priority passenger cannot take a seat being held
  // for a still-unaccommodated higher-priority passenger (senior citizens first).
  // They're waitlisted for this flight and should pick one with more room.
  if (!chosen.available) {
    return Response.json({ error: chosen.capacityNote }, { status: 409 });
  }

  // Changing again is allowed — release the previously held seat first (frees
  // both a unit of inventory and the specific seat on the map).
  if (booking.rebookedFlightId) {
    const prev = store.getFlight(booking.rebookedFlightId);
    if (prev) prev.seatsAvailable += 1;
    store.releaseSeat(booking.rebookedFlightId, booking.seat);
  }

  const target = store.getFlight(flightId)!;

  // Assign the seat by priority. An explicit pick is re-validated against the
  // live map (so two passengers can't grab the same seat) and against the
  // passenger's priority (a standard passenger can't take a reserved priority
  // seat while others remain). With no pick, we hold the best seat their
  // priority entitles them to.
  const map = buildSeatMap(target, store.seatsTaken(target.id));
  const priority = computePriority(booking);
  let seatId = seat?.toUpperCase();
  if (seatId) {
    if (!isSeatFree(map, seatId)) {
      return Response.json(
        { error: "That seat was just taken. Please pick another." },
        { status: 409 }
      );
    }
    if (!seatSelectable(map, seatId, priority.rank)) {
      return Response.json(
        {
          error:
            "That seat is reserved for senior, business and infant travellers. Please pick another.",
        },
        { status: 409 }
      );
    }
  } else {
    seatId = allocateSeat(map, priority.rank);
  }
  if (!seatId) {
    return Response.json(
      { error: "This flight is now full. Please choose another." },
      { status: 409 }
    );
  }

  store.bookSeat(target.id, seatId);
  target.seatsAvailable = Math.max(0, target.seatsAvailable - 1);
  booking.rebookedFlightId = target.id;
  booking.seat = seatId;
  booking.status = "REBOOKED";
  booking.version += 1;
  const diff = fareDifference(booking.farePaid, target);
  const settlement =
    diff > 0 ? `+₹${diff} charged` : diff < 0 ? `₹${-diff} refunded` : "no fare difference";
  store.addAudit({
    bookingRef: booking.ref,
    action: "REBOOK",
    detail: `Rebooked to ${target.flightNo}, seat ${seatId} (${settlement})`,
    before: original.flightNo,
    after: target.flightNo,
  });

  const payload = JSON.stringify({
    ...buildBookingView(booking),
    boardingPass: makeBoardingPass(booking, target),
    stats: store.stats(),
  });
  store.idempotency.set(idemKey, payload);
  return new Response(payload, {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
