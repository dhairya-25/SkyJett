import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/ratelimit";
import { store } from "@/lib/store";
import { POST as assist } from "./assist/route";
import { POST as escalate } from "./escalate/route";
import { POST as lookup } from "./lookup/route";
import { POST as rebook } from "./rebook/route";
import { POST as refund } from "./refund/route";

// Contract tests for the API surface: authentication on every write, the
// booking state machine (refund XOR rebook), idempotent replay, optimistic
// locking, and selection revalidation.

const post = (body: unknown) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const json = async (res: Response) => ({
  status: res.status,
  replay: res.headers.get("idempotent-replay"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: (await res.json()) as any,
});

beforeEach(() => {
  store.reset();
  resetRateLimits();
  // Force the deterministic keyword path — these tests must never hit the network.
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("PINECONE_API_KEY", "");
});

describe("POST /api/lookup", () => {
  it("returns the booking view for a valid PNR + last name", async () => {
    const r = await json(await lookup(post({ pnr: "SJ7QK2", lastName: "Sharma" })));
    expect(r.status).toBe(200);
    expect(r.body.flight.status).toBe("CANCELLED");
    expect(r.body.eligibility.compensation.eligible).toBe(false); // weather
    expect(r.body.options.length).toBeGreaterThan(0);
  });

  it("rejects a wrong last name", async () => {
    const r = await json(await lookup(post({ pnr: "SJ7QK2", lastName: "Wrong" })));
    expect(r.status).toBe(404);
  });

  it("rate-limits repeated attempts", async () => {
    let last = 200;
    for (let i = 0; i < 40; i++) {
      last = (await lookup(post({ pnr: "SJ7QK2", lastName: "Wrong" }))).status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/rebook", () => {
  it("requires the last name (authenticated writes)", async () => {
    const r = await json(
      await rebook(post({ ref: "SJ7QK2", flightId: "SJ303", idempotencyKey: "k" }))
    );
    expect(r.status).toBe(400);
  });

  it("rejects a wrong last name", async () => {
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Wrong", flightId: "SJ303", idempotencyKey: "k" })
      )
    );
    expect(r.status).toBe(404);
  });

  it("rebooks, takes a seat, and issues a boarding pass", async () => {
    const before = store.getFlight("SJ303")!.seatsAvailable;
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" })
      )
    );
    expect(r.status).toBe(201);
    expect(r.body.booking.status).toBe("REBOOKED");
    expect(r.body.boardingPass.flightNo).toBe("SJ 303");
    expect(store.getFlight("SJ303")!.seatsAvailable).toBe(before - 1);
  });

  it("settles the fare difference — charges a pricier flight, refunds a cheaper one", async () => {
    // Paid ₹18,500; SJ303 fares ₹19,900 → passenger owes ₹1,400.
    const up = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" })
      )
    );
    expect(up.body.fareSettlement.difference).toBe(19900 - 18500);
    // Change to SJ307 at ₹16,800 → passenger is refunded ₹1,700 (vs. original fare).
    const down = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ307", idempotencyKey: "k2" })
      )
    );
    expect(down.body.fareSettlement.difference).toBe(16800 - 18500);
  });

  it("replays the same idempotency key without double-booking", async () => {
    const body = { ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" };
    await rebook(post(body));
    const seats = store.getFlight("SJ303")!.seatsAvailable;
    const r = await json(await rebook(post(body)));
    expect(r.status).toBe(200);
    expect(r.replay).toBe("true");
    expect(store.getFlight("SJ303")!.seatsAvailable).toBe(seats); // unchanged
  });

  it("releases the old seat when the passenger changes again", async () => {
    await rebook(
      post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" })
    );
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ307", idempotencyKey: "k2" })
      )
    );
    expect(r.status).toBe(201);
    expect(store.getFlight("SJ303")!.seatsAvailable).toBe(22); // restored
    expect(store.getFlight("SJ307")!.seatsAvailable).toBe(13);
  });

  it("rejects a stale selection (flight with no seats)", async () => {
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ305", idempotencyKey: "k" })
      )
    );
    expect(r.status).toBe(409);
  });

  it("rejects a write from a stale booking version", async () => {
    await rebook(
      post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" })
    );
    const r = await json(
      await rebook(
        post({
          ref: "SJ7QK2",
          lastName: "Sharma",
          flightId: "SJ307",
          idempotencyKey: "k2",
          expectedVersion: 0, // booking is now at version 1
        })
      )
    );
    expect(r.status).toBe(409);
  });

  it("blocks rebooking after a refund was requested (no double-dip)", async () => {
    await refund(post({ ref: "SJ7QK2", lastName: "Sharma", idempotencyKey: "r1" }));
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k" })
      )
    );
    expect(r.status).toBe(409);
  });
});

describe("POST /api/refund", () => {
  it("initiates a refund with a reference number", async () => {
    const r = await json(
      await refund(post({ ref: "SJ7QK2", lastName: "Sharma", idempotencyKey: "r1" }))
    );
    expect(r.status).toBe(201);
    expect(r.body.booking.status).toBe("REFUND_REQUESTED");
    expect(r.body.refund.reference).toMatch(/^RF-/);
    expect(r.body.refund.amount).toBe(18500);
  });

  it("blocks a refund after a rebooking (no double-dip)", async () => {
    await rebook(
      post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", idempotencyKey: "k1" })
    );
    const r = await json(
      await refund(post({ ref: "SJ7QK2", lastName: "Sharma", idempotencyKey: "r1" }))
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/already rebooked/i);
  });

  it("rejects a refund on an undisrupted booking", async () => {
    // Point the booking at a scheduled flight to simulate "nothing wrong".
    store.getBooking("SJ7QK2")!.flightId = "SJ303";
    const r = await json(
      await refund(post({ ref: "SJ7QK2", lastName: "Sharma", idempotencyKey: "r1" }))
    );
    expect(r.status).toBe(409);
  });
});

describe("POST /api/escalate", () => {
  it("hands off with full context", async () => {
    const r = await json(await escalate(post({ ref: "SJ2MN1", lastName: "Gupta" })));
    expect(r.status).toBe(200);
    expect(r.body.handoff.reference).toMatch(/^AG-/);
    expect(r.body.handoff.context.join(" ")).toMatch(/minor/i);
  });

  it("asking again joins the same case instead of opening a duplicate", async () => {
    const a = await json(await escalate(post({ ref: "SJ2MN1", lastName: "Gupta" })));
    const b = await json(await escalate(post({ ref: "SJ2MN1", lastName: "Gupta" })));
    expect(b.body.handoff.reference).toBe(a.body.handoff.reference);
  });
});

describe("POST /api/assist", () => {
  it("answers from policy with citations", async () => {
    const r = await json(await assist(post({ query: "Am I owed a hotel tonight?" })));
    expect(r.status).toBe(200);
    expect(r.body.citations.length).toBeGreaterThan(0);
    expect(r.body.answer).toMatch(/hotel/i);
  });

  it("personalises only with a verified PNR + last name", async () => {
    const generic = await json(
      await assist(post({ query: "can I get compensation", ref: "SJ4RM9" }))
    );
    const verified = await json(
      await assist(
        post({ query: "can I get compensation", ref: "SJ4RM9", lastName: "Nair" })
      )
    );
    expect(generic.body.answer).not.toMatch(/Based on your flight/);
    expect(verified.body.answer).toMatch(/Based on your flight SJ 415/);
  });
});
