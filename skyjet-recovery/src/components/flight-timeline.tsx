"use client";

import { Check, Clock, Plane, X } from "lucide-react";
import { buildFlightTimeline, type TimelineStep } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { Flight } from "@/lib/types";

// Shared "flight progress" stepper used on every dashboard (passenger app + ops
// console). It renders the ordered journey from `buildFlightTimeline`: past
// steps are filled + checked, the current step pulses, upcoming steps are muted.
// A delay shows amber, a cancellation red. `compact` drops the labels for the
// tight admin flight rows.

/** Dot fill for a step, by tone + progress state. */
function dotClasses(s: TimelineStep): string {
  if (s.tone === "danger") return "border-red-600 bg-red-600 text-white";
  if (s.tone === "warn") return "border-amber-500 bg-amber-500 text-white";
  if (s.state === "done") return "border-emerald-500 bg-emerald-500 text-white";
  if (s.state === "current") return "border-sky-600 bg-sky-600 text-white";
  return "border-slate-300 bg-white text-slate-300"; // upcoming
}

/** The little glyph inside a dot. */
function DotIcon({ step, size }: { step: TimelineStep; size: string }) {
  if (step.tone === "danger") return <X className={size} />;
  if (step.state === "done") return <Check className={size} />;
  if (step.tone === "warn") return <Clock className={size} />;
  if (step.state === "current") {
    return step.key === "departed" ? (
      <Plane className={cn(size, "-rotate-45")} />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    );
  }
  return null; // upcoming — empty circle
}

/** Colour of the connector segment leading into a reached step. */
function lineClasses(reached: boolean, tone: TimelineStep["tone"]): string {
  if (!reached) return "bg-slate-200";
  if (tone === "danger") return "bg-red-400";
  if (tone === "warn") return "bg-amber-400";
  return "bg-emerald-400";
}

export function FlightTimeline({
  flight,
  compact = false,
}: {
  flight: Flight;
  compact?: boolean;
}) {
  const steps = buildFlightTimeline(flight);
  const dot = compact ? "h-4 w-4" : "h-6 w-6";
  const icon = compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-full items-start">
        {steps.map((s, i) => {
          const reachedIn = s.state !== "upcoming";
          const next = steps[i + 1];
          const reachedOut = !!next && next.state !== "upcoming";
          return (
            <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center">
              {/* connector + dot */}
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    i === 0 ? "invisible" : lineClasses(reachedIn, s.tone)
                  )}
                />
                <span className="relative flex shrink-0 items-center justify-center">
                  {s.state === "current" && (
                    <span
                      className={cn(
                        "absolute inline-flex rounded-full opacity-60 animate-ping",
                        dot,
                        s.tone === "danger"
                          ? "bg-red-400"
                          : s.tone === "warn"
                            ? "bg-amber-300"
                            : "bg-sky-400"
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative flex items-center justify-center rounded-full border",
                      dot,
                      dotClasses(s)
                    )}
                  >
                    <DotIcon step={s} size={icon} />
                  </span>
                </span>
                <span
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    i === steps.length - 1
                      ? "invisible"
                      : lineClasses(reachedOut, next.tone)
                  )}
                />
              </div>

              {/* labels (full mode only) */}
              {!compact && (
                <div className="mt-1.5 px-1 text-center">
                  <p
                    className={cn(
                      "text-[11px] font-semibold leading-tight",
                      s.state === "upcoming" ? "text-slate-400" : "text-slate-700"
                    )}
                  >
                    {s.label}
                  </p>
                  {s.detail && (
                    <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
                      {s.detail}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
