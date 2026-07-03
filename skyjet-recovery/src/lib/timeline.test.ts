import { describe, expect, it } from "vitest";
import { buildFlightTimeline, currentTimelineStep } from "./timeline";
import type { Flight } from "./types";

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: "SJ522",
  flightNo: "SJ 522",
  origin: "BLR",
  originCity: "Bengaluru",
  destination: "DXB",
  destinationCity: "Dubai",
  departure: "2026-07-03T02:30:00Z",
  arrival: "2026-07-03T06:30:00Z",
  durationMin: 240,
  status: "SCHEDULED",
  cause: "NONE",
  delayMinutes: 0,
  aircraft: "A320neo",
  cabin: "ECONOMY",
  seatsAvailable: 25,
  fare: 24000,
  opsStatus: "ON_TIME",
  ...over,
});

const keys = (f: Flight) => buildFlightTimeline(f).map((s) => s.key);
const current = (f: Flight) => currentTimelineStep(f).key;

describe("buildFlightTimeline", () => {
  it("has exactly one current step", () => {
    for (const f of [
      flight(),
      flight({ status: "DELAYED", delayMinutes: 300, cause: "WEATHER" }),
      flight({ status: "CANCELLED", cause: "TECHNICAL" }),
      flight({ opsStatus: "BOARDING" }),
    ]) {
      expect(buildFlightTimeline(f).filter((s) => s.state === "current")).toHaveLength(1);
    }
  });

  it("stops at Cancelled for a cancelled flight", () => {
    const f = flight({ status: "CANCELLED", cause: "TECHNICAL" });
    expect(keys(f)).toEqual(["scheduled", "cancelled"]);
    const cancelled = buildFlightTimeline(f)[1];
    expect(cancelled.state).toBe("current");
    expect(cancelled.tone).toBe("danger");
  });

  it("inserts a Delayed step and makes it current before boarding", () => {
    const f = flight({ status: "DELAYED", delayMinutes: 300, cause: "WEATHER" });
    expect(keys(f)).toContain("delayed");
    expect(current(f)).toBe("delayed");
    const delayed = buildFlightTimeline(f).find((s) => s.key === "delayed")!;
    expect(delayed.tone).toBe("warn");
    expect(delayed.detail).toContain("5h");
  });

  it("advances the current step as boarding progresses", () => {
    expect(current(flight({ opsStatus: "ON_TIME" }))).toBe("scheduled");
    expect(current(flight({ opsStatus: "REPORTING" }))).toBe("reporting");
    expect(current(flight({ opsStatus: "BOARDING" }))).toBe("boarding");
    expect(current(flight({ opsStatus: "DEPARTED" }))).toBe("departed");
  });

  it("keeps a passed delay as done once the flight moves on", () => {
    const f = flight({ status: "DELAYED", delayMinutes: 120, opsStatus: "BOARDING" });
    const delayed = buildFlightTimeline(f).find((s) => s.key === "delayed")!;
    expect(delayed.state).toBe("done");
    expect(current(f)).toBe("boarding");
  });
});
