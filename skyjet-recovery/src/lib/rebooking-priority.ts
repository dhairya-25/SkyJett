import { computePriority } from "./priority";
import type { Booking, Flight } from "./types";

// Priority-based rebooking capacity.
//
// During IRROPS a whole flight is disrupted at once, but the alternative flights
// are NOT empty — they have limited spare seats, so not everyone fits. The scarce
// seats are therefore rationed by priority: seats are *held* for higher-priority
// passengers (senior citizens first, then business, then infant/child), and a
// lower-priority passenger may only take a seat once enough remain for everyone
// who outranks them. Anyone who can't yet be seated is effectively waitlisted for
// that flight and pushed to one with more room.
//
// Pure and store-free (callers pass the booking pool + a flight lookup) so it is
// fully unit-testable and can't drift from the rebook endpoint that enforces it.

/** A booking is still competing for a seat if it hasn't been re-accommodated. */
export function isUnaccommodated(b: Booking): boolean {
  return b.status === "CONFIRMED" || b.status === "DISRUPTED";
}

/**
 * Other bookings competing with `booking` for the same route, because their
 * flight is also disrupted and they haven't been re-accommodated yet.
 */
export function competingBookings(
  booking: Booking,
  allBookings: Booking[],
  flightOf: (id: string) => Flight | undefined
): Booking[] {
  const mine = flightOf(booking.flightId);
  if (!mine) return [];
  return allBookings.filter((b) => {
    if (b.ref === booking.ref || !isUnaccommodated(b)) return false;
    const f = flightOf(b.flightId);
    return (
      !!f &&
      f.status !== "SCHEDULED" && // their flight is disrupted too
      f.origin === mine.origin &&
      f.destination === mine.destination
    );
  });
}

/**
 * How many competitors strictly outrank this booking (lower rank number = higher
 * priority). Equal-rank peers do NOT hold a seat against each other — only
 * strictly higher priority reserves capacity.
 */
export function higherPriorityWaiting(booking: Booking, competitors: Booking[]): number {
  const myRank = computePriority(booking).rank;
  return competitors.filter((b) => computePriority(b).rank < myRank).length;
}

export interface CapacityDecision {
  /** May this passenger take a seat on the flight right now? */
  available: boolean;
  seatsAvailable: number;
  /** Seats being held for still-unaccommodated higher-priority passengers. */
  heldForHigherPriority: number;
  /** Plain-English note for the UI / API. */
  note: string;
}

/**
 * Whether `booking` may take a seat on `target`, given seats are held for every
 * still-unaccommodated higher-priority passenger on the same route. Available iff
 * `seatsAvailable > heldForHigherPriority` (leaving a seat for each higher tier).
 */
export function capacityFor(
  booking: Booking,
  target: Flight,
  competitors: Booking[]
): CapacityDecision {
  const held = higherPriorityWaiting(booking, competitors);
  const seats = Math.max(0, target.seatsAvailable);
  const available = seats > held;
  const note = available
    ? held > 0
      ? `${seats} seat${seats === 1 ? "" : "s"} left · ${held} held for higher-priority passengers`
      : `${seats} seat${seats === 1 ? "" : "s"} available`
    : seats === 0
      ? "This flight is full."
      : `Seats held for ${held} higher-priority passenger${held === 1 ? "" : "s"} (senior citizens first) — you're on the waitlist for this flight.`;
  return { available, seatsAvailable: seats, heldForHigherPriority: held, note };
}
