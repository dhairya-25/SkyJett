import { evaluateEligibility, type EligibilityResult } from "./eligibility";
import { hoursBetween, istDayKey } from "./format";
import { capacityFor, competingBookings } from "./rebooking-priority";
import { store } from "./store";
import type { Booking, Flight, SpecialFlag } from "./types";

// ── Rebooking recommendation (scored, explained) ────────────────────────────
// Heuristic scoring inspired by the ben-marrett reference service: start at 100,
// penalise later/next-day options, reward same-time-of-day. Every option ships a
// plain-English reason — this is our answer to AA's "opaque options" criticism.

export interface RebookOption {
  flight: Flight;
  score: number;
  reason: string;
  recommended: boolean;
  /** New flight fare − fare already paid. >0 the passenger pays, <0 refunded. */
  fareDiff: number;
  /** Priority capacity: false = seats held for higher-priority passengers
   *  (passenger is waitlisted for this flight). */
  available: boolean;
  heldForHigherPriority: number;
  capacityNote: string;
}

/** Fare difference between what the passenger paid and a candidate flight. */
export function fareDifference(farePaid: number, flight: Flight): number {
  return flight.fare - farePaid;
}

export function scoreOption(
  original: Flight,
  candidate: Flight
): { score: number; reason: string } {
  let score = 100;
  const parts: string[] = [];

  const nextDay = istDayKey(candidate.departure) !== istDayKey(original.departure);
  if (nextDay) {
    score -= 30;
    parts.push("Next day");
  } else {
    parts.push("Same day");
  }

  const laterH = Math.max(0, hoursBetween(original.departure, candidate.departure));
  score -= Math.min(40, Math.round(laterH * 5));
  parts.push(laterH < 1 ? "departs shortly after" : `${Math.round(laterH)}h later`);

  // Bonus if it departs within 2h of the original time-of-day.
  const minsOfDay = (iso: string) => {
    const [h, m] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(new Date(iso))
      .split(":")
      .map(Number);
    return h * 60 + m;
  };
  const todDiff = Math.abs(minsOfDay(candidate.departure) - minsOfDay(original.departure));
  if (Math.min(todDiff, 1440 - todDiff) <= 120) score += 10;

  parts.push("direct");
  return { score, reason: parts.join(" · ") };
}

export function getRebookingOptions(booking: Booking): RebookOption[] {
  const flight = store.getFlight(booking.flightId);
  if (!flight) return [];
  // Passengers still competing for scarce seats on this same disrupted route.
  const competitors = competingBookings(
    booking,
    [...store.bookings.values()],
    (id) => store.getFlight(id)
  );
  const scored = store.alternativesFor(flight).map((f) => {
    const { score, reason } = scoreOption(flight, f);
    const cap = capacityFor(booking, f, competitors);
    return {
      flight: f,
      score,
      reason,
      recommended: false,
      fareDiff: fareDifference(booking.farePaid, f),
      available: cap.available,
      heldForHigherPriority: cap.heldForHigherPriority,
      capacityNote: cap.note,
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(a.flight.departure) - Date.parse(b.flight.departure)
  );
  // Recommend the best option the passenger can actually take right now — not one
  // whose seats are being held for higher-priority passengers.
  const rec = scored.find((o) => o.available) ?? scored[0];
  if (rec) rec.recommended = true;
  return scored;
}

// ── Escalation (automate vs. hand to an agent) ──────────────────────────────

const FLAG_REASON: Record<SpecialFlag, string> = {
  UNACCOMPANIED_MINOR: "Unaccompanied minor — needs assisted handling",
  MEDICAL: "Medical / special assistance required",
  PET_IN_CABIN: "Travelling with a pet in cabin",
  GROUP: "Group booking",
  PARTNER_TICKET: "Issued on a partner airline",
};

export function evaluateEscalation(booking: Booking): {
  escalate: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  for (const flag of booking.specialFlags) reasons.push(FLAG_REASON[flag]);
  if (booking.partySize > 4) reasons.push("Large party (more than 4 passengers)");

  const flight = store.getFlight(booking.flightId);
  if (flight && flight.status !== "SCHEDULED" && getRebookingOptions(booking).length === 0) {
    reasons.push("No self-service rebooking available within policy");
  }
  return { escalate: reasons.length > 0, reasons };
}

// ── Boarding pass ───────────────────────────────────────────────────────────

export interface BoardingPass {
  pnr: string;
  passengerName: string;
  flightNo: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  cabin: string;
  seat: string;
  gate: string;
  boarding: string;
  sequence: string;
}

function deterministicSeat(ref: string): string {
  const row = 8 + (hash(ref) % 22);
  const col = "ABCDEF"[hash(ref + "c") % 6];
  return `${row}${col}`;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function makeBoardingPass(booking: Booking, flight: Flight): BoardingPass {
  const boarding = new Date(Date.parse(flight.departure) - 40 * 60_000).toISOString();
  return {
    pnr: booking.ref,
    passengerName: `${booking.passenger.firstName} ${booking.passenger.lastName}`,
    flightNo: flight.flightNo,
    from: `${flight.originCity} (${flight.origin})`,
    to: `${flight.destinationCity} (${flight.destination})`,
    departure: flight.departure,
    arrival: flight.arrival,
    cabin: booking.cabin === "BUSINESS" ? "Business" : "Economy",
    // The seat the passenger chose on the seat map; fall back to a deterministic
    // assignment for any booking made without an explicit pick.
    seat: booking.seat ?? deterministicSeat(booking.ref),
    gate: `A${1 + (hash(flight.id) % 24)}`,
    boarding,
    sequence: `0${1 + (hash(booking.ref) % 60)}`.slice(-3),
  };
}

export function shortRef(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ── Assembled view returned to the client ───────────────────────────────────

export interface BookingView {
  booking: Booking;
  flight: Flight;
  rebookedFlight?: Flight;
  eligibility: EligibilityResult;
  escalation: { escalate: boolean; reasons: string[] };
  options: RebookOption[];
  boardingPass?: BoardingPass;
  /** Settled fare difference on a completed rebooking (>0 charged, <0 refunded). */
  fareSettlement?: { difference: number };
  refund?: { reference: string; amount: number };
  handoff?: {
    reference: string;
    passenger: string;
    pnr: string;
    tier: string;
    context: string[];
  };
}

export function buildBookingView(booking: Booking): BookingView {
  const flight = store.getFlight(booking.flightId)!;
  const eligibility = evaluateEligibility(booking, flight);
  const escalation = evaluateEscalation(booking);
  const options =
    eligibility.disruption !== "NONE" ? getRebookingOptions(booking) : [];
  const rebookedFlight = booking.rebookedFlightId
    ? store.getFlight(booking.rebookedFlightId)
    : undefined;

  const boardingPass = (booking.status === "REBOOKED" && rebookedFlight)
    ? makeBoardingPass(booking, rebookedFlight)
    : undefined;

  const fareSettlement = (booking.status === "REBOOKED" && rebookedFlight)
    ? { difference: fareDifference(booking.farePaid, rebookedFlight) }
    : undefined;

  const refund = (booking.status === "REFUND_REQUESTED" && booking.refundReference)
    ? { reference: booking.refundReference, amount: booking.farePaid }
    : undefined;

  const handoff = (booking.status === "ESCALATED" && booking.handoffReference)
    ? {
        reference: booking.handoffReference,
        passenger: `${booking.passenger.firstName} ${booking.passenger.lastName}`,
        pnr: booking.ref,
        tier: booking.passenger.tier,
        context: [
          `Flight ${flight.flightNo} ${flight.origin}→${flight.destination} — ${flight.status}${
            flight.cause !== "NONE" ? ` (${flight.cause.toLowerCase()})` : ""
          }`,
          ...(escalation.reasons.length ? escalation.reasons : ["Passenger requested a human agent"]),
          "Passenger used self-service before escalating — context attached.",
        ],
      }
    : undefined;

  return {
    booking,
    flight,
    rebookedFlight,
    eligibility,
    escalation,
    options,
    boardingPass,
    fareSettlement,
    refund,
    handoff,
  };
}
