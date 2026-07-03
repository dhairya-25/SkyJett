import type { Booking } from "./types";

// Seat-allocation priority for a mass rebooking. During IRROPS a whole plane of
// passengers rebooks at once, so the good (front, easy-access) seats are held
// for those who need them most, in this order:
//
//   1. Senior citizens
//   2. Business-class passengers
//   3. Children / passengers travelling with an infant
//   4. Everyone else (standard)
//
// A passenger can qualify on more than one count; the highest (lowest rank
// number) wins.

export type PriorityTier = "SENIOR" | "BUSINESS" | "CHILD_INFANT" | "STANDARD";

export interface Priority {
  tier: PriorityTier;
  rank: number; // 1 = highest priority … 4 = lowest
  label: string; // short passenger-facing label
  reason: string; // why they got this priority
}

/** The seat-allocation priority for a booking. */
export function computePriority(booking: Booking): Priority {
  const p = booking.passenger;

  if (p.isSenior) {
    return {
      tier: "SENIOR",
      rank: 1,
      label: "Senior citizen",
      reason: "Senior citizens are allocated seats first.",
    };
  }
  if (booking.cabin === "BUSINESS") {
    return {
      tier: "BUSINESS",
      rank: 2,
      label: "Business class",
      reason: "Business-class passengers are allocated next.",
    };
  }
  if (p.isChild || booking.withInfant) {
    return {
      tier: "CHILD_INFANT",
      rank: 3,
      label: booking.withInfant ? "Travelling with an infant" : "Child traveller",
      reason: "Children and passengers with an infant are prioritised next.",
    };
  }
  return {
    tier: "STANDARD",
    rank: 4,
    label: "Standard",
    reason:
      "Standard priority — front priority seats are held for senior, business and infant travellers.",
  };
}

/** True for anyone the priority seating zone is reserved for (ranks 1–3). */
export function isPriorityPassenger(rank: number): boolean {
  return rank <= 3;
}
