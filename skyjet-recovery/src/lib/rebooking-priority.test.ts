import { describe, expect, it } from "vitest";
import { capacityFor, competingBookings, higherPriorityWaiting } from "./rebooking-priority";
import type { Booking, Flight, Passenger } from "./types";

const pax = (over: Partial<Passenger> = {}): Passenger => ({
  id: "PAX",
  firstName: "Test",
  lastName: "Traveller",
  email: "t•••••@x.com",
  tier: "STANDARD",
  ...over,
});

const bk = (ref: string, over: Partial<Booking> = {}): Booking => ({
  ref,
  passenger: pax(),
  flightId: "SRC",
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

const flight = (id: string, over: Partial<Flight> = {}): Flight => ({
  id,
  flightNo: id,
  origin: "DEL",
  originCity: "New Delhi",
  destination: "DXB",
  destinationCity: "Dubai",
  departure: "2026-07-03T06:00:00Z",
  arrival: "2026-07-03T10:00:00Z",
  durationMin: 240,
  status: "SCHEDULED",
  cause: "NONE",
  delayMinutes: 0,
  aircraft: "A320neo",
  cabin: "ECONOMY",
  seatsAvailable: 2,
  fare: 18000,
  opsStatus: "ON_TIME",
  ...over,
});

// Source flight (cancelled) all four passengers were on.
const SRC = flight("SRC", { status: "CANCELLED", cause: "WEATHER", seatsAvailable: 0 });
const senior = bk("SNR", { passenger: pax({ isSenior: true }) });
const business = bk("BUS", { cabin: "BUSINESS" });
const infant = bk("INF", { withInfant: true });
const standard = bk("STD");
const all = [senior, business, infant, standard];
const flightOf = (fid: string) => (fid === "SRC" ? SRC : undefined);

describe("competingBookings", () => {
  it("includes other unaccommodated passengers on the same disrupted route", () => {
    const comp = competingBookings(standard, all, flightOf);
    expect(comp.map((b) => b.ref).sort()).toEqual(["BUS", "INF", "SNR"]);
  });

  it("excludes passengers already re-accommodated (rebooked / refunded)", () => {
    const comp = competingBookings(standard, [senior, bk("BUS", { cabin: "BUSINESS", status: "REBOOKED" }), infant, standard], flightOf);
    expect(comp.map((b) => b.ref).sort()).toEqual(["INF", "SNR"]);
  });
});

describe("higherPriorityWaiting", () => {
  it("counts only strictly higher-priority competitors", () => {
    // standard (rank 4): senior+business+infant all outrank → 3
    expect(higherPriorityWaiting(standard, [senior, business, infant])).toBe(3);
    // business (rank 2): only senior outranks → 1
    expect(higherPriorityWaiting(business, [senior, infant, standard])).toBe(1);
    // senior (rank 1): nobody outranks → 0
    expect(higherPriorityWaiting(senior, [business, infant, standard])).toBe(0);
  });
});

describe("capacityFor — seats held for higher priority", () => {
  // 2 seats on the alternative; all four still competing.
  const target = () => flight("ALT", { seatsAvailable: 2 });

  it("lets the senior (top priority) take a seat", () => {
    expect(capacityFor(senior, target(), [business, infant, standard]).available).toBe(true);
  });

  it("lets business take a seat (only 1 higher, 2 seats)", () => {
    expect(capacityFor(business, target(), [senior, infant, standard]).available).toBe(true);
  });

  it("waitlists the infant — 2 higher waiting, only 2 seats", () => {
    const d = capacityFor(infant, target(), [senior, business, standard]);
    expect(d.available).toBe(false);
    expect(d.heldForHigherPriority).toBe(2);
    expect(d.note).toMatch(/waitlist/i);
  });

  it("waitlists the standard passenger — 3 higher waiting", () => {
    expect(capacityFor(standard, target(), [senior, business, infant]).available).toBe(false);
  });

  it("frees the held seat once higher-priority passengers are accommodated", () => {
    // Senior + business already rebooked away → no longer competing; 1 seat left.
    const oneLeft = flight("ALT", { seatsAvailable: 1 });
    expect(capacityFor(infant, oneLeft, [standard]).available).toBe(true);
  });

  it("reports a full flight plainly", () => {
    const d = capacityFor(senior, flight("ALT", { seatsAvailable: 0 }), []);
    expect(d.available).toBe(false);
    expect(d.note).toMatch(/full/i);
  });
});
