import { describe, expect, it } from "vitest";
import { computePriority } from "./priority";
import type { Booking, Passenger } from "./types";

const pax = (over: Partial<Passenger> = {}): Passenger => ({
  id: "PAX",
  firstName: "Test",
  lastName: "Traveller",
  email: "t•••••@x.com",
  tier: "STANDARD",
  ...over,
});

const bk = (over: Partial<Booking> = {}): Booking => ({
  ref: "AAAAAA",
  passenger: pax(),
  flightId: "SJ1",
  status: "CONFIRMED",
  cabin: "ECONOMY",
  fareClass: "V",
  farePaid: 10000,
  specialFlags: [],
  partySize: 1,
  createdAt: "2026-07-01T00:00:00Z",
  version: 0,
  ...over,
});

describe("computePriority", () => {
  it("ranks senior citizens first", () => {
    expect(computePriority(bk({ passenger: pax({ isSenior: true }) })).rank).toBe(1);
  });

  it("ranks business class second", () => {
    expect(computePriority(bk({ cabin: "BUSINESS" })).rank).toBe(2);
  });

  it("ranks children / infant travellers third", () => {
    expect(computePriority(bk({ withInfant: true })).rank).toBe(3);
    expect(computePriority(bk({ passenger: pax({ isChild: true }) })).rank).toBe(3);
  });

  it("ranks everyone else standard (fourth)", () => {
    expect(computePriority(bk()).rank).toBe(4);
    expect(computePriority(bk()).tier).toBe("STANDARD");
  });

  it("takes the highest qualifying priority (senior business beats business)", () => {
    const p = computePriority(bk({ cabin: "BUSINESS", passenger: pax({ isSenior: true }) }));
    expect(p.tier).toBe("SENIOR");
  });
});
