import { describe, expect, it } from "vitest";
import {
  classifyCause,
  classifyDisruption,
  compensationTier,
  evaluateEligibility,
} from "./eligibility";
import type { Booking, DisruptionCause, Flight, FlightStatus } from "./types";

function makeFlight(over: Partial<Flight> = {}): Flight {
  return {
    id: "SJTEST",
    flightNo: "SJ TEST",
    origin: "DEL",
    originCity: "New Delhi",
    destination: "BKK",
    destinationCity: "Bangkok",
    departure: "2026-07-03T04:30:00Z",
    arrival: "2026-07-03T08:50:00Z",
    durationMin: 260,
    status: "SCHEDULED",
    cause: "NONE",
    delayMinutes: 0,
    aircraft: "A320neo",
    cabin: "ECONOMY",
    seatsAvailable: 20,
    fare: 18000,
    opsStatus: "ON_TIME",
    ...over,
  };
}

function makeBooking(over: Partial<Booking> = {}): Booking {
  return {
    ref: "SJTEST",
    passenger: {
      id: "PAX",
      firstName: "Test",
      lastName: "User",
      email: "t@x.com",
      tier: "STANDARD",
    },
    flightId: "SJTEST",
    status: "CONFIRMED",
    cabin: "ECONOMY",
    fareClass: "V",
    farePaid: 18500,
    specialFlags: [],
    partySize: 1,
    createdAt: "2026-06-30T00:00:00Z",
    version: 0,
    ...over,
  };
}

describe("classifyCause", () => {
  it("treats weather / ATC / security as extraordinary", () => {
    for (const c of ["WEATHER", "ATC", "SECURITY"] as DisruptionCause[]) {
      expect(classifyCause(c)).toBe("EXTRAORDINARY");
    }
  });
  it("treats technical / crew / operational as airline-controlled", () => {
    for (const c of ["TECHNICAL", "CREW", "OPERATIONAL"] as DisruptionCause[]) {
      expect(classifyCause(c)).toBe("AIRLINE_CONTROLLED");
    }
  });
});

describe("classifyDisruption", () => {
  it("flags cancellations", () => {
    expect(classifyDisruption(makeFlight({ status: "CANCELLED" }))).toBe(
      "CANCELLED"
    );
  });
  it("flags delays >= 3h as LONG_DELAY", () => {
    expect(
      classifyDisruption(
        makeFlight({ status: "DELAYED", delayMinutes: 180 })
      )
    ).toBe("LONG_DELAY");
  });
  it("ignores short delays", () => {
    expect(
      classifyDisruption(
        makeFlight({ status: "DELAYED" as FlightStatus, delayMinutes: 90 })
      )
    ).toBe("NONE");
  });
});

describe("compensationTier (DGCA block-time tiers)", () => {
  it("bands correctly", () => {
    expect(compensationTier(60)).toBe(5000);
    expect(compensationTier(120)).toBe(7500);
    expect(compensationTier(121)).toBe(10000);
    expect(compensationTier(330)).toBe(10000);
  });
});

describe("evaluateEligibility", () => {
  it("weather cancellation: refund + rebook + meals, but NO cash compensation", () => {
    const flight = makeFlight({ status: "CANCELLED", cause: "WEATHER" });
    const r = evaluateEligibility(makeBooking(), flight);

    expect(r.disruption).toBe("CANCELLED");
    expect(r.causeCategory).toBe("EXTRAORDINARY");
    expect(r.refund.eligible).toBe(true);
    expect(r.refund.amount).toBe(18500);
    expect(r.rebook.eligible).toBe(true);
    expect(r.compensation.eligible).toBe(false);
    expect(r.compensation.amount).toBe(0);
    expect(r.dutyOfCare.meals).toBe(true);
    expect(r.compensation.reason).toMatch(/extraordinary/i);
  });

  it("technical cancellation: adds tiered cash compensation", () => {
    const flight = makeFlight({
      status: "CANCELLED",
      cause: "TECHNICAL",
      durationMin: 330,
    });
    const r = evaluateEligibility(makeBooking(), flight);

    expect(r.causeCategory).toBe("AIRLINE_CONTROLLED");
    expect(r.compensation.eligible).toBe(true);
    expect(r.compensation.amount).toBe(10000);
    expect(r.refund.eligible).toBe(true);
  });

  it("long weather delay: refund + meals, no compensation, no hotel under 6h", () => {
    const flight = makeFlight({
      status: "DELAYED",
      cause: "WEATHER",
      delayMinutes: 300,
    });
    const r = evaluateEligibility(makeBooking(), flight);

    expect(r.disruption).toBe("LONG_DELAY");
    expect(r.refund.eligible).toBe(true);
    expect(r.compensation.eligible).toBe(false);
    expect(r.dutyOfCare.meals).toBe(true);
    expect(r.dutyOfCare.hotel).toBe(false);
  });

  it("overnight delay (>= 6h) grants a hotel", () => {
    const flight = makeFlight({
      status: "DELAYED",
      cause: "TECHNICAL",
      delayMinutes: 420,
    });
    const r = evaluateEligibility(makeBooking(), flight);
    expect(r.dutyOfCare.hotel).toBe(true);
  });

  it("on-time flight: nothing owed", () => {
    const r = evaluateEligibility(makeBooking(), makeFlight());
    expect(r.disruption).toBe("NONE");
    expect(r.refund.eligible).toBe(false);
    expect(r.rebook.eligible).toBe(false);
    expect(r.compensation.eligible).toBe(false);
  });
});
