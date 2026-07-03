import { beforeEach, describe, expect, it } from "vitest";
import { store } from "@/lib/store";
import { buildSeatMap, firstFreeSeat } from "@/lib/seatmap";
import { POST as rebook } from "../rebook/route";
import { POST as seatmap } from "./route";

/** A free seat inside the reserved priority zone. Opens the cabin up first — a
 *  near-full flight may have no free priority seat, which isn't what we're
 *  testing here. */
function freePrioritySeat(flightId: string): string {
  store.getFlight(flightId)!.seatsAvailable = 170;
  const map = buildSeatMap(store.getFlight(flightId)!, store.seatsTaken(flightId));
  return map.seats.find((s) => !s.occupied && s.priority)!.id;
}

// The seat map endpoint is authoritative, and the rebook endpoint validates a
// chosen seat against it — two passengers can never land on the same seat.

const post = (body: unknown) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const json = async (res: Response) => ({
  status: res.status,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: (await res.json()) as any,
});

beforeEach(() => store.reset());

describe("POST /api/seatmap", () => {
  it("returns a map with free seats matching availability", async () => {
    const r = await json(
      await seatmap(post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303" }))
    );
    expect(r.status).toBe(200);
    const free = r.body.seatMap.seats.filter((s: { occupied: boolean }) => !s.occupied);
    expect(free).toHaveLength(store.getFlight("SJ303")!.seatsAvailable);
  });

  it("rejects a wrong last name", async () => {
    const r = await json(
      await seatmap(post({ ref: "SJ7QK2", lastName: "Wrong", flightId: "SJ303" }))
    );
    expect(r.status).toBe(404);
  });

  it("refuses a flight that is not a rebooking option", async () => {
    // SJ415 is a different route (BOM→SIN), so it can't be rebooked from SJ7QK2.
    const r = await json(
      await seatmap(post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ415" }))
    );
    expect(r.status).toBe(409);
  });
});

describe("POST /api/rebook with a chosen seat", () => {
  it("assigns the chosen seat to the boarding pass", async () => {
    const seat = firstFreeSeat(buildSeatMap(store.getFlight("SJ303")!))!;
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", seat, idempotencyKey: "k1" })
      )
    );
    expect(r.status).toBe(201);
    expect(r.body.boardingPass.seat).toBe(seat);
  });

  it("rejects an already-occupied seat", async () => {
    const occupied = buildSeatMap(store.getFlight("SJ303")!).seats.find((s) => s.occupied)!.id;
    const r = await json(
      await rebook(
        post({
          ref: "SJ7QK2",
          lastName: "Sharma",
          flightId: "SJ303",
          seat: occupied,
          idempotencyKey: "k1",
        })
      )
    );
    expect(r.status).toBe(409);
  });

  it("returns the passenger's allocation priority and a held seat", async () => {
    // Aarav Sharma is a senior citizen → 1st priority.
    const r = await json(
      await seatmap(post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303" }))
    );
    expect(r.body.priority.tier).toBe("SENIOR");
    expect(r.body.priority.rank).toBe(1);
    expect(typeof r.body.recommendedSeat).toBe("string");
  });

  it("blocks a standard passenger from a reserved priority seat", async () => {
    // Ishaan Gupta has no priority attributes → standard.
    const seat = freePrioritySeat("SJ303");
    const r = await json(
      await rebook(
        post({ ref: "SJ2MN1", lastName: "Gupta", flightId: "SJ303", seat, idempotencyKey: "p1" })
      )
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/reserved/i);
  });

  it("lets a senior citizen take a priority seat", async () => {
    const seat = freePrioritySeat("SJ303");
    const r = await json(
      await rebook(
        post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", seat, idempotencyKey: "p2" })
      )
    );
    expect(r.status).toBe(201);
    expect(r.body.boardingPass.seat).toBe(seat);
  });

  it("stops two passengers taking the same seat", async () => {
    const seat = firstFreeSeat(buildSeatMap(store.getFlight("SJ303")!))!;
    // Aarav Sharma takes the seat…
    await rebook(
      post({ ref: "SJ7QK2", lastName: "Sharma", flightId: "SJ303", seat, idempotencyKey: "k1" })
    );
    // …Ishaan Gupta (also off the cancelled SJ301) tries the very same seat.
    const r = await json(
      await rebook(
        post({ ref: "SJ2MN1", lastName: "Gupta", flightId: "SJ303", seat, idempotencyKey: "k2" })
      )
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/taken/i);
  });
});
