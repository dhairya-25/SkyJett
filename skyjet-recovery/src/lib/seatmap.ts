import type { Flight } from "./types";

// Deterministic cabin seat map for a flight. Both the server (to validate a
// chosen seat) and the client (to render the airplane) derive the SAME map from
// the flight id, so a selection can never disagree with what was shown.
//
// The set of seats "already taken by other passengers" is sized so that the
// number of FREE seats always equals the flight's live `seatsAvailable`. Because
// `seatsAvailable` drops by one for every seat our passenger books and the
// booked seat is layered on top, `seatsAvailable + booked.size` is invariant —
// so the base pattern never shifts as seats fill (no visual jitter), only the
// specific picked seats flip to occupied.

export const SEAT_COLUMNS = ["A", "B", "C", "D", "E", "F"] as const;
export type SeatColumn = (typeof SEAT_COLUMNS)[number];

/** A320neo single-aisle: 30 rows × 6 (A–C | aisle | D–F). */
const DEFAULT_TOTAL_SEATS = 180;
/** Leading rows sold as a roomier cabin — shown with a subtle accent. */
const BUSINESS_ROWS = 2;
/** Front rows held for priority passengers (senior / business / infant). */
const PRIORITY_ROWS = 4;

export interface Seat {
  id: string; // e.g. "12C"
  row: number;
  col: SeatColumn;
  occupied: boolean;
  cabin: "BUSINESS" | "ECONOMY";
  aisle: boolean; // borders the aisle (column C or D)
  window: boolean; // borders a window (column A or F)
  priority: boolean; // in the reserved front priority zone
}

export interface SeatMap {
  flightId: string;
  flightNo: string;
  aircraft: string;
  rows: number;
  columns: readonly SeatColumn[];
  businessRows: number;
  priorityRows: number; // front rows reserved for priority passengers
  total: number;
  available: number; // free seats remaining (== flight.seatsAvailable)
  seats: Seat[]; // row-major: row 1 A–F, row 2 A–F, …
}

/** Small, stable string hash (FNV-1a-ish) — deterministic across server/client. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** The stable set of seats occupied by "other passengers" — the plane's base
 *  fill. Fixed size + deterministic order, so it never moves between renders. */
function baseOccupied(flightId: string, count: number, allIds: string[]): Set<string> {
  if (count <= 0) return new Set();
  const ranked = allIds
    .map((id) => ({ id, w: hashStr(`${flightId}:${id}`) }))
    .sort((a, b) => a.w - b.w || (a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map((x) => x.id);
  return new Set(ranked);
}

export function totalSeatsOf(flight: Flight): number {
  return flight.totalSeats ?? DEFAULT_TOTAL_SEATS;
}

/** Build the seat map for a flight. `booked` = seats already taken this session
 *  (from the store), which are laid over the deterministic base fill. */
export function buildSeatMap(flight: Flight, booked: Set<string> = new Set()): SeatMap {
  const total = totalSeatsOf(flight);
  const rows = Math.ceil(total / SEAT_COLUMNS.length);

  const allIds: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (const c of SEAT_COLUMNS) allIds.push(`${r}${c}`);
  }

  // Invariant initial load (see file header): recover it from live state so the
  // base pattern is stable no matter how many seats have since been booked.
  const initialAvailable = Math.max(
    0,
    Math.min(total, flight.seatsAvailable + booked.size)
  );
  const base = baseOccupied(flight.id, total - initialAvailable, allIds);

  const seats: Seat[] = allIds.map((id) => {
    const row = parseInt(id, 10);
    const col = id.slice(String(row).length) as SeatColumn;
    return {
      id,
      row,
      col,
      occupied: base.has(id) || booked.has(id),
      cabin: row <= BUSINESS_ROWS ? "BUSINESS" : "ECONOMY",
      aisle: col === "C" || col === "D",
      window: col === "A" || col === "F",
      priority: row <= PRIORITY_ROWS,
    };
  });

  return {
    flightId: flight.id,
    flightNo: flight.flightNo,
    aircraft: flight.aircraft,
    rows,
    columns: SEAT_COLUMNS,
    businessRows: BUSINESS_ROWS,
    priorityRows: PRIORITY_ROWS,
    total,
    available: Math.max(0, flight.seatsAvailable),
    seats,
  };
}

/** Seat desirability — lower is better. Front rows first; within a row an aisle
 *  beats a window beats a middle (aisle = easiest access, e.g. for a senior). */
function desirability(seat: Seat): number {
  const kind = seat.aisle ? 0 : seat.window ? 1 : 2;
  return seat.row * 10 + kind;
}

/** Is any free seat outside the reserved priority zone? */
export function hasFreeNonPrioritySeat(map: SeatMap): boolean {
  return map.seats.some((s) => !s.occupied && !s.priority);
}

/** May a passenger of this priority rank take this seat? Priority passengers
 *  (rank 1–3) may sit anywhere free; standard passengers avoid the priority zone
 *  unless nothing else is left. */
export function seatSelectable(map: SeatMap, seatId: string, rank: number): boolean {
  const seat = map.seats.find((s) => s.id === seatId.toUpperCase());
  if (!seat || seat.occupied) return false;
  if (rank <= 3) return true;
  return !seat.priority || !hasFreeNonPrioritySeat(map);
}

/** The best seat to hold for a passenger of this priority rank. Priority
 *  passengers get the best (front) seat in the cabin; standard passengers get
 *  the best seat outside the priority zone (falling back to any if the zone is
 *  all that remains). */
export function allocateSeat(map: SeatMap, rank: number): string | undefined {
  const free = map.seats.filter((s) => !s.occupied);
  if (!free.length) return undefined;
  const preferred = rank <= 3 ? free : free.filter((s) => !s.priority);
  const pool = preferred.length ? preferred : free;
  return [...pool].sort((a, b) => desirability(a) - desirability(b))[0].id;
}

/** Natural default seat: first free, front-to-back, window→aisle. */
export function firstFreeSeat(map: SeatMap): string | undefined {
  return map.seats.find((s) => !s.occupied)?.id;
}

export function isSeatFree(map: SeatMap, seatId: string): boolean {
  const s = map.seats.find((x) => x.id === seatId.toUpperCase());
  return !!s && !s.occupied;
}
