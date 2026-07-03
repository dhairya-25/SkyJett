// Domain model for SkyJet self-service flight recovery.

export type DisruptionCause =
  | "WEATHER"
  | "ATC"
  | "SECURITY"
  | "TECHNICAL"
  | "CREW"
  | "OPERATIONAL"
  | "NONE";

export type FlightStatus = "SCHEDULED" | "CANCELLED" | "DELAYED";

/** Operational progress an ops agent pushes from the admin panel. Orthogonal to
 *  `FlightStatus` (which drives eligibility) — this is boarding-progress only. */
export type OpsStatus = "ON_TIME" | "REPORTING" | "BOARDING" | "DEPARTED";

/** What an ops agent chooses when extending a "sorry for the inconvenience"
 *  goodwill gesture. A discretionary act of service recovery — separate from,
 *  and on top of, the statutory DGCA entitlements the eligibility engine derives. */
export interface GoodwillInput {
  /** A complimentary meal / meal voucher at the airport. */
  freeMeal: boolean;
  /** A complimentary hotel room for the wait. */
  freeAccommodation: boolean;
  /** Percentage discount on a future SkyJet ticket (0 = none). */
  discountPercent: number;
  /** Optional custom apology line shown to the passenger. */
  message?: string;
}

/** A stored goodwill gesture — the ops agent's `GoodwillInput` stamped with a
 *  trackable, voucher-style reference and the time it was issued. */
export interface GoodwillGesture extends GoodwillInput {
  reference: string;
  issuedAt: string; // ISO
}

/** The fields the ops/admin panel may change on a flight (all optional). Shared
 *  by the server store and the client console. */
export interface FlightOpsPatch {
  status?: FlightStatus;
  cause?: DisruptionCause;
  delayMinutes?: number;
  opsStatus?: OpsStatus;
  note?: string;
  /** Grant/replace the flight's goodwill gesture; `null` clears it. */
  goodwill?: GoodwillInput | null;
}

export type PassengerTier = "STANDARD" | "SILVER" | "GOLD";

/** Flags that force an agent handoff (high-risk / low-frequency cases). */
export type SpecialFlag =
  | "UNACCOMPANIED_MINOR"
  | "MEDICAL"
  | "PET_IN_CABIN"
  | "GROUP"
  | "PARTNER_TICKET";

export type BookingStatus =
  | "CONFIRMED"
  | "DISRUPTED"
  | "REBOOKED"
  | "REFUND_REQUESTED"
  | "ESCALATED";

export type CabinClass = "ECONOMY" | "BUSINESS";

export interface Flight {
  id: string;
  flightNo: string;
  origin: string; // IATA code
  originCity: string;
  destination: string;
  destinationCity: string;
  departure: string; // ISO (UTC)
  arrival: string; // ISO (UTC)
  durationMin: number;
  status: FlightStatus;
  cause: DisruptionCause;
  delayMinutes: number;
  aircraft: string;
  cabin: CabinClass;
  seatsAvailable: number;
  /** Current fare for this flight (INR) — drives the rebooking fare difference. */
  fare: number;
  /** Physical cabin capacity, for the seat map. Defaults to 180 (A320neo). */
  totalSeats?: number;
  // Operational progress, controlled by the ops/admin panel. Defaults to ON_TIME.
  opsStatus: OpsStatus;
  opsNote?: string; // optional short passenger-facing message pushed by ops
  opsUpdatedAt?: string; // ISO time of the last ops update, for a "live" indicator
  /** Discretionary "sorry for the inconvenience" goodwill gesture set by ops.
   *  Applied per-flight, so it reaches every passenger on the flight (same
   *  model as an ops note). Absent when no gesture has been extended. */
  goodwill?: GoodwillGesture;
}

export interface Passenger {
  id: string;
  firstName: string;
  lastName: string;
  email: string; // stored masked in the demo
  tier: PassengerTier;
  isSenior?: boolean; // senior citizen (≥ 60) — top seat-allocation priority
  isChild?: boolean; // child traveller
}

export interface Booking {
  ref: string; // PNR (6 chars)
  passenger: Passenger;
  flightId: string; // primary / disrupted flight
  connectingFlightId?: string;
  status: BookingStatus;
  cabin: CabinClass;
  fareClass: string;
  farePaid: number; // INR
  specialFlags: SpecialFlag[];
  withInfant?: boolean; // travelling with an infant in arms
  partySize: number;
  createdAt: string;
  // mutation trail
  rebookedFlightId?: string;
  seat?: string; // seat assigned on the rebooked flight (e.g. "12C")
  refundReference?: string;
  handoffReference?: string;
  version: number; // optimistic-concurrency guard
}

export interface AuditEntry {
  id: string;
  at: string;
  bookingRef: string;
  action: "LOOKUP" | "REBOOK" | "REFUND" | "ESCALATE" | "ACKNOWLEDGE";
  detail: string;
  before?: string;
  after?: string;
}

/** Ops-side change feed (delay/boarding/cancellation), kept separate from the
 *  passenger AuditEntry so it never pollutes the self-service impact stats. */
export interface OpsLogEntry {
  id: string;
  at: string;
  flightId: string;
  flightNo: string;
  summary: string;
  before: string;
  after: string;
}
