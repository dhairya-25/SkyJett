import type { EligibilityResult } from "./eligibility";
import { hoursBetween, istDayKey } from "./format";
import type { RebookOption } from "./service";
import type { Flight } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Refund-vs-rebook advisor.
//
// A confused passenger asks the chatbot "should I take a refund or rebook?".
// This turns the SAME facts the UI already computes — the eligibility rules
// engine + the scored rebooking options (same-day vs next-day, hours later,
// fare difference, seat availability) — into a plain-English recommendation.
//
// Pure + deterministic → unit-tested. It never invents amounts or policy; it
// only weighs what buildBookingView already knows. The chatbot's LLM layer (when
// configured) rephrases this recommendation; without it, this text is served
// verbatim.
// ─────────────────────────────────────────────────────────────────────────────

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Same-day rebookings up to this many hours later are a clear "just rebook". */
const SOON_HOURS = 8;

export type Suggestion = "rebook" | "refund" | "either" | "agent" | "none";

export interface Recommendation {
  suggestion: Suggestion;
  /** Assembled, passenger-facing prose (Markdown-light). */
  answer: string;
  /** The weighed factors, so the LLM layer and tests can inspect the reasoning. */
  reasons: string[];
}

export interface RecommendInput {
  eligibility: EligibilityResult;
  options: RebookOption[];
  flight: Flight;
  escalation: { escalate: boolean; reasons: string[] };
}

/** Does this question ask us to advise between refunding and rebooking? */
export function wantsAdvice(query: string): boolean {
  const s = query.toLowerCase();
  // Phrases that are unambiguously asking for a recommendation on their own.
  const strong =
    /(refund|cancel).*(rebook|reschedul)|(rebook|reschedul).*(refund|cancel)|what (do|would) you (suggest|recommend|think|advise|do)|what should i do|help me (decide|choose)|which is better/;
  if (strong.test(s)) return true;
  // Weaker opinion words only count when paired with a choice topic.
  const opinion = /\b(should|shall|advise|advice|recommend|suggest|which|better|confused|not sure|unsure)\b/.test(s);
  const topic = /\b(refund|rebook|reschedul|cancel|wait|option)/.test(s);
  return opinion && topic;
}

export function recommendAction({
  eligibility,
  options,
  flight,
  escalation,
}: RecommendInput): Recommendation {
  const dest = flight.destinationCity || flight.destination;

  // Nothing to weigh — the flight is operating.
  if (eligibility.disruption === "NONE") {
    return {
      suggestion: "none",
      reasons: [],
      answer: `Good news — ${flight.flightNo} is operating as scheduled, so there's nothing to refund or rebook. Is there anything else I can help with?`,
    };
  }

  // Needs assisted handling — don't steer to a self-service path.
  if (escalation.escalate) {
    const why = escalation.reasons[0] ? ` (${escalation.reasons[0].toLowerCase()})` : "";
    return {
      suggestion: "agent",
      reasons: escalation.reasons,
      answer: `This booking needs assisted handling${why}, so I'd rather not push you toward a self-service refund or rebooking. Tap “Talk to an agent” and a specialist will help you weigh the options — with your full context already loaded.`,
    };
  }

  const refundEligible = eligibility.refund.eligible;
  const refundAmt = eligibility.refund.amount;
  const care = eligibility.dutyOfCare;
  const careLine =
    care.meals || care.hotel
      ? ` Either way, you're covered for ${care.reason.toLowerCase()} while you wait.`
      : "";
  const compLine = eligibility.compensation.eligible
    ? ` You're also owed ${inr(eligibility.compensation.amount)} cash compensation on top, whichever you pick.`
    : "";

  const best =
    options.find((o) => o.recommended && o.available) ?? options.find((o) => o.available);

  // No seat the passenger can actually take right now.
  if (!best) {
    const waitlisted = options.length > 0;
    const first = waitlisted
      ? "The next flights are full or holding their seats for higher-priority passengers, so a self-service rebooking isn't available right now."
      : "There's no alternative SkyJet flight to rebook onto within policy right now.";
    const reasons = [first, refundEligible ? `A full refund of ${inr(refundAmt)} is available now.` : ""].filter(
      Boolean
    );
    return {
      suggestion: refundEligible ? "refund" : "agent",
      reasons,
      answer: refundEligible
        ? `${first} Since you can't rebook at the moment, I'd suggest taking the full refund of ${inr(refundAmt)} — or tap “Talk to an agent” if you'd like us to keep looking for a seat.${compLine}`
        : `${first} Let me connect you to an agent to sort this out.`,
    };
  }

  const laterH = Math.max(0, Math.round(hoursBetween(flight.departure, best.flight.departure)));
  const sameDay = istDayKey(best.flight.departure) === istDayKey(flight.departure);
  const costLine =
    best.fareDiff > 0
      ? ` for ${inr(best.fareDiff)} more in fare difference`
      : best.fareDiff < 0
        ? ` and you'd get ${inr(-best.fareDiff)} back on the fare`
        : " at no extra cost";
  const whenLine = sameDay
    ? `gets you to ${dest} the same day, about ${laterH}h later than planned`
    : `is the next day, about ${laterH}h later`;

  const reasons: string[] = [
    `Rebooking on ${best.flight.flightNo} ${whenLine}${costLine}; your checked bags are re-routed automatically.`,
  ];
  if (refundEligible) {
    reasons.push(`A full refund of ${inr(refundAmt)} is available if you no longer need to travel.`);
  }

  // Same-day and reasonably soon → clear lean toward rebooking.
  if (sameDay && laterH <= SOON_HOURS) {
    return {
      suggestion: "rebook",
      reasons,
      answer: `I'd lean toward **rebooking**: ${best.flight.flightNo} ${whenLine}${costLine}, and your bags follow automatically. Take the full ${inr(
        refundAmt
      )} refund instead only if you no longer need to fly to ${dest}.${careLine}${compLine}`,
    };
  }

  // Next-day or a long wait → genuinely the passenger's call.
  return {
    suggestion: "either",
    reasons,
    answer: `It comes down to how soon you need to be in ${dest}. Rebooking on ${best.flight.flightNo} ${whenLine}${costLine}. If waiting that long doesn't work for you, take the full refund of ${inr(
      refundAmt
    )} and make other plans.${careLine}${compLine}`,
  };
}
