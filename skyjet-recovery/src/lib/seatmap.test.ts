import { describe, expect, it } from "vitest";
import {
  allocateSeat,
  buildSeatMap,
  firstFreeSeat,
  hasFreeNonPrioritySeat,
  isSeatFree,
  seatSelectable,
  totalSeatsOf,
} from "./seatmap";
import type { Flight } from "./types";

// The seat map is derived deterministically from the flight so the server (which
// validates a pick) and the client (which draws the plane) always agree.

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: "SJ303",
  flightNo: "SJ 303",
  origin: "DEL",
  originCity: "New Delhi",
  destination: "BKK",
  destinationCity: "Bangkok",
  departure: "2026-07-03T07:30:00Z",
  arrival: "2026-07-03T11:50:00Z",
  durationMin: 260,
  status: "SCHEDULED",
  cause: "NONE",
  delayMinutes: 0,
  aircraft: "A320neo",
  cabin: "ECONOMY",
  seatsAvailable: 22,
  fare: 18000,
  opsStatus: "ON_TIME",
  ...over,
});

describe("buildSeatMap", () => {
  it("leaves exactly `seatsAvailable` seats free", () => {
    const map = buildSeatMap(flight({ seatsAvailable: 22 }));
    const free = map.seats.filter((s) => !s.occupied);
    expect(free).toHaveLength(22);
    expect(map.available).toBe(22);
    expect(map.total).toBe(totalSeatsOf(flight()));
  });

  it("is deterministic — same flight, same occupancy", () => {
    const a = buildSeatMap(flight());
    const b = buildSeatMap(flight());
    expect(a.seats.map((s) => s.occupied)).toEqual(b.seats.map((s) => s.occupied));
  });

  it("keeps the base fill stable as specific seats are booked (no jitter)", () => {
    const free0 = firstFreeSeat(buildSeatMap(flight({ seatsAvailable: 22 })))!;
    // Book that seat: seatsAvailable drops to 21, the seat joins `booked`.
    const after = buildSeatMap(flight({ seatsAvailable: 21 }), new Set([free0]));
    // Still 21 free, and the only newly-occupied seat is the one we booked.
    expect(after.seats.filter((s) => !s.occupied)).toHaveLength(21);
    expect(isSeatFree(after, free0)).toBe(false);
  });

  it("marks the leading rows as a business cabin", () => {
    const map = buildSeatMap(flight());
    expect(map.seats.find((s) => s.id === "1A")!.cabin).toBe("BUSINESS");
    expect(map.seats.find((s) => s.id === "10A")!.cabin).toBe("ECONOMY");
  });

  it("a full flight has no free seats", () => {
    const map = buildSeatMap(flight({ seatsAvailable: 0 }));
    expect(map.seats.every((s) => s.occupied)).toBe(true);
    expect(firstFreeSeat(map)).toBeUndefined();
  });

  it("marks the front rows as the priority zone", () => {
    const map = buildSeatMap(flight());
    expect(map.seats.find((s) => s.id === "1A")!.priority).toBe(true);
    expect(map.seats.find((s) => s.id === `${map.priorityRows}A`)!.priority).toBe(true);
    expect(map.seats.find((s) => s.id === `${map.priorityRows + 1}A`)!.priority).toBe(false);
  });
});

describe("priority seat allocation", () => {
  it("holds a front (priority-zone) seat for a priority passenger", () => {
    const map = buildSeatMap(flight({ seatsAvailable: 170 }));
    const seat = map.seats.find((s) => s.id === allocateSeat(map, 1))!; // senior
    expect(seat.priority).toBe(true);
    expect(seat.row).toBeLessThanOrEqual(map.priorityRows);
  });

  it("keeps a standard passenger out of the priority zone", () => {
    const map = buildSeatMap(flight({ seatsAvailable: 170 }));
    const seat = map.seats.find((s) => s.id === allocateSeat(map, 4))!; // standard
    expect(seat.priority).toBe(false);
  });

  it("lets a standard passenger take a priority seat only if nothing else is free", () => {
    const map = buildSeatMap(flight({ seatsAvailable: 170 }));
    const priorityFree = map.seats.find((s) => !s.occupied && s.priority)!;
    // A priority passenger may always sit there; a standard one may not (while
    // non-priority seats remain).
    expect(seatSelectable(map, priorityFree.id, 1)).toBe(true);
    expect(hasFreeNonPrioritySeat(map)).toBe(true);
    expect(seatSelectable(map, priorityFree.id, 4)).toBe(false);
  });
});
