import type { Booking, Flight, Passenger } from "./types";

// Fixed "disruption day" reference so the demo is fully deterministic
// regardless of the machine clock. ~08:00 IST on 03-Jul-2026.
const BASE = Date.parse("2026-07-03T02:30:00Z");
const at = (hoursFromBase: number) =>
  new Date(BASE + hoursFromBase * 3_600_000).toISOString();

/** The simulated "current time" the passenger is interacting at. */
export const DISRUPTION_NOW = at(0);

export function seedFlights(): Flight[] {
  return [
    // ── Scenario 1: DEL → BKK cancelled (WEATHER) + alternatives ──────────
    // Fares vary vs. the ₹18,500 paid so a rebook shows a top-up or a refund.
    f("SJ301", "DEL", "New Delhi", "BKK", "Bangkok", 2, 260, {
      status: "CANCELLED",
      cause: "WEATHER",
      seatsAvailable: 0,
      fare: 18500,
    }),
    f("SJ303", "DEL", "New Delhi", "BKK", "Bangkok", 5, 260, {
      seatsAvailable: 22,
      fare: 19900, // pricier → passenger pays the difference
    }),
    f("SJ305", "DEL", "New Delhi", "BKK", "Bangkok", 8, 260, {
      seatsAvailable: 0, // full — should be filtered out of options
      fare: 21000,
    }),
    f("SJ307", "DEL", "New Delhi", "BKK", "Bangkok", 11, 260, {
      seatsAvailable: 14,
      fare: 16800, // cheaper → passenger is refunded the difference
    }),
    f("SJ309", "DEL", "New Delhi", "BKK", "Bangkok", 26, 260, {
      seatsAvailable: 30, // next day
      fare: 15200,
    }),

    // ── Scenario 2: BOM → SIN cancelled (TECHNICAL — airline caused) ──────
    f("SJ415", "BOM", "Mumbai", "SIN", "Singapore", 3, 330, {
      status: "CANCELLED",
      cause: "TECHNICAL",
      seatsAvailable: 0,
      fare: 24200,
    }),
    f("SJ417", "BOM", "Mumbai", "SIN", "Singapore", 5.5, 330, {
      seatsAvailable: 18,
      fare: 26500, // pricier
    }),
    f("SJ419", "BOM", "Mumbai", "SIN", "Singapore", 8, 330, {
      seatsAvailable: 9,
      fare: 22900, // cheaper
    }),

    // ── Scenario 3: BLR → DXB long delay (WEATHER) ────────────────────────
    f("SJ522", "BLR", "Bengaluru", "DXB", "Dubai", 1.5, 240, {
      status: "DELAYED",
      cause: "WEATHER",
      delayMinutes: 300,
      seatsAvailable: 0,
      fare: 61000,
    }),
    f("SJ524", "BLR", "Bengaluru", "DXB", "Dubai", 4, 240, {
      seatsAvailable: 25,
      fare: 58500, // cheaper
    }),
    f("SJ526", "BLR", "Bengaluru", "DXB", "Dubai", 6.5, 240, {
      seatsAvailable: 7,
      fare: 63000, // pricier
    }),

    // ── Scenario 4: DEL → DXB cancelled — SCARCE seats, priority scheduling ──
    // Four passengers of different priority were on SJ711; the same-day
    // alternative has only 2 seats, so they're held for the senior + business
    // passenger first and the rest are waitlisted onto the roomy next-day flight.
    f("SJ711", "DEL", "New Delhi", "DXB", "Dubai", 2.5, 220, {
      status: "CANCELLED",
      cause: "TECHNICAL",
      seatsAvailable: 0,
      fare: 27000,
    }),
    f("SJ713", "DEL", "New Delhi", "DXB", "Dubai", 6, 220, {
      seatsAvailable: 2, // tight — only the top-priority passengers fit
      fare: 28500,
    }),
    f("SJ715", "DEL", "New Delhi", "DXB", "Dubai", 27, 220, {
      seatsAvailable: 40, // next-day fallback with plenty of room
      fare: 24000,
    }),
  ];

  function f(
    id: string,
    origin: string,
    originCity: string,
    destination: string,
    destinationCity: string,
    depHour: number,
    durationMin: number,
    over: Partial<Flight> = {}
  ): Flight {
    return {
      id,
      flightNo: `${id.slice(0, 2)} ${id.slice(2)}`,
      origin,
      originCity,
      destination,
      destinationCity,
      departure: at(depHour),
      arrival: at(depHour + durationMin / 60),
      durationMin,
      status: "SCHEDULED",
      cause: "NONE",
      delayMinutes: 0,
      aircraft: "A320neo",
      cabin: "ECONOMY",
      seatsAvailable: 30,
      fare: 18000,
      opsStatus: "ON_TIME",
      ...over,
    };
  }
}

const passengers: Record<string, Passenger> = {
  aarav: {
    id: "PAX1",
    firstName: "Aarav",
    lastName: "Sharma",
    email: "a•••••@gmail.com",
    tier: "STANDARD",
    isSenior: true, // senior citizen → 1st seat-allocation priority
  },
  priya: {
    id: "PAX2",
    firstName: "Priya",
    lastName: "Nair",
    email: "p•••••@gmail.com",
    tier: "SILVER",
  },
  rohan: {
    id: "PAX3",
    firstName: "Rohan",
    lastName: "Mehta",
    email: "r•••••@gmail.com",
    tier: "GOLD",
  },
  ishaan: {
    id: "PAX4",
    firstName: "Ishaan",
    lastName: "Gupta",
    email: "i•••••@gmail.com",
    tier: "STANDARD",
  },
  // Scenario 4 — competing for scarce DEL→DXB seats.
  kavya: {
    id: "PAX5",
    firstName: "Kavya",
    lastName: "Reddy",
    email: "k•••••@gmail.com",
    tier: "SILVER",
    isSenior: true, // → rank 1
  },
  arjun: {
    id: "PAX6",
    firstName: "Arjun",
    lastName: "Singh",
    email: "a•••••@gmail.com",
    tier: "GOLD",
  },
  meera: {
    id: "PAX7",
    firstName: "Meera",
    lastName: "Iyer",
    email: "m•••••@gmail.com",
    tier: "STANDARD",
  },
  dev: {
    id: "PAX8",
    firstName: "Dev",
    lastName: "Kapoor",
    email: "d•••••@gmail.com",
    tier: "STANDARD",
  },
};

export function seedBookings(): Booking[] {
  return [
    // Weather cancellation — rebook/refund + hotel, NO cash compensation.
    booking("SJ7QK2", passengers.aarav, "SJ301", 18500, "V"),
    // Technical cancellation (airline caused) — rebook/refund + COMPENSATION.
    // Travelling with an infant → 3rd seat-allocation priority.
    booking("SJ4RM9", passengers.priya, "SJ415", 24200, "L", { withInfant: true }),
    // Long weather delay (business) — rebook/refund + meals, no compensation.
    booking("SJ8XP5", passengers.rohan, "SJ522", 61000, "J", {
      cabin: "BUSINESS",
    }),
    // Unaccompanied minor on the cancelled weather flight — MUST escalate.
    booking("SJ2MN1", passengers.ishaan, "SJ301", 18500, "V", {
      specialFlags: ["UNACCOMPANIED_MINOR"],
    }),

    // Scenario 4 — four passengers on cancelled SJ711 compete for 2 seats on
    // SJ713. Priority order decides who gets them: senior → business → infant →
    // standard. The infant and standard passengers are held back (waitlisted).
    booking("SJ7SR1", passengers.kavya, "SJ711", 27000, "V"), // senior → rank 1
    booking("SJ7BZ2", passengers.arjun, "SJ711", 41000, "J", { cabin: "BUSINESS" }), // business → rank 2
    booking("SJ7IN3", passengers.meera, "SJ711", 27000, "V", { withInfant: true }), // infant → rank 3
    booking("SJ7ST4", passengers.dev, "SJ711", 27000, "V"), // standard → rank 4
  ];

  function booking(
    ref: string,
    passenger: Passenger,
    flightId: string,
    farePaid: number,
    fareClass: string,
    over: Partial<Booking> = {}
  ): Booking {
    return {
      ref,
      passenger,
      flightId,
      status: "CONFIRMED",
      cabin: "ECONOMY",
      fareClass,
      farePaid,
      specialFlags: [],
      partySize: 1,
      createdAt: at(-72),
      version: 0,
      ...over,
    };
  }
}
