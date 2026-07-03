// Derives a passenger-facing "flight progress" timeline from a Flight. Pure and
// framework-free so the same steps drive the passenger app and the ops console
// (and can be unit-tested). It folds the two orthogonal axes on a Flight into a
// single ordered journey:
//   • FlightStatus  (SCHEDULED / DELAYED / CANCELLED) — the disruption
//   • OpsStatus     (ON_TIME → REPORTING → BOARDING → DEPARTED) — boarding progress
// so a passenger sees exactly where their flight is: scheduled → delayed →
// check-in → boarding → departed → arrival, or the short scheduled → cancelled.

import { durationLabel, fmtTime } from "./format";
import type { DisruptionCause, Flight, OpsStatus } from "./types";

/** How far along the journey a step is. Exactly one step is `current`. */
export type StepState = "done" | "current" | "upcoming";
/** Colour intent — `warn` = delay, `danger` = cancellation, else neutral. */
export type StepTone = "normal" | "warn" | "danger";

export interface TimelineStep {
  key: string;
  label: string;
  /** Optional second line (a time, a delay, the cause). */
  detail?: string;
  state: StepState;
  tone: StepTone;
}

const OPS_RANK: Record<OpsStatus, number> = {
  ON_TIME: 0,
  REPORTING: 1,
  BOARDING: 2,
  DEPARTED: 3,
};

const CAUSE_LABEL: Record<DisruptionCause, string> = {
  WEATHER: "Weather",
  ATC: "Air traffic control",
  SECURITY: "Security",
  TECHNICAL: "Technical issue",
  CREW: "Crew",
  OPERATIONAL: "Operational",
  NONE: "",
};

const shift = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/**
 * Ordered timeline for a flight. Every step before the reached point is `done`,
 * the furthest reached step is `current`, and the rest are `upcoming`.
 */
export function buildFlightTimeline(f: Flight): TimelineStep[] {
  // Cancellation is terminal — the journey stops at "Cancelled".
  if (f.status === "CANCELLED") {
    return [
      {
        key: "scheduled",
        label: "Scheduled",
        detail: `Dep ${fmtTime(f.departure)}`,
        state: "done",
        tone: "normal",
      },
      {
        key: "cancelled",
        label: "Cancelled",
        detail: CAUSE_LABEL[f.cause] || undefined,
        state: "current",
        tone: "danger",
      },
    ];
  }

  const rank = OPS_RANK[f.opsStatus];
  const delayed = f.status === "DELAYED" || f.delayMinutes > 0;

  // Build the raw sequence with a `reached` flag, then resolve done/current/upcoming.
  const raw: Array<Omit<TimelineStep, "state"> & { reached: boolean }> = [
    {
      key: "scheduled",
      label: "Scheduled",
      detail: `Dep ${fmtTime(f.departure)}`,
      tone: "normal",
      reached: true,
    },
  ];

  if (delayed) {
    raw.push({
      key: "delayed",
      label: "Delayed",
      detail: `+${durationLabel(f.delayMinutes)} · ETD ${fmtTime(
        shift(f.departure, f.delayMinutes)
      )}`,
      tone: "warn",
      reached: true,
    });
  }

  raw.push(
    { key: "reporting", label: "Check-in open", tone: "normal", reached: rank >= 1 },
    { key: "boarding", label: "Boarding", tone: "normal", reached: rank >= 2 },
    { key: "departed", label: "Departed", tone: "normal", reached: rank >= 3 },
    {
      key: "arrival",
      label: `Arrive ${f.destination}`,
      // Estimated arrival shifts with the delay so the endpoint stays honest.
      detail: fmtTime(shift(f.arrival, delayed ? f.delayMinutes : 0)),
      tone: "normal",
      reached: false, // no "arrived" state in this model — always the horizon
    }
  );

  const lastReached = raw.reduce((acc, s, i) => (s.reached ? i : acc), 0);

  return raw.map(({ reached: _reached, ...s }, i) => ({
    ...s,
    state: i < lastReached ? "done" : i === lastReached ? "current" : "upcoming",
  }));
}

/** The step the flight is currently at — handy for a one-line "Now: …" caption. */
export function currentTimelineStep(f: Flight): TimelineStep {
  const steps = buildFlightTimeline(f);
  return steps.find((s) => s.state === "current") ?? steps[steps.length - 1];
}
