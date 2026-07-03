import { describe, expect, it } from "vitest";
import { recommendAction, wantsAdvice, type RecommendInput } from "./advisor";
import type { EligibilityResult } from "./eligibility";
import type { RebookOption } from "./service";
import type { Flight } from "./types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE = Date.parse("2026-07-03T04:00:00Z"); // 09:30 IST
const iso = (hFromBase: number) => new Date(BASE + hFromBase * 3_600_000).toISOString();

function flight(over: Partial<Flight> = {}): Flight {
  return {
    id: "SJ522",
    flightNo: "SJ 522",
    origin: "BLR",
    originCity: "Bengaluru",
    destination: "DXB",
    destinationCity: "Dubai",
    departure: iso(0),
    arrival: iso(4),
    durationMin: 240,
    status: "DELAYED",
    cause: "WEATHER",
    delayMinutes: 300,
    aircraft: "A320neo",
    cabin: "ECONOMY",
    seatsAvailable: 0,
    fare: 61000,
    ...over,
  } as Flight;
}

function eligibility(over: Partial<EligibilityResult> = {}): EligibilityResult {
  return {
    disruption: "LONG_DELAY",
    causeCategory: "EXTRAORDINARY",
    causeLabel: "Weather",
    refund: { eligible: true, amount: 61000, reason: "full refund available" },
    rebook: { eligible: true, reason: "free rebooking" },
    compensation: { eligible: false, amount: 0, reason: "no comp", ruleRef: "x" },
    dutyOfCare: { meals: true, hotel: false, reason: "Meals & refreshments" },
    headline: "…",
    ruleRef: "x",
    ...over,
  };
}

function option(over: Partial<RebookOption> = {}): RebookOption {
  return {
    flight: flight({ id: "SJ524", flightNo: "SJ 524", departure: iso(2.5), arrival: iso(6.5), status: "SCHEDULED", cause: "NONE", delayMinutes: 0, seatsAvailable: 25 }),
    score: 100,
    reason: "Same day · 3h later · direct",
    recommended: true,
    fareDiff: 0,
    available: true,
    heldForHigherPriority: 0,
    capacityNote: "",
    ...over,
  };
}

const noEscalation = { escalate: false, reasons: [] };
const input = (over: Partial<RecommendInput> = {}): RecommendInput => ({
  eligibility: eligibility(),
  options: [option()],
  flight: flight(),
  escalation: noEscalation,
  ...over,
});

// ── wantsAdvice ──────────────────────────────────────────────────────────────

describe("wantsAdvice", () => {
  it("triggers on refund-vs-rebook phrasing", () => {
    expect(wantsAdvice("should I refund or rebook?")).toBe(true);
    expect(wantsAdvice("rebook or take a refund?")).toBe(true);
    expect(wantsAdvice("what do you suggest I do")).toBe(true);
    expect(wantsAdvice("I'm confused about my options")).toBe(true);
    expect(wantsAdvice("which is better for me")).toBe(true);
  });

  it("does not trigger on plain factual questions", () => {
    expect(wantsAdvice("am I owed a hotel?")).toBe(false);
    expect(wantsAdvice("how much is the compensation")).toBe(false);
    expect(wantsAdvice("what about my baggage")).toBe(false);
  });
});

// ── recommendAction ──────────────────────────────────────────────────────────

describe("recommendAction", () => {
  it("leans rebook for a same-day, soon alternative", () => {
    const r = recommendAction(input());
    expect(r.suggestion).toBe("rebook");
    expect(r.answer).toContain("SJ 524");
    expect(r.answer.toLowerCase()).toContain("rebook");
  });

  it("mentions a fare top-up when the new flight costs more", () => {
    const r = recommendAction(input({ options: [option({ fareDiff: 1400 })] }));
    expect(r.answer).toContain("₹1,400 more");
  });

  it("leaves it to the passenger when the only option is next-day", () => {
    const nextDay = option({
      flight: flight({ id: "SJ529", flightNo: "SJ 529", departure: iso(26), arrival: iso(30), status: "SCHEDULED", cause: "NONE", delayMinutes: 0, seatsAvailable: 30 }),
    });
    const r = recommendAction(input({ options: [nextDay] }));
    expect(r.suggestion).toBe("either");
    expect(r.answer.toLowerCase()).toContain("refund");
  });

  it("suggests refund when no seat is actually available", () => {
    const held = option({ available: false, recommended: false, heldForHigherPriority: 2 });
    const r = recommendAction(input({ options: [held] }));
    expect(r.suggestion).toBe("refund");
    expect(r.answer).toContain("₹61,000");
  });

  it("defers to an agent when the booking must escalate", () => {
    const r = recommendAction(
      input({ escalation: { escalate: true, reasons: ["Unaccompanied minor — needs assisted handling"] } })
    );
    expect(r.suggestion).toBe("agent");
    expect(r.answer.toLowerCase()).toContain("agent");
  });

  it("says nothing to do when the flight is operating", () => {
    const r = recommendAction(
      input({
        eligibility: eligibility({ disruption: "NONE", refund: { eligible: false, amount: 0, reason: "n/a" } }),
        options: [],
        flight: flight({ status: "SCHEDULED", cause: "NONE", delayMinutes: 0 }),
      })
    );
    expect(r.suggestion).toBe("none");
  });
});
