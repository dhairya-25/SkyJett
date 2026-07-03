import { seedBookings, seedFlights } from "./seed";
import type {
  AuditEntry,
  Booking,
  Flight,
  FlightOpsPatch,
  OpsLogEntry,
} from "./types";

/** Short "meal, hotel, 10% off" summary of a goodwill gesture, or "" if none. */
function summariseGoodwill(g: Flight["goodwill"]): string {
  if (!g) return "";
  return [
    g.freeMeal && "meal",
    g.freeAccommodation && "hotel",
    g.discountPercent > 0 && `${g.discountPercent}% off`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** One-line, human-readable snapshot of a flight's operational state. */
function summariseFlight(f: Flight): string {
  const parts: string[] = [f.status.toLowerCase()];
  if (f.delayMinutes > 0) parts.push(`+${f.delayMinutes}m`);
  if (f.cause !== "NONE") parts.push(f.cause.toLowerCase());
  if (f.opsStatus !== "ON_TIME") parts.push(f.opsStatus.toLowerCase());
  const goodwill = summariseGoodwill(f.goodwill);
  if (goodwill) parts.push(`goodwill: ${goodwill}`);
  return parts.join(" · ");
}

/** Short random suffix for voucher-style references (kept local to avoid a
 *  store↔service import cycle). */
function goodwillRef(): string {
  return `GW-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Module-singleton, in-memory store. It survives across requests within a warm
// server process — ideal for a local demo and a single serverless instance.
// Production swaps this for the Prisma/PostgreSQL model in prisma/schema.prisma
// (same shape: idempotency keys + optimistic version already modelled here).

class SkyjetStore {
  flights = new Map<string, Flight>();
  bookings = new Map<string, Booking>();
  audit: AuditEntry[] = [];
  /** Ops-side change feed (newest first) — powers the admin "recent updates". */
  opsLog: OpsLogEntry[] = [];
  /** idempotency-key -> stored response payload (JSON string). */
  idempotency = new Map<string, string>();
  /** flightId -> specific seat ids booked this session (over the base fill). */
  bookedSeats = new Map<string, Set<string>>();

  constructor() {
    this.reset();
  }

  reset() {
    this.flights = new Map(seedFlights().map((f) => [f.id, f]));
    this.bookings = new Map(seedBookings().map((b) => [b.ref, b]));
    this.audit = [];
    this.opsLog = [];
    this.idempotency = new Map();
    this.bookedSeats = new Map();
  }

  /** Seats already picked on a flight this session (mutable set). */
  seatsTaken(flightId: string): Set<string> {
    let s = this.bookedSeats.get(flightId);
    if (!s) {
      s = new Set();
      this.bookedSeats.set(flightId, s);
    }
    return s;
  }

  /** Reserve a specific seat on a flight (idempotent — booking twice is a no-op). */
  bookSeat(flightId: string, seatId: string) {
    this.seatsTaken(flightId).add(seatId.toUpperCase());
  }

  /** Release a previously-held seat back to the map (on a re-rebooking). */
  releaseSeat(flightId: string, seatId?: string) {
    if (seatId) this.bookedSeats.get(flightId)?.delete(seatId.toUpperCase());
  }

  getFlight(id: string) {
    return this.flights.get(id);
  }

  getBooking(ref: string) {
    return this.bookings.get(ref.trim().toUpperCase());
  }

  /** Lightweight auth: PNR + surname must both match. */
  findBooking(ref: string, lastName: string) {
    const b = this.getBooking(ref);
    if (!b) return undefined;
    if (b.passenger.lastName.toLowerCase() !== lastName.trim().toLowerCase()) {
      return undefined;
    }
    return b;
  }

  /** SCHEDULED flights on the same route, with seats, departing at/after the
   *  original flight — recomputed live so a selection can never go stale.
   *  A flight ops has marked DEPARTED is excluded (you can't board a gone plane). */
  alternativesFor(flight: Flight): Flight[] {
    const origDep = Date.parse(flight.departure);
    return [...this.flights.values()]
      .filter(
        (f) =>
          f.id !== flight.id &&
          f.status === "SCHEDULED" &&
          f.opsStatus !== "DEPARTED" &&
          f.origin === flight.origin &&
          f.destination === flight.destination &&
          f.seatsAvailable > 0 &&
          Date.parse(f.departure) >= origDep
      )
      .sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure));
  }

  /** All flights, earliest first — the ops/admin panel's worklist. */
  listFlights(): Flight[] {
    return [...this.flights.values()].sort(
      (a, b) => Date.parse(a.departure) - Date.parse(b.departure)
    );
  }

  /** Apply an ops/admin change to a flight and record it on the ops feed.
   *  Returns the updated flight, or undefined for an unknown id. Passenger
   *  booking views read the flight live, so one write reaches every affected PNR. */
  applyOps(flightId: string, patch: FlightOpsPatch): Flight | undefined {
    const f = this.flights.get(flightId);
    if (!f) return undefined;

    const before = summariseFlight(f);

    if (patch.status !== undefined) {
      f.status = patch.status;
      if (patch.status === "CANCELLED") {
        f.seatsAvailable = 0;
        f.opsStatus = "ON_TIME";
      }
      if (patch.status === "SCHEDULED") {
        f.delayMinutes = 0;
        f.cause = "NONE";
      }
    }
    if (patch.cause !== undefined) f.cause = patch.cause;
    if (patch.delayMinutes !== undefined) {
      f.delayMinutes = patch.delayMinutes;
      // A positive delay implies DELAYED; zeroing it restores an on-time schedule.
      if (patch.delayMinutes > 0 && f.status === "SCHEDULED") f.status = "DELAYED";
      if (patch.delayMinutes === 0 && f.status === "DELAYED") f.status = "SCHEDULED";
    }
    if (patch.opsStatus !== undefined) f.opsStatus = patch.opsStatus;
    if (patch.note !== undefined) f.opsNote = patch.note.trim() || undefined;
    if (patch.goodwill !== undefined) {
      const g = patch.goodwill;
      // `null`, or a gesture with nothing selected, clears any existing one.
      const hasPerk =
        g !== null && (g.freeMeal || g.freeAccommodation || g.discountPercent > 0);
      f.goodwill = hasPerk
        ? {
            freeMeal: g!.freeMeal,
            freeAccommodation: g!.freeAccommodation,
            discountPercent: g!.discountPercent,
            message: g!.message?.trim() || undefined,
            // Keep the reference stable if ops is editing an existing gesture.
            reference: f.goodwill?.reference ?? goodwillRef(),
            issuedAt: new Date().toISOString(),
          }
        : undefined;
    }
    f.opsUpdatedAt = new Date().toISOString();

    const after = summariseFlight(f);
    this.opsLog.unshift({
      id: `OPS-${this.opsLog.length + 1}`,
      at: f.opsUpdatedAt,
      flightId: f.id,
      flightNo: f.flightNo,
      summary: `${before} → ${after}`,
      before,
      after,
    });
    return f;
  }

  addAudit(entry: Omit<AuditEntry, "id" | "at">) {
    const e: AuditEntry = {
      id: `AUD-${this.audit.length + 1}`,
      at: new Date().toISOString(),
      ...entry,
    };
    this.audit.push(e);
    return e;
  }

  /** Impact metrics derived from the audit log — powers the impact tile. */
  stats() {
    const rebooks = this.audit.filter((a) => a.action === "REBOOK").length;
    const refunds = this.audit.filter((a) => a.action === "REFUND").length;
    const escalations = this.audit.filter(
      (a) => a.action === "ESCALATE"
    ).length;
    const selfServed = rebooks + refunds;
    return {
      rebooks,
      refunds,
      escalations,
      selfServed,
      callsDeflected: selfServed,
      minutesSaved: selfServed * 25, // avg 25-min contact-centre hold
    };
  }
}

// Cache on globalThis so dev hot-reload doesn't wipe state each edit.
const g = globalThis as unknown as { __skyjetStore?: SkyjetStore };
export const store: SkyjetStore = g.__skyjetStore ?? (g.__skyjetStore = new SkyjetStore());
