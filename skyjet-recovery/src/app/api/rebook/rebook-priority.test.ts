import { beforeEach, describe, expect, it } from "vitest";
import { getRebookingOptions } from "@/lib/service";
import { store } from "@/lib/store";
import { POST as rebook } from "./route";

// End-to-end priority scheduling on the rebook endpoint, using the seeded
// scarcity scenario: SJ711 (DEL→DXB) is cancelled with four passengers of
// different priority; the same-day alternative SJ713 has only 2 seats.
//   SJ7SR1 Reddy   — senior   (rank 1)
//   SJ7BZ2 Singh   — business (rank 2)
//   SJ7IN3 Iyer    — infant   (rank 3)
//   SJ7ST4 Kapoor  — standard (rank 4)

const post = (body: unknown) =>
  new Request("http://test.local/api/rebook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any });

beforeEach(() => store.reset());

describe("priority scheduling — scarce seats held for higher priority", () => {
  it("marks the tight flight available for the senior, held for the standard passenger", () => {
    const snr = getRebookingOptions(store.getBooking("SJ7SR1")!).find((o) => o.flight.id === "SJ713");
    const std = getRebookingOptions(store.getBooking("SJ7ST4")!).find((o) => o.flight.id === "SJ713");
    expect(snr?.available).toBe(true);
    expect(std?.available).toBe(false);
    expect(std?.heldForHigherPriority).toBe(3);
  });

  it("waitlists a standard passenger from the held flight (409)", async () => {
    const r = await json(
      await rebook(post({ ref: "SJ7ST4", lastName: "Kapoor", flightId: "SJ713", idempotencyKey: "k1" }))
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/waitlist|higher-priority/i);
  });

  it("lets the senior take a held seat (201)", async () => {
    const r = await json(
      await rebook(post({ ref: "SJ7SR1", lastName: "Reddy", flightId: "SJ713", idempotencyKey: "k2" }))
    );
    expect(r.status).toBe(201);
    expect(r.body.booking.status).toBe("REBOOKED");
  });

  it("routes the waitlisted passenger to the next-day flight that has room", async () => {
    // Senior + business take both scarce seats on SJ713 …
    await rebook(post({ ref: "SJ7SR1", lastName: "Reddy", flightId: "SJ713", idempotencyKey: "a" }));
    await rebook(post({ ref: "SJ7BZ2", lastName: "Singh", flightId: "SJ713", idempotencyKey: "b" }));
    // … so the standard passenger is offered the roomy SJ715 and can take it.
    const opts = getRebookingOptions(store.getBooking("SJ7ST4")!);
    expect(opts.find((o) => o.flight.id === "SJ715")?.available).toBe(true);
    const r = await json(
      await rebook(post({ ref: "SJ7ST4", lastName: "Kapoor", flightId: "SJ715", idempotencyKey: "c" }))
    );
    expect(r.status).toBe(201);
  });
});
