import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateEscalation,
  getRebookingOptions,
  makeBoardingPass,
  scoreOption,
} from "./service";
import { store } from "./store";

beforeEach(() => store.reset());

describe("scoreOption", () => {
  const original = store.getFlight("SJ301")!;

  it("prefers a same-day option over next-day", () => {
    const sameDay = scoreOption(original, store.getFlight("SJ303")!);
    const nextDay = scoreOption(original, store.getFlight("SJ309")!);
    expect(sameDay.score).toBeGreaterThan(nextDay.score);
    expect(sameDay.reason).toMatch(/Same day/);
    expect(nextDay.reason).toMatch(/Next day/);
  });

  it("penalises departing later", () => {
    const soon = scoreOption(original, store.getFlight("SJ303")!); // +3h
    const late = scoreOption(original, store.getFlight("SJ307")!); // +9h
    expect(soon.score).toBeGreaterThan(late.score);
  });

  it("always explains itself in plain English", () => {
    const { reason } = scoreOption(original, store.getFlight("SJ303")!);
    expect(reason).toMatch(/later|shortly after/);
    expect(reason).toMatch(/direct/);
  });
});

describe("getRebookingOptions", () => {
  it("filters out full flights and recommends the best one first", () => {
    const options = getRebookingOptions(store.getBooking("SJ7QK2")!);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.some((o) => o.flight.id === "SJ305")).toBe(false); // 0 seats
    expect(options[0].recommended).toBe(true);
    expect(options[0].flight.id).toBe("SJ303"); // earliest same-day with seats
    expect(options.filter((o) => o.recommended)).toHaveLength(1);
  });

  it("only offers the same route", () => {
    const options = getRebookingOptions(store.getBooking("SJ7QK2")!);
    for (const o of options) {
      expect(o.flight.origin).toBe("DEL");
      expect(o.flight.destination).toBe("BKK");
    }
  });
});

describe("evaluateEscalation", () => {
  it("escalates an unaccompanied minor with a stated reason", () => {
    const r = evaluateEscalation(store.getBooking("SJ2MN1")!);
    expect(r.escalate).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/minor/i);
  });

  it("does not escalate a routine disruption", () => {
    const r = evaluateEscalation(store.getBooking("SJ7QK2")!);
    expect(r.escalate).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("escalates when no self-service rebooking exists", () => {
    // Remove every alternative for the cancelled DEL→BKK flight.
    for (const id of ["SJ303", "SJ307", "SJ309"]) {
      store.getFlight(id)!.seatsAvailable = 0;
    }
    const r = evaluateEscalation(store.getBooking("SJ7QK2")!);
    expect(r.escalate).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/no self-service rebooking/i);
  });
});

describe("makeBoardingPass", () => {
  it("is deterministic for the same booking", () => {
    const booking = store.getBooking("SJ7QK2")!;
    const flight = store.getFlight("SJ303")!;
    const a = makeBoardingPass(booking, flight);
    const b = makeBoardingPass(booking, flight);
    expect(a).toEqual(b);
    expect(a.seat).toMatch(/^\d{1,2}[A-F]$/);
    expect(Date.parse(a.boarding)).toBeLessThan(Date.parse(flight.departure));
  });
});
