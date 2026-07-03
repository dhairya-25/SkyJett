import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_ADMIN_TOKEN } from "@/lib/admin-auth";
import { evaluateEligibility } from "@/lib/eligibility";
import { buildBookingView, getRebookingOptions } from "@/lib/service";
import { store } from "@/lib/store";
import { POST as updateFlight } from "./flight/route";
import { GET as listFlights } from "./flights/route";

// Contract tests for the ops/admin surface: bearer-token auth on every call,
// the flight mutation set (delay / boarding progress / cancellation), and the
// key end-to-end guarantee — an ops change drives the passenger's eligibility.

const authedPost = (body: unknown) =>
  new Request("http://test.local/api/admin/flight", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${DEV_ADMIN_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

beforeEach(() => {
  store.reset();
  vi.stubEnv("ADMIN_TOKEN", ""); // force the deterministic dev-fallback token
});

describe("GET /api/admin/flights", () => {
  it("rejects a request with no token", async () => {
    const res = await listFlights(new Request("http://test.local/api/admin/flights"));
    expect(res.status).toBe(401);
  });

  it("returns the flight worklist with a valid token", async () => {
    const res = await listFlights(
      new Request("http://test.local/api/admin/flights", {
        headers: { authorization: `Bearer ${DEV_ADMIN_TOKEN}` },
      })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.flights.length).toBeGreaterThan(0);
  });
});

describe("POST /api/admin/flight", () => {
  it("requires authorization", async () => {
    const res = await updateFlight(
      new Request("http://test.local/api/admin/flight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flightId: "SJ522", delayMinutes: 400 }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("updates the estimated delay — and the passenger's entitlements follow", async () => {
    // Before: SJ522 is delayed 300m → below the 360m hotel threshold.
    expect(evaluateEligibility(store.getBooking("SJ8XP5")!, store.getFlight("SJ522")!).dutyOfCare.hotel).toBe(false);

    const res = await updateFlight(authedPost({ flightId: "SJ522", delayMinutes: 400, cause: "WEATHER" }));
    expect(res.status).toBe(200);
    expect(store.getFlight("SJ522")!.delayMinutes).toBe(400);

    // After: 400m ≥ 360m → the eligibility engine now grants a hotel, live.
    expect(evaluateEligibility(store.getBooking("SJ8XP5")!, store.getFlight("SJ522")!).dutyOfCare.hotel).toBe(true);
  });

  it("marks a flight boarding, then departed (and drops it from rebooking options)", async () => {
    const a = await json(await updateFlight(authedPost({ flightId: "SJ303", opsStatus: "BOARDING" })));
    expect(a.body.flight.opsStatus).toBe("BOARDING");

    const b = await json(await updateFlight(authedPost({ flightId: "SJ303", opsStatus: "DEPARTED" })));
    expect(b.body.flight.opsStatus).toBe("DEPARTED");

    const opts = getRebookingOptions(store.getBooking("SJ7QK2")!);
    expect(opts.some((o) => o.flight.id === "SJ303")).toBe(false);
  });

  it("cancels a flight and zeroes its seats", async () => {
    const r = await json(await updateFlight(authedPost({ flightId: "SJ417", status: "CANCELLED", cause: "TECHNICAL" })));
    expect(r.body.flight.status).toBe("CANCELLED");
    expect(store.getFlight("SJ417")!.seatsAvailable).toBe(0);
  });

  it("404s an unknown flight and 400s an empty change", async () => {
    expect((await updateFlight(authedPost({ flightId: "ZZ999", delayMinutes: 30 }))).status).toBe(404);
    expect((await updateFlight(authedPost({ flightId: "SJ303" }))).status).toBe(400);
  });

  it("records each change on the ops feed", async () => {
    await updateFlight(authedPost({ flightId: "SJ522", opsStatus: "REPORTING" }));
    expect(store.opsLog[0].flightId).toBe("SJ522");
    expect(store.opsLog[0].summary).toMatch(/reporting/i);
  });
});

describe("POST /api/admin/flight — goodwill gesture", () => {
  const gesture = (over = {}) => ({
    freeMeal: true,
    freeAccommodation: true,
    discountPercent: 10,
    ...over,
  });

  it("attaches a goodwill gesture — and the passenger on that flight sees it", async () => {
    // SJ301 carries PNR SJ7QK2 (Aarav Sharma). No gesture to start.
    expect(buildBookingView(store.getBooking("SJ7QK2")!).flight.goodwill).toBeUndefined();

    const res = await json(
      await updateFlight(
        authedPost({ flightId: "SJ301", goodwill: gesture({ message: "Sorry!" }) })
      )
    );
    expect(res.status).toBe(200);
    expect(res.body.flight.goodwill).toMatchObject({
      freeMeal: true,
      freeAccommodation: true,
      discountPercent: 10,
      message: "Sorry!",
    });
    // A trackable reference is stamped server-side.
    expect(res.body.flight.goodwill.reference).toMatch(/^GW-/);

    // End-to-end: it flows through to the passenger's booking view.
    const passengerView = buildBookingView(store.getBooking("SJ7QK2")!);
    expect(passengerView.flight.goodwill?.discountPercent).toBe(10);
  });

  it("keeps the same reference when the gesture is edited", async () => {
    const first = await json(
      await updateFlight(authedPost({ flightId: "SJ301", goodwill: gesture() }))
    );
    const ref = first.body.flight.goodwill.reference;

    const second = await json(
      await updateFlight(
        authedPost({ flightId: "SJ301", goodwill: gesture({ discountPercent: 25 }) })
      )
    );
    expect(second.body.flight.goodwill.reference).toBe(ref);
    expect(second.body.flight.goodwill.discountPercent).toBe(25);
  });

  it("clears the gesture with null, and treats an all-empty gesture as a clear", async () => {
    await updateFlight(authedPost({ flightId: "SJ301", goodwill: gesture() }));
    expect(store.getFlight("SJ301")!.goodwill).toBeDefined();

    await updateFlight(authedPost({ flightId: "SJ301", goodwill: null }));
    expect(store.getFlight("SJ301")!.goodwill).toBeUndefined();

    // An empty gesture (no perks selected) is a no-op / clear, never a phantom.
    await updateFlight(
      authedPost({
        flightId: "SJ301",
        goodwill: { freeMeal: false, freeAccommodation: false, discountPercent: 0 },
      })
    );
    expect(store.getFlight("SJ301")!.goodwill).toBeUndefined();
  });

  it("records the gesture on the ops feed and rejects an out-of-range discount", async () => {
    await updateFlight(authedPost({ flightId: "SJ301", goodwill: gesture() }));
    expect(store.opsLog[0].summary).toMatch(/goodwill/i);

    const bad = await updateFlight(
      authedPost({ flightId: "SJ301", goodwill: gesture({ discountPercent: 150 }) })
    );
    expect(bad.status).toBe(400);
  });
});
