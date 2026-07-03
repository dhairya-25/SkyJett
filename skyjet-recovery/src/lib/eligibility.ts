import type { Booking, DisruptionCause, Flight } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility rules engine.
//
// Encodes the core, defensible rule cross-validated by DGCA (India) and Delta:
// the CAUSE of the disruption drives entitlement.
//   • Weather / ATC / security  = "extraordinary circumstances"
//        → free rebooking OR full refund + duty of care, but NO cash compensation
//   • Technical / crew / ops     = within the airline's control
//        → the above PLUS tiered cash compensation
//
// Pure + deterministic → fully unit-tested. This is the "explainability" core:
// every field carries a human-readable reason and a rule citation.
// ─────────────────────────────────────────────────────────────────────────────

export const LONG_DELAY_MINUTES = 180; // ≥ 3h counts as a significant delay
export const MEALS_MINUTES = 120; // DGCA: meals for delays ≥ 2h
export const HOTEL_MINUTES = 360; // DGCA: hotel for long/overnight waits

export type CauseCategory = "EXTRAORDINARY" | "AIRLINE_CONTROLLED" | "NONE";
export type DisruptionKind = "CANCELLED" | "LONG_DELAY" | "NONE";

const CAUSE_LABEL: Record<DisruptionCause, string> = {
  WEATHER: "Weather",
  ATC: "Air-traffic control",
  SECURITY: "Security",
  TECHNICAL: "Technical / maintenance",
  CREW: "Crew",
  OPERATIONAL: "Operational",
  NONE: "—",
};

export function classifyCause(cause: DisruptionCause): CauseCategory {
  if (cause === "WEATHER" || cause === "ATC" || cause === "SECURITY") {
    return "EXTRAORDINARY";
  }
  if (cause === "TECHNICAL" || cause === "CREW" || cause === "OPERATIONAL") {
    return "AIRLINE_CONTROLLED";
  }
  return "NONE";
}

export function classifyDisruption(flight: Flight): DisruptionKind {
  if (flight.status === "CANCELLED") return "CANCELLED";
  if (flight.status === "DELAYED" && flight.delayMinutes >= LONG_DELAY_MINUTES) {
    return "LONG_DELAY";
  }
  return "NONE";
}

/** DGCA CAR Section 3, Series M, Part IV — compensation tiered by block time. */
export function compensationTier(durationMin: number): number {
  if (durationMin <= 60) return 5000;
  if (durationMin <= 120) return 7500;
  return 10000;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export interface Entitlement {
  eligible: boolean;
  reason: string;
}

export interface EligibilityResult {
  disruption: DisruptionKind;
  causeCategory: CauseCategory;
  causeLabel: string;
  refund: Entitlement & { amount: number };
  rebook: Entitlement;
  compensation: Entitlement & { amount: number; ruleRef: string };
  dutyOfCare: { meals: boolean; hotel: boolean; reason: string };
  headline: string;
  ruleRef: string;
}

export function evaluateEligibility(
  booking: Booking,
  flight: Flight
): EligibilityResult {
  const disruption = classifyDisruption(flight);
  const causeCategory = classifyCause(flight.cause);
  const causeLabel = CAUSE_LABEL[flight.cause];
  const disrupted = disruption !== "NONE";

  const refund = {
    eligible: disrupted,
    amount: disrupted ? booking.farePaid : 0,
    reason: disrupted
      ? `Your flight was ${
          disruption === "CANCELLED" ? "cancelled" : "significantly delayed"
        }, so you may take a full refund of ${inr(
          booking.farePaid
        )} instead of travelling.`
      : "No refund due — your flight is operating as scheduled.",
  };

  const rebook = {
    eligible: disrupted,
    reason: disrupted
      ? "Free rebooking to the next available SkyJet flight — no fare difference, because the disruption wasn't your fault."
      : "No rebooking needed — your flight is on time.",
  };

  const compEligible = disrupted && causeCategory === "AIRLINE_CONTROLLED";
  const compAmount = compEligible ? compensationTier(flight.durationMin) : 0;
  const compensation = {
    eligible: compEligible,
    amount: compAmount,
    reason: !disrupted
      ? "No compensation — flight operating normally."
      : causeCategory === "EXTRAORDINARY"
        ? `No cash compensation: ${causeLabel.toLowerCase()} is an "extraordinary circumstance" beyond the airline's control. You're still entitled to a free rebooking or full refund, plus the care below.`
        : `${inr(
            compAmount
          )} cash compensation — this disruption was within the airline's control (${causeLabel.toLowerCase()}).`,
    ruleRef:
      causeCategory === "EXTRAORDINARY"
        ? "DGCA CAR §3-M-IV — no compensation for extraordinary circumstances"
        : "DGCA CAR §3-M-IV — compensation tiered by block time",
  };

  const meals =
    disrupted &&
    (disruption === "CANCELLED" || flight.delayMinutes >= MEALS_MINUTES);
  const hotel = flight.delayMinutes >= HOTEL_MINUTES;
  const dutyOfCare = {
    meals,
    hotel,
    reason:
      [
        meals ? "Meals & refreshments" : null,
        hotel ? "Hotel + airport transfer for the overnight wait" : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No additional care required for this disruption.",
  };

  const headline = !disrupted
    ? "Your flight is operating normally."
    : causeCategory === "EXTRAORDINARY"
      ? "Rebook free or take a full refund, plus meal/hotel care — cash compensation doesn't apply for weather."
      : "Rebook free or take a full refund — and you're owed cash compensation.";

  return {
    disruption,
    causeCategory,
    causeLabel,
    refund,
    rebook,
    compensation,
    dutyOfCare,
    headline,
    ruleRef: compensation.ruleRef,
  };
}
