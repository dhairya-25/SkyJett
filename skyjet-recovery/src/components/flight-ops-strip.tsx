"use client";

import { useEffect, useRef } from "react";
import { CalendarClock, Check, Plane } from "lucide-react";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingView } from "@/lib/service";
import type { Flight, OpsStatus } from "@/lib/types";

// Passenger-facing "live flight status" — reflects what the ops/admin console
// pushes (reporting open / boarding / departed + an optional note). Renders
// nothing when the flight is on-time and has no note, so the default view stays
// clean. The delay itself is shown by the existing status header; this strip
// adds the operational progress the admin panel controls.

const OPS_UI: Record<
  Exclude<OpsStatus, "ON_TIME">,
  { label: string; sub: string; cls: string; plane?: boolean }
> = {
  REPORTING: {
    label: "Reporting open",
    sub: "Please head to the airport and clear security in good time.",
    cls: "border-sky-200 bg-sky-50 text-sky-800",
  },
  BOARDING: {
    label: "Boarding now",
    sub: "Proceed to your gate — boarding is in progress.",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
    plane: true,
  },
  DEPARTED: {
    label: "Departed",
    sub: "This flight has departed.",
    cls: "border-slate-200 bg-slate-100 text-slate-700",
    plane: true,
  },
};

export function FlightOpsStrip({ flight }: { flight: Flight }) {
  const ui = flight.opsStatus !== "ON_TIME" ? OPS_UI[flight.opsStatus] : null;
  if (!ui && !flight.opsNote) return null;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-sm",
        ui?.cls ?? "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      <div className="flex items-center gap-2">
        {ui?.plane ? (
          <Plane className="h-4 w-4 -rotate-45 shrink-0" />
        ) : (
          <CalendarClock className="h-4 w-4 shrink-0" />
        )}
        <span className="font-semibold">{ui?.label ?? "Flight update"}</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] opacity-70">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          live
        </span>
      </div>
      {ui?.sub && <p className="mt-1 text-xs opacity-90">{ui.sub}</p>}
      {flight.opsNote && (
        <p className="mt-1 text-xs font-medium">&ldquo;{flight.opsNote}&rdquo;</p>
      )}
      {flight.opsUpdatedAt && (
        <p className="mt-1 flex items-center gap-1 text-[11px] opacity-70">
          <Check className="h-3 w-3" /> Updated {fmtTime(flight.opsUpdatedAt)}
        </p>
      )}
    </div>
  );
}

/**
 * Poll the passenger's booking view while they're still deciding, so an ops
 * push (delay change, boarding call, cancellation) appears without a manual
 * refresh. `onFresh` is held in a ref, so passing an inline callback won't
 * restart the interval; the interval only resets when `creds` or `active`
 * changes. Stops automatically once the passenger has acted (active = false).
 */
export function useLiveView(
  creds: { pnr: string; lastName: string } | null,
  active: boolean,
  onFresh: (fresh: BookingView) => void
) {
  const cbRef = useRef(onFresh);
  cbRef.current = onFresh;

  useEffect(() => {
    if (!creds || !active) return;
    let alive = true;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pnr: creds.pnr, lastName: creds.lastName }),
        });
        if (!res.ok) return;
        const fresh = (await res.json()) as BookingView;
        if (alive) cbRef.current(fresh);
      } catch {
        /* ignore transient poll errors — the next tick retries */
      }
    };

    const id = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [creds, active]);
}
