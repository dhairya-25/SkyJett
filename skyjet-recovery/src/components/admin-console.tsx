"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  Check,
  CircleCheck,
  HeartHandshake,
  Loader2,
  Percent,
  Plane,
  RefreshCw,
  Send,
  ShieldCheck,
  TriangleAlert,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlightTimeline } from "@/components/flight-timeline";
import { DEV_ADMIN_TOKEN } from "@/lib/admin-auth";
import { durationLabel, fmtDate, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DisruptionCause,
  Flight,
  FlightOpsPatch,
  OpsLogEntry,
  OpsStatus,
} from "@/lib/types";

const TOKEN_KEY = "skyjet_admin_token";
const CAUSES: DisruptionCause[] = [
  "WEATHER",
  "TECHNICAL",
  "ATC",
  "CREW",
  "OPERATIONAL",
  "SECURITY",
];
const OPS_STEPS: { value: OpsStatus; label: string }[] = [
  { value: "ON_TIME", label: "On time" },
  { value: "REPORTING", label: "Reporting" },
  { value: "BOARDING", label: "Boarding" },
  { value: "DEPARTED", label: "Departed" },
];

type FlightsResponse = { flights: Flight[]; opsLog: OpsLogEntry[]; now: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function AdminConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [opsLog, setOpsLog] = useState<OpsLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/flights", {
        headers: { authorization: `Bearer ${tok}` },
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<FlightsResponse> & {
        error?: string;
      };
      if (!res.ok) {
        // Invalid or disabled token → drop back to the access gate.
        if (res.status === 401 || res.status === 503) {
          setToken(null);
          sessionStorage.removeItem(TOKEN_KEY);
          setAuthError(data.error ?? "Access denied.");
        } else {
          setError(data.error ?? "Failed to load flights.");
        }
        return;
      }
      setFlights(data.flights ?? []);
      setOpsLog(data.opsLog ?? []);
      setError(null);
    } catch {
      setError("Network error — is the dev server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore a saved session token on mount.
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      load(saved);
    }
  }, [load]);

  // Light auto-refresh so passenger-side changes (a taken seat) show up too.
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (!document.hidden) load(token);
    }, 8000);
    return () => clearInterval(id);
  }, [token, load]);

  function authenticate(e: React.FormEvent) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    setAuthError(null);
    setToken(t);
    sessionStorage.setItem(TOKEN_KEY, t);
    load(t);
  }

  const apply = useCallback(
    async (flightId: string, patch: FlightOpsPatch) => {
      if (!token) return;
      const res = await fetch("/api/admin/flight", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flightId, ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        flight?: Flight;
        opsLog?: OpsLogEntry[];
        error?: string;
      };
      if (!res.ok || !data.flight) throw new Error(data.error ?? "Update failed.");
      const updated = data.flight;
      setFlights((cur) => (cur ? cur.map((f) => (f.id === updated.id ? updated : f)) : cur));
      setOpsLog(data.opsLog ?? []);
    },
    [token]
  );

  async function resetDemo() {
    await fetch("/api/reset", { method: "POST" });
    if (token) load(token);
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setFlights(null);
    setTokenInput("");
  }

  /* ── Access gate ─────────────────────────────────────────────────────── */
  if (!token || !flights) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
        <ConsoleHeader />
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900">Ops access</h2>
            </div>
            <p className="text-xs text-slate-500">
              This console controls live flight status. Enter your ops access token.
            </p>
            <form onSubmit={authenticate} className="space-y-3">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Ops access token"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <Button type="submit" className="w-full" disabled={loading || !tokenInput.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Enter console
              </Button>
            </form>
            {authError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}
            {process.env.NODE_ENV !== "production" && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Dev token:{" "}
                <button
                  type="button"
                  onClick={() => setTokenInput(DEV_ADMIN_TOKEN)}
                  className="font-mono font-semibold text-sky-700 hover:underline"
                >
                  {DEV_ADMIN_TOKEN}
                </button>{" "}
                — set <span className="font-mono">ADMIN_TOKEN</span> for production.
              </p>
            )}
          </CardContent>
        </Card>
        <a
          href="/"
          className="mx-auto flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowRight className="h-3.5 w-3.5" /> Open passenger app
        </a>
      </div>
    );
  }

  /* ── Console ─────────────────────────────────────────────────────────── */
  const disrupted = flights.filter((f) => f.status !== "SCHEDULED" || f.opsStatus !== "ON_TIME");
  const normal = flights.filter((f) => f.status === "SCHEDULED" && f.opsStatus === "ON_TIME");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConsoleHeader />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
          <Button variant="outline" size="sm" onClick={() => load(token)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={resetDemo}>
            Reset demo
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-800">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Push a delay or a boarding update to a flight and it reaches every passenger on it
          within ~10s — no passenger action needed. Try the delayed{" "}
          <b>BLR → DXB (SJ 522)</b>, then open the passenger app for PNR <b>SJ8XP5 / Mehta</b>.
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {opsLog.length > 0 && <OpsFeed opsLog={opsLog} />}

      {disrupted.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Needs attention
          </h2>
          {disrupted.map((f) => (
            <FlightRow key={f.id} flight={f} onApply={(p) => apply(f.id, p)} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          All other flights
        </h2>
        {normal.map((f) => (
          <FlightRow key={f.id} flight={f} onApply={(p) => apply(f.id, p)} />
        ))}
      </section>

      <p className="mt-auto pt-4 text-center text-[11px] text-slate-400">
        SkyJet Ops Console · 22North Product Engineering Challenge 2026 · data is simulated
      </p>
    </div>
  );
}

function ConsoleHeader() {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
        <Plane className="h-5 w-5 -rotate-45" />
      </div>
      <div>
        <p className="text-base font-bold leading-tight text-slate-900">SkyJet Ops Console</p>
        <p className="text-xs font-medium text-slate-500">Flight status &amp; disruption control</p>
      </div>
    </header>
  );
}

/* ── Recent change feed ─────────────────────────────────────────────────── */

function OpsFeed({ opsLog }: { opsLog: OpsLogEntry[] }) {
  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardContent className="space-y-1.5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Recent updates (sent to passengers)
        </p>
        {opsLog.slice(0, 5).map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-xs text-slate-600">
            <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="font-semibold text-slate-800">{e.flightNo}</span>
            <span className="truncate text-slate-500">{e.summary}</span>
            <span className="ml-auto shrink-0 text-[10px] text-slate-400">{fmtTime(e.at)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── One flight, with its controls ──────────────────────────────────────── */

const STATUS_BADGE: Record<Flight["status"], { variant: "success" | "warning" | "danger"; label: string }> = {
  SCHEDULED: { variant: "success", label: "Scheduled" },
  DELAYED: { variant: "warning", label: "Delayed" },
  CANCELLED: { variant: "danger", label: "Cancelled" },
};
const OPS_BADGE: Partial<Record<OpsStatus, string>> = {
  REPORTING: "Reporting open",
  BOARDING: "Boarding",
  DEPARTED: "Departed",
};

function FlightRow({
  flight,
  onApply,
}: {
  flight: Flight;
  onApply: (patch: FlightOpsPatch) => Promise<void>;
}) {
  const [delay, setDelay] = useState(flight.delayMinutes ? String(flight.delayMinutes) : "");
  const [cause, setCause] = useState<DisruptionCause>(
    flight.cause === "NONE" ? "WEATHER" : flight.cause
  );
  const [note, setNote] = useState(flight.opsNote ?? "");
  // Goodwill ("sorry for the inconvenience") gesture editor.
  const [meal, setMeal] = useState(flight.goodwill?.freeMeal ?? false);
  const [accom, setAccom] = useState(flight.goodwill?.freeAccommodation ?? false);
  const [discount, setDiscount] = useState(
    flight.goodwill?.discountPercent ? String(flight.goodwill.discountPercent) : ""
  );
  const [gwMsg, setGwMsg] = useState(flight.goodwill?.message ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync editable fields only when the server value actually changes, so a
  // background refresh never clobbers what the operator is mid-typing.
  useEffect(() => {
    setDelay(flight.delayMinutes ? String(flight.delayMinutes) : "");
  }, [flight.delayMinutes]);
  useEffect(() => {
    setNote(flight.opsNote ?? "");
  }, [flight.opsNote]);
  useEffect(() => {
    setMeal(flight.goodwill?.freeMeal ?? false);
    setAccom(flight.goodwill?.freeAccommodation ?? false);
    setDiscount(flight.goodwill?.discountPercent ? String(flight.goodwill.discountPercent) : "");
    setGwMsg(flight.goodwill?.message ?? "");
  }, [
    flight.goodwill?.freeMeal,
    flight.goodwill?.freeAccommodation,
    flight.goodwill?.discountPercent,
    flight.goodwill?.message,
  ]);

  async function run(label: string, patch: FlightOpsPatch) {
    setBusy(label);
    setErr(null);
    try {
      await onApply(patch);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const cancelled = flight.status === "CANCELLED";
  const sb = STATUS_BADGE[flight.status];
  const gwDiscount = Math.min(100, Math.max(0, Math.round(Number(discount) || 0)));
  const gwEmpty = !meal && !accom && gwDiscount === 0;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* identity + current state */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 -rotate-45 text-sky-600" />
              <span className="text-sm font-bold text-slate-900">{flight.flightNo}</span>
              <span className="text-xs text-slate-500">
                {flight.origin} → {flight.destination}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {fmtDate(flight.departure)} · dep {fmtTime(flight.departure)} · {flight.seatsAvailable}{" "}
              seats
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Badge variant={sb.variant}>{sb.label}</Badge>
            {flight.delayMinutes > 0 && (
              <Badge variant="warning">+{durationLabel(flight.delayMinutes)}</Badge>
            )}
            {flight.cause !== "NONE" && (
              <Badge variant="default">{flight.cause.toLowerCase()}</Badge>
            )}
            {OPS_BADGE[flight.opsStatus] && (
              <Badge variant="info">{OPS_BADGE[flight.opsStatus]}</Badge>
            )}
          </div>
        </div>

        {/* live progress timeline — same stepper the passenger sees */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <FlightTimeline flight={flight} />
        </div>

        {/* delay + cause */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Est. delay</label>
          <input
            type="number"
            min={0}
            max={2880}
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            placeholder="min"
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <span className="text-xs text-slate-400">min · cause</span>
          <select
            value={cause}
            onChange={(e) => setCause(e.target.value as DisruptionCause)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            {CAUSES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={busy === "delay"}
            onClick={() => run("delay", { delayMinutes: Math.max(0, Number(delay) || 0), cause })}
          >
            {busy === "delay" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set delay"}
          </Button>
        </div>

        {/* boarding progress */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Boarding</span>
          <div className="flex flex-wrap gap-1">
            {OPS_STEPS.map((step) => {
              const active = flight.opsStatus === step.value;
              return (
                <button
                  key={step.value}
                  disabled={busy === "ops:" + step.value || cancelled}
                  onClick={() => run("ops:" + step.value, { opsStatus: step.value })}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                    active
                      ? "border-sky-500 bg-sky-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50"
                  )}
                >
                  {busy === "ops:" + step.value ? "…" : step.label}
                </button>
              );
            })}
          </div>
          {cancelled ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={busy === "restore"}
              onClick={() => run("restore", { status: "SCHEDULED", opsStatus: "ON_TIME" })}
            >
              {busy === "restore" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Restore"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              disabled={busy === "cancel"}
              onClick={() => run("cancel", { status: "CANCELLED", cause })}
            >
              {busy === "cancel" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Cancel flight"
              )}
            </Button>
          )}
        </div>

        {/* passenger-facing note */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional message to passengers (e.g. new ETD 14:30, proceed to Gate A12)"
            maxLength={160}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy === "note"}
            onClick={() => run("note", { note })}
          >
            {busy === "note" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send note
          </Button>
        </div>

        {/* service recovery — a "sorry for the inconvenience" goodwill gesture,
            applied to every passenger on this flight, on top of DGCA entitlements */}
        <div className="space-y-2.5 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <HeartHandshake className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-semibold text-slate-700">
              Sorry for the inconvenience — goodwill gesture
            </span>
            {flight.goodwill && (
              <Badge variant="success" className="ml-auto">
                Sent · {flight.goodwill.reference}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            A discretionary apology for every passenger on this flight — over and above
            their statutory entitlements.
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <GoodwillToggle
              active={meal}
              onClick={() => setMeal((v) => !v)}
              icon={<Utensils className="h-3.5 w-3.5" />}
              label="Free meal"
            />
            <GoodwillToggle
              active={accom}
              onClick={() => setAccom((v) => !v)}
              icon={<BedDouble className="h-3.5 w-3.5" />}
              label="Free accommodation"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Ticket discount</span>
            <div className="flex items-center rounded-lg border border-slate-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100">
              <input
                type="number"
                min={0}
                max={100}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="w-14 rounded-l-lg bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <span className="flex items-center px-2 text-slate-400">
                <Percent className="h-3.5 w-3.5" />
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDiscount("10")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50"
            >
              10% off
            </button>
            <span className="text-[11px] text-slate-400">on their next SkyJet flight</span>
          </div>

          <input
            value={gwMsg}
            onChange={(e) => setGwMsg(e.target.value)}
            maxLength={200}
            placeholder="Optional apology note (e.g. Thank you for your patience — a coffee is on us.)"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === "goodwill" || (gwEmpty && !flight.goodwill)}
              onClick={() =>
                run("goodwill", {
                  goodwill: {
                    freeMeal: meal,
                    freeAccommodation: accom,
                    discountPercent: gwDiscount,
                    message: gwMsg,
                  },
                })
              }
            >
              {busy === "goodwill" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <HeartHandshake className="h-3.5 w-3.5" />
              )}
              {flight.goodwill ? "Update gesture" : "Send with apologies"}
            </Button>
            {flight.goodwill && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === "goodwill-clear"}
                onClick={() => run("goodwill-clear", { goodwill: null })}
              >
                {busy === "goodwill-clear" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Clear
              </Button>
            )}
          </div>
        </div>

        {flight.opsUpdatedAt && (
          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Check className="h-3 w-3 text-emerald-500" /> Last updated {fmtTime(flight.opsUpdatedAt)}
          </p>
        )}
        {err && (
          <p className="flex items-center gap-1.5 text-[11px] text-red-600">
            <TriangleAlert className="h-3 w-3" /> {err}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A single toggleable perk chip in the goodwill editor. */
function GoodwillToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-emerald-500 bg-emerald-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
      )}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : icon}
      {label}
    </button>
  );
}
