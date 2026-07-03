"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  Armchair,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BedDouble,
  CalendarClock,
  Check,
  ChevronLeft,
  CircleCheck,
  Clock,
  CloudRain,
  FileText,
  Headset,
  HeartHandshake,
  Info,
  Loader2,
  Lock,
  Luggage,
  MessageSquare,
  Plane,
  PlaneTakeoff,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  TriangleAlert,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { durationLabel, fmtDateTime, fmtTime, inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/assistant";
import type { EligibilityResult } from "@/lib/eligibility";
import { hasFreeNonPrioritySeat, type SeatMap, type Seat } from "@/lib/seatmap";
import type { Priority } from "@/lib/priority";
import type { BoardingPass, BookingView, RebookOption } from "@/lib/service";
import type { GoodwillGesture } from "@/lib/types";
import { FlightOpsStrip, useLiveView } from "@/components/flight-ops-strip";
import { FlightTimeline } from "@/components/flight-timeline";

type Stats = {
  callsDeflected: number;
  minutesSaved: number;
  selfServed: number;
};
type Handoff = {
  reference: string;
  passenger: string;
  pnr: string;
  tier: string;
  context: string[];
};
type View = BookingView & {
  boardingPass?: BoardingPass;
  refund?: { reference: string; amount: number };
  handoff?: Handoff;
  stats?: Stats;
};
/** The three main paths a passenger can take on a disrupted booking. */
type Choice = "rebook" | "refund" | "wait" | null;

const DEMOS = [
  { label: "Weather cancellation", pnr: "SJ7QK2", lastName: "Sharma", tag: "DEL → BKK" },
  { label: "Technical cancellation", pnr: "SJ4RM9", lastName: "Nair", tag: "BOM → SIN" },
  { label: "5-hour weather delay", pnr: "SJ8XP5", lastName: "Mehta", tag: "BLR → DXB" },
  { label: "Unaccompanied minor", pnr: "SJ2MN1", lastName: "Gupta", tag: "needs agent" },
  { label: "Senior — priority seat", pnr: "SJ7SR1", lastName: "Reddy", tag: "DEL → DXB · rank 1" },
  { label: "Standard — waitlisted", pnr: "SJ7ST4", lastName: "Kapoor", tag: "DEL → DXB · held" },
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Deep link a QR encodes — scanning it opens the app straight into this booking. */
function deepLink(pnr: string, lastName: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?pnr=${encodeURIComponent(pnr)}&ln=${encodeURIComponent(lastName)}`;
}

/** A real, scannable QR code rendered from a value. */
function QrImage({
  value,
  size = 96,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 3 })
      .then((d) => {
        if (active) setSrc(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={cn("animate-pulse rounded bg-slate-100", className)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Scan to open" width={size} height={size} className={className} />
  );
}

export function RecoveryApp() {
  const [pnr, setPnr] = useState("");
  const [lastName, setLastName] = useState("");
  const [view, setView] = useState<View | null>(null);
  // The PNR + last name that actually authenticated — every subsequent write
  // re-sends them, so the server re-verifies identity on each mutation.
  const [creds, setCreds] = useState<{ pnr: string; lastName: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desktopMode, setDesktopMode] = useState(false);
  // Which of the three main options the passenger has picked, once disrupted.
  const [choice, setChoice] = useState<Choice>(null);

  // Deep-link entry: a scanned QR (/?pnr=..&ln=..) opens straight into the booking.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("pnr");
    const l = q.get("ln");
    if (p && l) lookup(p, l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(p = pnr, l = lastName) {
    setError(null);
    setBusy("lookup");
    try {
      setView(await api<View>("/api/lookup", { pnr: p, lastName: l }));
      setCreds({ pnr: p, lastName: l });
      setChoice(null);
    } catch (e) {
      // Keep the form in sync so a failed deep-link lands on a pre-filled form.
      setPnr(p.toUpperCase());
      setLastName(l);
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function rebook(flightId: string, seat?: string) {
    if (!view || !creds) return;
    setError(null);
    setBusy("rebook:" + flightId);
    try {
      setView(
        await api<View>("/api/rebook", {
          ref: view.booking.ref,
          lastName: creds.lastName,
          flightId,
          seat,
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: view.booking.version,
        })
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function refund() {
    if (!view || !creds) return;
    setError(null);
    setBusy("refund");
    try {
      setView(
        await api<View>("/api/refund", {
          ref: view.booking.ref,
          lastName: creds.lastName,
          idempotencyKey: crypto.randomUUID(),
          expectedVersion: view.booking.version,
        })
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function escalate() {
    if (!view || !creds) return;
    setError(null);
    setBusy("escalate");
    try {
      setView(
        await api<View>("/api/escalate", {
          ref: view.booking.ref,
          lastName: creds.lastName,
        })
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setView(null);
    setCreds(null);
    setPnr("");
    setLastName("");
    setError(null);
    setChoice(null);
  }

  const status = view?.booking.status;

  // Live updates: while the passenger is still deciding, poll the flight so an
  // ops push (delay, boarding call, cancellation) appears without a refresh.
  useLiveView(creds, status === "CONFIRMED" || status === "DISRUPTED", (fresh) =>
    setView((cur) => {
      const s = cur?.booking.status;
      return cur && (s === "CONFIRMED" || s === "DISRUPTED")
        ? ({ ...cur, ...fresh } as View)
        : cur;
    })
  );

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-4 px-4 pb-16 pt-5 transition-all duration-300",
        desktopMode ? "max-w-5xl" : "max-w-md"
      )}
    >
      {/* View Switcher Toggle */}
      <div className="flex justify-end mb-1">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
          <button
            onClick={() => setDesktopMode(false)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
              !desktopMode
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            📱 Mobile View
          </button>
          <button
            onClick={() => setDesktopMode(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer",
              desktopMode
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            💻 Desktop View
          </button>
        </div>
      </div>

      <Header />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!view && (
        <Identify
          pnr={pnr}
          lastName={lastName}
          setPnr={setPnr}
          setLastName={setLastName}
          onLookup={() => lookup()}
          onDemo={(d) => {
            setPnr(d.pnr);
            setLastName(d.lastName);
            lookup(d.pnr, d.lastName);
          }}
          busy={busy === "lookup"}
          desktopMode={desktopMode}
        />
      )}

      {view && (status === "CONFIRMED" || status === "DISRUPTED") && (
        <>
          {/* First thing after login: how late is my flight? */}
          <FlightDelayBanner view={view} />
          <div className={cn(desktopMode && "grid grid-cols-1 md:grid-cols-2 gap-6 items-start")}>
          <div className="space-y-4">
            <StatusHeader view={view} />
            <FlightOpsStrip flight={view.flight} />
            {view.flight.goodwill && <GoodwillCard goodwill={view.flight.goodwill} />}
            {view.escalation.escalate ? (
              <EscalationCallout
                reasons={view.escalation.reasons}
                onEscalate={escalate}
                busy={busy === "escalate"}
              />
            ) : (
              <>
                <ProceedOptions view={view} choice={choice} onChoose={setChoice} />
                {choice === "rebook" && (
                  <RebookSection
                    view={view}
                    lastName={creds?.lastName ?? ""}
                    onRebook={rebook}
                    busy={busy}
                  />
                )}
                {choice === "refund" && (
                  <RefundConfirm
                    view={view}
                    onConfirm={refund}
                    busy={busy === "refund"}
                  />
                )}
                {choice === "wait" && <WaitPanel view={view} />}
                <button
                  onClick={escalate}
                  disabled={busy === "escalate"}
                  className="mx-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  <Headset className="h-3.5 w-3.5" /> Talk to an agent instead
                </button>
              </>
            )}
            <EligibilityPanel elig={view.eligibility} />
          </div>
          <div className="space-y-4">
            <AssistantPanel pnr={view.booking.ref} lastName={creds?.lastName ?? ""} />
            <StartOver onClick={startOver} />
          </div>
          </div>
        </>
      )}

      {view && status === "REBOOKED" && view.boardingPass && (
        <RebookedScreen
          bp={view.boardingPass}
          settlement={view.fareSettlement}
          goodwill={view.flight.goodwill}
          onDone={startOver}
          desktopMode={desktopMode}
        />
      )}

      {view && status === "REFUND_REQUESTED" && view.refund && (
        <div className={cn("space-y-4", desktopMode && "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0 items-start")}>
          <div className="space-y-4">
            <SuccessBanner
              title="Refund initiated."
              subtitle="You will see it on your original payment method soon."
            />
            <Card>
              <CardContent className="space-y-3 p-5">
                <Row label="Refund reference" value={view.refund.reference} mono />
                <Row label="Amount" value={inr(view.refund.amount)} />
                <p className="text-xs text-slate-500">
                  A confirmation has been sent to {view.booking.passenger.email}.
                </p>
              </CardContent>
            </Card>
            {view.flight.goodwill && <GoodwillCard goodwill={view.flight.goodwill} />}
          </div>
          <div className="space-y-4">
            <StartOver onClick={startOver} label="Done" />
          </div>
        </div>
      )}

      {view && status === "ESCALATED" && view.handoff && (
        <div className={cn("space-y-4", desktopMode && "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0 items-start")}>
          <div className="space-y-4">
            <SuccessBanner
              title="Connected to an agent."
              subtitle="A specialist will reach out — with your full context already loaded."
              tone="sky"
            />
          </div>
          <div className="space-y-4">
            <HandoffCard handoff={view.handoff} />
            <StartOver onClick={startOver} label="Done" />
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

/* ─────────────────────────── header / footer ─────────────────────────── */

function Header() {
  return (
    <header className="flex items-center gap-3 pt-1">
      <div className="sky-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm">
        <Plane className="h-5 w-5 -rotate-45" />
      </div>
      <div>
        <p className="text-base font-bold leading-tight text-slate-900">SkyJet Airways</p>
        <p className="text-xs font-medium text-sky-700">Flight Recovery · Self-Service</p>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <p className="mt-auto pt-4 text-center text-[11px] text-slate-400">
      Prototype · 22North Product Engineering Challenge 2026 · data is simulated
    </p>
  );
}

/* ───────────────────────────── identify ──────────────────────────────── */

function Identify({
  pnr,
  lastName,
  setPnr,
  setLastName,
  onLookup,
  onDemo,
  busy,
  desktopMode,
}: {
  pnr: string;
  lastName: string;
  setPnr: (v: string) => void;
  setLastName: (v: string) => void;
  onLookup: () => void;
  onDemo: (d: (typeof DEMOS)[number]) => void;
  busy: boolean;
  desktopMode?: boolean;
}) {
  return (
    <div className={cn("space-y-4", desktopMode && "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0 items-start")}>
      {/* Proactive alert — SkyJet reaches out first */}
      <div className={cn("space-y-4", desktopMode && "h-full")}>
        <Card className="overflow-hidden border-emerald-200 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 bg-emerald-600 px-4 py-2 text-white">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-semibold">SkyJet · WhatsApp</span>
              <span className="ml-auto text-[10px] opacity-80">now</span>
            </div>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-slate-700">
                Your flight <b>SJ 301 (DEL → BKK)</b> is cancelled due to weather. We have
                held a seat for you on the next flight. Recover in under 30 seconds — no need
                to call.
              </p>
            </CardContent>
          </div>
          <div className="p-4 pt-0">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="shrink-0 rounded-lg bg-white p-1.5 shadow-sm">
                <QrImage value={deepLink(DEMOS[0].pnr, DEMOS[0].lastName)} size={72} />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onDemo(DEMOS[0])}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <span className="flex items-center gap-2">
                    <QrCode className="h-4 w-4" /> Open self-service
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Scan with your phone, or tap to open — no PNR typing.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className={cn(desktopMode && "hidden")}>
          <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or find your booking
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>

        <Card>
          <CardContent className="space-y-3 p-5">
            <Field label="Booking reference (PNR)">
              <input
                value={pnr}
                onChange={(e) => setPnr(e.target.value.toUpperCase())}
                placeholder="e.g. SJ7QK2"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm uppercase tracking-wide outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </Field>
            <Field label="Last name">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Sharma"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </Field>
            <Button className="w-full" onClick={onLookup} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Find my booking
            </Button>
          </CardContent>
        </Card>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">Try a scenario</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.pnr}
                onClick={() => onDemo(d)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="text-xs font-semibold text-slate-800">{d.label}</p>
                <p className="text-[11px] text-slate-400">{d.tag}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/* ─────────────── estimated delay — the first thing after login ────────── */

function FlightDelayBanner({ view }: { view: View }) {
  const f = view.flight;
  const cancelled = f.status === "CANCELLED";
  // Original departure shifted by the delay = the new estimated departure.
  const estimatedDeparture = new Date(
    Date.parse(f.departure) + f.delayMinutes * 60_000
  ).toISOString();

  return (
    <Card
      className={cn(
        "overflow-hidden",
        cancelled ? "border-red-300" : "border-amber-300"
      )}
    >
      <div
        className={cn(
          "px-5 py-4 text-white",
          cancelled ? "bg-red-600" : "bg-amber-500"
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">
          <CalendarClock className="h-3.5 w-3.5" />
          {cancelled ? "Flight status" : "Estimated delay"}
        </div>
        <p className="mt-1 text-3xl font-black leading-none">
          {cancelled ? "Flight cancelled" : durationLabel(f.delayMinutes)}
        </p>
        {!cancelled && f.delayMinutes > 0 && (
          <p className="mt-1.5 text-sm font-medium opacity-95">
            New estimated departure {fmtTime(estimatedDeparture)}
            <span className="opacity-75"> · was {fmtTime(f.departure)}</span>
          </p>
        )}
      </div>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <span className="text-sm text-slate-600">
          <b className="text-slate-900">{f.flightNo}</b> · {f.origin} → {f.destination}
        </span>
        <span className="text-xs text-slate-400">
          Hi {view.booking.passenger.firstName}
        </span>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── status header ───────────────────────────── */

function StatusHeader({ view }: { view: View }) {
  const f = view.flight;
  const cancelled = f.status === "CANCELLED";
  const tone = cancelled ? "red" : "amber";
  const title = cancelled ? "Flight cancelled" : `Delayed by ${durationLabel(f.delayMinutes)}`;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        tone === "red" ? "border-red-200" : "border-amber-200"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white",
          tone === "red" ? "bg-red-600" : "bg-amber-500"
        )}
      >
        <TriangleAlert className="h-4 w-4" />
        {title}
      </div>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <FlightPoint code={f.origin} city={f.originCity} time={f.departure} />
          <div className="flex flex-1 flex-col items-center px-2">
            <span className="text-[11px] text-slate-400">{f.flightNo}</span>
            <div className="my-1 flex w-full items-center gap-1 text-slate-300">
              <span className="h-px flex-1 bg-slate-200" />
              <Plane className="h-3.5 w-3.5 -rotate-45" />
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <span className="text-[11px] text-slate-400">{durationLabel(f.durationMin)}</span>
          </div>
          <FlightPoint code={f.destination} city={f.destinationCity} time={f.arrival} alignEnd />
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" /> Flight progress
          </p>
          <FlightTimeline flight={f} />
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <CloudRain className="h-4 w-4 text-sky-600" />
          <span>
            Reason: <b className="text-slate-800">{view.eligibility.causeLabel}</b>
          </span>
        </div>

        <p className="text-sm text-slate-600">
          We are sorry for the disruption, {view.booking.passenger.firstName}. Here is how
          we can get you moving right away.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="info">PNR {view.booking.ref}</Badge>
          <Badge>{view.booking.passenger.firstName} {view.booking.passenger.lastName}</Badge>
          {view.booking.passenger.tier !== "STANDARD" && (
            <Badge variant="warning">{view.booking.passenger.tier} member</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FlightPoint({
  code,
  city,
  time,
  alignEnd,
}: {
  code: string;
  city: string;
  time: string;
  alignEnd?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", alignEnd && "items-end text-right")}>
      <span className="text-2xl font-bold tracking-tight text-slate-900">{code}</span>
      <span className="text-[11px] text-slate-500">{city}</span>
      <span className="mt-0.5 text-xs font-medium text-slate-700">{fmtTime(time)}</span>
    </div>
  );
}

/* ─────────────────────── eligibility (the star) ──────────────────────── */

function EligibilityPanel({ elig }: { elig: EligibilityResult }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-bold text-slate-900">What you are entitled to</h3>
        </div>
        <p className="text-sm text-slate-600">{elig.headline}</p>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          <Entitlement
            icon={<RefreshCw className="h-4 w-4" />}
            label="Free rebooking"
            ok={elig.rebook.eligible}
            reason={elig.rebook.reason}
          />
          <Entitlement
            icon={<Wallet className="h-4 w-4" />}
            label={`Full refund${elig.refund.eligible ? ` · ${inr(elig.refund.amount)}` : ""}`}
            ok={elig.refund.eligible}
            reason={elig.refund.reason}
          />
          <Entitlement
            icon={<Ticket className="h-4 w-4" />}
            label={`Cash compensation${elig.compensation.eligible ? ` · ${inr(elig.compensation.amount)}` : ""}`}
            ok={elig.compensation.eligible}
            reason={elig.compensation.reason}
            neutralWhenOff
          />
          <Entitlement
            icon={<Info className="h-4 w-4" />}
            label="Care during the wait"
            ok={elig.dutyOfCare.meals || elig.dutyOfCare.hotel}
            reason={elig.dutyOfCare.reason}
            neutralWhenOff
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Decision basis: {elig.ruleRef}</span>
        </div>
        {elig.refund.eligible && (
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Prefer to decide later? If you take no action, we will automatically
              refund you within 24 hours.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Entitlement({
  icon,
  label,
  ok,
  reason,
  neutralWhenOff,
}: {
  icon: ReactNode;
  label: string;
  ok: boolean;
  reason: string;
  neutralWhenOff?: boolean;
}) {
  return (
    <div className="flex gap-3 p-3">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          ok
            ? "bg-emerald-100 text-emerald-700"
            : neutralWhenOff
              ? "bg-slate-100 text-slate-400"
              : "bg-slate-100 text-slate-400"
        )}
      >
        {ok ? <Check className="h-4 w-4" /> : icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{label}</span>
          {ok ? (
            <Badge variant="success">Included</Badge>
          ) : (
            <Badge variant={neutralWhenOff ? "warning" : "default"}>Not applicable</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

/* ───────────────────── goodwill / service recovery ───────────────────── */

/** A discretionary "sorry for the inconvenience" gesture the airline extended.
 *  Shown warmly, and clearly marked as being on top of statutory entitlements. */
function GoodwillCard({ goodwill }: { goodwill: GoodwillGesture }) {
  const perks: { icon: ReactNode; label: string; sub: string }[] = [];
  if (goodwill.freeMeal) {
    perks.push({
      icon: <Utensils className="h-4 w-4" />,
      label: "Complimentary meal",
      sub: "A meal voucher to use at the airport — on us.",
    });
  }
  if (goodwill.freeAccommodation) {
    perks.push({
      icon: <BedDouble className="h-4 w-4" />,
      label: "Complimentary accommodation",
      sub: "A hotel room for your wait, arranged by SkyJet.",
    });
  }
  if (goodwill.discountPercent > 0) {
    perks.push({
      icon: <Ticket className="h-4 w-4" />,
      label: `${goodwill.discountPercent}% off your next flight`,
      sub: "Applied as a discount on your next SkyJet booking.",
    });
  }
  if (perks.length === 0) return null;

  return (
    <Card className="overflow-hidden border-rose-200">
      <div className="flex items-center gap-2 bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white">
        <HeartHandshake className="h-4 w-4" />
        With our apologies
      </div>
      <CardContent className="space-y-3 p-5">
        <p className="text-sm text-slate-600">
          {goodwill.message?.trim()
            ? goodwill.message
            : "We're truly sorry for the disruption to your journey. As a gesture of goodwill, SkyJet would like to offer you:"}
        </p>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {perks.map((p) => (
            <div key={p.label} className="flex gap-3 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                {p.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{p.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{p.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            A goodwill gesture — in addition to your entitlements.
          </span>
          <span className="font-mono font-semibold">{goodwill.reference}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── rebook section ──────────────────────────── */

function RebookSection({
  view,
  lastName,
  onRebook,
  busy,
}: {
  view: View;
  lastName: string;
  onRebook: (flightId: string, seat: string) => void;
  busy: string | null;
}) {
  // Two-step flow: pick a flight, then pick a seat on that flight's seat map.
  const [seatFor, setSeatFor] = useState<string | null>(null);
  const [map, setMap] = useState<SeatMap | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  async function openSeats(flightId: string) {
    setSeatFor(flightId);
    setSelected(null);
    setMap(null);
    setPriority(null);
    setMapError(null);
    setLoadingMap(true);
    try {
      const r = await api<{
        seatMap: SeatMap;
        priority: Priority;
        recommendedSeat: string | null;
      }>("/api/seatmap", {
        ref: view.booking.ref,
        lastName,
        flightId,
      });
      setMap(r.seatMap);
      setPriority(r.priority);
      // Preselect the seat their priority holds for them.
      setSelected(r.recommendedSeat ?? firstFree(r.seatMap));
    } catch (e) {
      setMapError(errMsg(e));
    } finally {
      setLoadingMap(false);
    }
  }

  function backToFlights() {
    setSeatFor(null);
    setMap(null);
    setPriority(null);
    setSelected(null);
    setMapError(null);
  }

  if (!view.options.length) return null;
  const held = view.options.find((o) => o.recommended) ?? view.options[0];
  const rest = view.options.filter((o) => o.flight.id !== held.flight.id);

  // ── Step 2: the airplane seat map for the chosen flight ──
  if (seatFor) {
    return (
      <SeatSelect
        option={view.options.find((o) => o.flight.id === seatFor)}
        map={map}
        priority={priority}
        selected={selected}
        loading={loadingMap}
        error={mapError}
        busy={busy === "rebook:" + seatFor}
        onPick={setSelected}
        onBack={backToFlights}
        onConfirm={() => selected && onRebook(seatFor, selected)}
      />
    );
  }

  // ── Step 1: choose which flight to move to ──
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 px-1 text-sm font-bold text-slate-900">
        <RefreshCw className="h-4 w-4 text-sky-600" /> Choose your new flight
      </h3>
      <HeldRebooking option={held} onSelect={() => openSeats(held.flight.id)} />
      {rest.length > 0 && (
        <div className="space-y-2">
          <p className="px-1 text-xs font-medium text-slate-500">
            Or choose a different flight
          </p>
          {rest.map((o) => (
            <OptionCard
              key={o.flight.id}
              option={{ ...o, recommended: false }}
              onSelect={() => openSeats(o.flight.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** First free seat on a map — the picker's default selection. */
function firstFree(map: SeatMap): string | null {
  return map.seats.find((s) => !s.occupied)?.id ?? null;
}

/** How a fare difference reads to the passenger. >0 pay, <0 refund, 0 none. */
function fareDiffDisplay(diff: number): { text: string; tone: "pay" | "refund" | "none" } {
  if (diff > 0) return { text: `Pay ${inr(diff)} more`, tone: "pay" };
  if (diff < 0) return { text: `${inr(-diff)} refund`, tone: "refund" };
  return { text: "No fare difference", tone: "none" };
}

function FareTag({ diff }: { diff: number }) {
  const d = fareDiffDisplay(diff);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        d.tone === "pay"
          ? "bg-amber-50 text-amber-700"
          : d.tone === "refund"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-500"
      )}
    >
      {d.tone === "pay" ? (
        <ArrowUp className="h-3 w-3" />
      ) : d.tone === "refund" ? (
        <ArrowDown className="h-3 w-3" />
      ) : null}
      {d.text}
    </span>
  );
}

/** Shown in place of the seat button when this flight's seats are being held for
 *  higher-priority passengers (senior citizens first) — the passenger is
 *  waitlisted for it and should pick a flight with more room. */
function WaitlistNote({ note }: { note: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{note}</span>
    </div>
  );
}

function HeldRebooking({
  option,
  onSelect,
}: {
  option: RebookOption;
  onSelect: () => void;
}) {
  const f = option.flight;
  return (
    <Card className="border-sky-400 ring-2 ring-sky-100">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="info" className="font-semibold">
            ★ Recommended — best option
          </Badge>
          <span className="text-[11px] text-emerald-600">{f.seatsAvailable} seats left</span>
        </div>
        <p className="text-xs text-slate-500">
          The best available option — continue to choose your seat, or pick another below.
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-slate-900">
              {fmtTime(f.departure)} → {fmtTime(f.arrival)}
            </p>
            <p className="text-[11px] text-slate-500">
              {f.flightNo} · {fmtDateTime(f.departure).split(" · ")[0]}
            </p>
          </div>
          <p className="text-xs text-slate-500">{durationLabel(f.durationMin)}</p>
        </div>
        <p className="text-xs text-slate-500">{option.reason}</p>
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="text-[11px] font-medium text-slate-500">Fare difference</span>
          <FareTag diff={option.fareDiff} />
        </div>
        {option.available ? (
          <Button className="w-full" onClick={onSelect}>
            <Armchair className="h-4 w-4" /> Choose your seat
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <WaitlistNote note={option.capacityNote} />
        )}
      </CardContent>
    </Card>
  );
}

function OptionCard({
  option,
  onSelect,
}: {
  option: RebookOption;
  onSelect: () => void;
}) {
  const f = option.flight;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">
              {fmtTime(f.departure)} → {fmtTime(f.arrival)}
            </p>
            <p className="text-[11px] text-slate-500">
              {f.flightNo} · {fmtDateTime(f.departure).split(" · ")[0]}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{durationLabel(f.durationMin)}</p>
            <p className="text-[11px] text-emerald-600">{f.seatsAvailable} seats left</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">{option.reason}</p>
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="text-[11px] font-medium text-slate-500">Fare difference</span>
          <FareTag diff={option.fareDiff} />
        </div>
        {option.available ? (
          <Button className="w-full" variant="outline" onClick={onSelect}>
            <Armchair className="h-4 w-4" /> Select seat
          </Button>
        ) : (
          <WaitlistNote note={option.capacityNote} />
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── seat selection ──────────────────────────── */

const PRIORITY_TONE: Record<string, string> = {
  SENIOR: "border-violet-200 bg-violet-50 text-violet-800",
  BUSINESS: "border-sky-200 bg-sky-50 text-sky-800",
  CHILD_INFANT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  STANDARD: "border-slate-200 bg-slate-50 text-slate-700",
};

function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function PriorityBanner({ priority }: { priority: Priority }) {
  return (
    <div className={cn("rounded-xl border p-3", PRIORITY_TONE[priority.tier])}>
      <div className="flex items-center gap-1.5 text-xs font-bold">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        Priority: {priority.label} · {ordinal(priority.rank)} priority
      </div>
      <p className="mt-1 text-[11px] leading-relaxed opacity-90">{priority.reason}</p>
    </div>
  );
}

function SeatSelect({
  option,
  map,
  priority,
  selected,
  loading,
  error,
  busy,
  onPick,
  onBack,
  onConfirm,
}: {
  option?: RebookOption;
  map: SeatMap | null;
  priority: Priority | null;
  selected: string | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onPick: (id: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const f = option?.flight;
  const fareDiff = option?.fareDiff ?? 0;
  const rank = priority?.rank ?? 4;
  const selectedSeat = map?.seats.find((s) => s.id === selected) ?? null;
  const seatKind = selectedSeat
    ? selectedSeat.window
      ? "window"
      : selectedSeat.aisle
        ? "aisle"
        : "middle"
    : null;
  const confirmLabel = !selected
    ? "Select a seat to continue"
    : fareDiff > 0
      ? `Pay ${inr(fareDiff)} & confirm seat ${selected}`
      : fareDiff < 0
        ? `Confirm seat ${selected} · ${inr(-fareDiff)} refund`
        : `Confirm seat ${selected} & get boarding pass`;

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Change flight
      </button>

      <Card className="border-sky-400 ring-2 ring-sky-100">
        <CardContent className="space-y-4 p-4">
          {f && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-slate-900">
                  {fmtTime(f.departure)} → {fmtTime(f.arrival)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {f.flightNo} · {fmtDateTime(f.departure).split(" · ")[0]} · {f.aircraft}
                </p>
              </div>
              <Badge variant="info" className="font-semibold">
                Pick a seat
              </Badge>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the cabin…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {map && !loading && (
            <>
              {priority && <PriorityBanner priority={priority} />}
              <p className="text-xs text-slate-500">
                <b className="text-emerald-600">{map.available}</b> of {map.total} seats open on
                this aircraft. Tap a seat to choose it.
              </p>
              <SeatMapView map={map} selected={selected} priorityRank={rank} onPick={onPick} />
              <SeatLegend />
              <div className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Your seat</span>
                  <span className="text-sm font-bold text-slate-900">
                    {selectedSeat ? `${selectedSeat.id} · ${seatKind}` : "Tap a seat above"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
                  <span className="text-xs text-slate-500">Fare difference</span>
                  <FareTag diff={fareDiff} />
                </div>
              </div>
              <Button className="w-full" onClick={onConfirm} disabled={!selected || busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {confirmLabel}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** The airplane: a vertical fuselage of tappable seats. */
function SeatMapView({
  map,
  selected,
  priorityRank,
  onPick,
}: {
  map: SeatMap;
  selected: string | null;
  priorityRank: number;
  onPick: (id: string) => void;
}) {
  const cols = map.columns;
  const split = Math.ceil(cols.length / 2); // A B C | aisle | D E F
  const left = cols.slice(0, split);
  const right = cols.slice(split);

  // Seats arrive row-major; chunk them back into rows for layout.
  const rows: Seat[][] = [];
  for (let i = 0; i < map.seats.length; i += cols.length) {
    rows.push(map.seats.slice(i, i + cols.length));
  }

  const seatAt = (row: Seat[], col: string) => row.find((s) => s.col === col);
  // A standard passenger may only take a priority-zone seat if nothing else is
  // free — otherwise those front seats are locked (reserved).
  const lockPriority = priorityRank > 3 && hasFreeNonPrioritySeat(map);
  const isReserved = (s: Seat) => !s.occupied && s.priority && lockPriority;
  const renderSeat = (seat: Seat) => (
    <SeatButton
      key={seat.id}
      seat={seat}
      selected={selected === seat.id}
      reserved={isReserved(seat)}
      onPick={onPick}
    />
  );

  return (
    <div className="mx-auto max-w-[264px]">
      {/* nose */}
      <div className="mx-auto flex w-24 flex-col items-center">
        <div className="h-5 w-24 rounded-t-[999px] border-x border-t border-slate-200 bg-slate-50" />
        <div className="flex items-center gap-1 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          <PlaneTakeoff className="h-3 w-3" /> Front of cabin
        </div>
      </div>

      {/* column letters */}
      <div className="mb-1 flex items-center justify-center gap-1 text-[9px] font-semibold text-slate-300">
        <span className="w-4" />
        {left.map((c) => (
          <span key={c} className="w-7 text-center">
            {c}
          </span>
        ))}
        <span className="w-4" />
        {right.map((c) => (
          <span key={c} className="w-7 text-center">
            {c}
          </span>
        ))}
      </div>

      {/* fuselage (scrolls — it's a whole aircraft) */}
      <div className="max-h-[340px] overflow-y-auto rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-2 py-3">
        <div className="space-y-1">
          {rows.map((row) => {
            const rowNo = row[0]?.row ?? 0;
            const priorityBoundary = rowNo === map.priorityRows;
            return (
              <div key={rowNo}>
                <div className="flex items-center justify-center gap-1">
                  <span className="w-4 text-right text-[9px] font-medium text-slate-300">
                    {rowNo}
                  </span>
                  {left.map((c) => {
                    const seat = seatAt(row, c);
                    return seat ? renderSeat(seat) : <span key={c} className="h-7 w-7" />;
                  })}
                  <span className="w-4" />
                  {right.map((c) => {
                    const seat = seatAt(row, c);
                    return seat ? renderSeat(seat) : <span key={c} className="h-7 w-7" />;
                  })}
                </div>
                {priorityBoundary && (
                  <div className="my-1.5 flex items-center gap-2 px-6 text-[8px] font-semibold uppercase tracking-wider text-indigo-400">
                    <span className="h-px flex-1 bg-indigo-200" /> Priority seating above
                    <span className="h-px flex-1 bg-indigo-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="py-1 text-center text-[9px] font-semibold uppercase tracking-wider text-slate-300">
        Rear of cabin
      </div>
    </div>
  );
}

function SeatButton({
  seat,
  selected,
  reserved,
  onPick,
}: {
  seat: Seat;
  selected: boolean;
  reserved: boolean;
  onPick: (id: string) => void;
}) {
  if (seat.occupied) {
    return (
      <div
        title={`${seat.id} · occupied`}
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-200/70"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      </div>
    );
  }
  if (reserved) {
    return (
      <div
        title={`${seat.id} · reserved for priority passengers`}
        className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-md border border-indigo-200 bg-indigo-50/60 text-indigo-300"
      >
        <Lock className="h-3 w-3" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPick(seat.id)}
      aria-pressed={selected}
      title={`${seat.id} · available${seat.priority ? " · priority seat" : ""}`}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md border text-[9px] font-bold transition-colors",
        selected
          ? "border-sky-600 bg-sky-600 text-white shadow-sm"
          : seat.priority
            ? "border-indigo-300 bg-indigo-50 text-indigo-500 hover:border-sky-400 hover:bg-sky-50"
            : "border-slate-300 bg-white text-slate-400 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-600"
      )}
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : seat.col}
    </button>
  );
}

function SeatLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
      <LegendChip className="border-slate-300 bg-white" label="Available" />
      <LegendChip className="border-indigo-300 bg-indigo-50" label="Priority" />
      <LegendChip className="border-sky-600 bg-sky-600" label="Your seat" />
      <LegendChip className="border-slate-200 bg-slate-200/70" label="Occupied" />
    </div>
  );
}

function LegendChip({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3.5 w-3.5 rounded border", className)} />
      {label}
    </span>
  );
}

/* ─────────────────────── escalation / secondary ──────────────────────── */

function EscalationCallout({
  reasons,
  onEscalate,
  busy,
}: {
  reasons: string[];
  onEscalate: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-violet-200">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-bold text-slate-900">A specialist should handle this</h3>
        </div>
        <p className="text-sm text-slate-600">
          This booking needs assisted handling, so we will not automate it:
        </p>
        <ul className="space-y-1">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
              {r}
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={onEscalate} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headset className="h-4 w-4" />}
          Connect me to an agent
        </Button>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── the three main options ────────────────────────── */

function ProceedOptions({
  view,
  choice,
  onChoose,
}: {
  view: View;
  choice: Choice;
  onChoose: (c: Choice) => void;
}) {
  const delayed = view.flight.status === "DELAYED";
  const canRefund = view.eligibility.refund.eligible;
  return (
    <div className="space-y-3">
      <h3 className="px-1 text-sm font-bold text-slate-900">What would you like to do?</h3>
      <div className="space-y-2">
        <OptionChoice
          active={choice === "rebook"}
          icon={<RefreshCw className="h-5 w-5" />}
          title="Rebook the flight"
          subtitle="Move to the next available SkyJet flight — free of charge."
          onClick={() => onChoose(choice === "rebook" ? null : "rebook")}
        />
        {canRefund && (
          <OptionChoice
            active={choice === "refund"}
            icon={<Wallet className="h-5 w-5" />}
            title="Refund & cancel the flight"
            subtitle={`Cancel and get a full refund of ${inr(view.eligibility.refund.amount)}.`}
            onClick={() => onChoose(choice === "refund" ? null : "refund")}
          />
        )}
        {delayed && (
          <OptionChoice
            active={choice === "wait"}
            icon={<Clock className="h-5 w-5" />}
            title="Wait for the existing flight"
            subtitle="Keep your seat and travel on the delayed flight."
            onClick={() => onChoose(choice === "wait" ? null : "wait")}
          />
        )}
      </div>
    </div>
  );
}

function OptionChoice({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-100"
          : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <ArrowRight
        className={cn("h-4 w-4 shrink-0", active ? "text-sky-600" : "text-slate-300")}
      />
    </button>
  );
}

function RefundConfirm({
  view,
  onConfirm,
  busy,
}: {
  view: View;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-bold text-slate-900">Refund &amp; cancel</h3>
        </div>
        <p className="text-sm text-slate-600">
          We will cancel {view.flight.flightNo} and refund the full fare to your original
          payment method. This cannot be undone.
        </p>
        <div className="rounded-xl bg-slate-50 p-3">
          <Row label="Refund amount" value={inr(view.eligibility.refund.amount)} />
        </div>
        <Button className="w-full" variant="secondary" onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Confirm refund &amp; cancel
        </Button>
      </CardContent>
    </Card>
  );
}

function WaitPanel({ view }: { view: View }) {
  const f = view.flight;
  const estimatedDeparture = new Date(
    Date.parse(f.departure) + f.delayMinutes * 60_000
  ).toISOString();
  const care = view.eligibility.dutyOfCare;
  return (
    <Card className="border-emerald-200">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">You are keeping this flight</h3>
        </div>
        <p className="text-sm text-slate-600">
          No change needed — you will travel on {f.flightNo} ({f.origin} → {f.destination}).
        </p>
        <div className="rounded-xl bg-slate-50 p-3">
          <Row label="New estimated departure" value={fmtTime(estimatedDeparture)} />
          <Row label="Originally scheduled" value={fmtTime(f.departure)} />
        </div>
        {(care.meals || care.hotel) && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{care.reason}</span>
          </div>
        )}
        <p className="text-xs text-slate-500">
          We will notify you on WhatsApp if the departure time changes again. You can still
          rebook or request a refund any time before departure.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── boarding pass ───────────────────────────── */

function BoardingPassCard({
  bp,
  checkedIn,
}: {
  bp: BoardingPass;
  checkedIn?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="sky-gradient flex items-center justify-between px-5 py-3 text-white">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Plane className="h-4 w-4 -rotate-45" /> Boarding Pass
        </span>
        <span className="text-xs opacity-80">
          {checkedIn ? "Checked in" : bp.cabin}
        </span>
      </div>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-slate-900">{bp.from.split(" ")[0]}</p>
            <p className="text-[11px] text-slate-500">{fmtTime(bp.departure)}</p>
          </div>
          <Plane className="h-5 w-5 -rotate-45 text-sky-500" />
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{bp.to.split(" ")[0]}</p>
            <p className="text-[11px] text-slate-500">{fmtTime(bp.arrival)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-dashed border-slate-200 pt-4 text-sm">
          <Info2 label="Passenger" value={bp.passengerName} />
          <Info2 label="Flight" value={bp.flightNo} />
          <Info2 label="Gate" value={bp.gate} />
          <Info2 label="Seat" value={bp.seat} />
          <Info2 label="Boarding" value={fmtTime(bp.boarding)} />
          <Info2 label="Seq" value={bp.sequence} />
        </div>

        <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-4">
          <div>
            <p className="text-[11px] text-slate-400">PNR</p>
            <p className="font-mono text-sm font-semibold text-slate-800">{bp.pnr}</p>
            <p className="mt-1 text-[10px] text-slate-400">Scan to manage</p>
          </div>
          <QrImage
            value={deepLink(bp.pnr, bp.passengerName.split(" ").slice(-1)[0])}
            size={56}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}

/* ─────────────────────────── handoff / misc ──────────────────────────── */

function HandoffCard({ handoff }: { handoff: Handoff }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Row label="Case reference" value={handoff.reference} mono />
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">
            Context handed to the agent
          </p>
          <ul className="space-y-1.5 rounded-xl bg-slate-50 p-3">
            {handoff.context.map((c) => (
              <li key={c} className="flex items-start gap-2 text-xs text-slate-600">
                <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                {c}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-500">
          The agent already has everything above — you will not need to repeat yourself.
        </p>
      </CardContent>
    </Card>
  );
}

function SuccessBanner({
  title,
  subtitle,
  tone = "emerald",
}: {
  title: string;
  subtitle: string;
  tone?: "emerald" | "sky";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-4 text-white",
        tone === "emerald" ? "bg-emerald-600" : "sky-gradient"
      )}
    >
      <CircleCheck className="h-8 w-8 shrink-0" />
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm opacity-90">{subtitle}</p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={cn("text-sm font-semibold text-slate-800", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function StartOver({ onClick, label = "Start over" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mx-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-slate-500 hover:text-slate-700"
    >
      <RefreshCw className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function RebookedScreen({
  bp,
  settlement,
  goodwill,
  onDone,
  desktopMode,
}: {
  bp: BoardingPass;
  settlement?: { difference: number };
  goodwill?: GoodwillGesture;
  onDone: () => void;
  desktopMode?: boolean;
}) {
  const [checkedIn, setCheckedIn] = useState(false);
  const diff = settlement?.difference ?? 0;
  return (
    <div className={cn("space-y-4", desktopMode && "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0 items-start")}>
      <div className="space-y-4">
        <SuccessBanner
          title="You are rebooked."
          subtitle="Your new boarding pass is ready — no call, no queue."
        />
        {diff !== 0 && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
              diff > 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            )}
          >
            <Wallet className="h-4 w-4 shrink-0" />
            {diff > 0 ? (
              <span>
                A fare difference of <b>{inr(diff)}</b> was charged to your original payment
                method.
              </span>
            ) : (
              <span>
                <b>{inr(-diff)}</b> fare difference will be refunded to your original payment
                method.
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Luggage className="h-4 w-4 shrink-0" />
          Your checked baggage is being re-routed to {bp.flightNo} automatically.
        </div>
        {goodwill && <GoodwillCard goodwill={goodwill} />}
        {checkedIn ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white">
            <BadgeCheck className="h-4 w-4" /> Checked in — proceed to gate {bp.gate}
          </div>
        ) : (
          <Button className="w-full" onClick={() => setCheckedIn(true)}>
            <Check className="h-4 w-4" /> Check in for this flight
          </Button>
        )}
        <StartOver onClick={onDone} label="Done" />
      </div>
      <div>
        <BoardingPassCard bp={bp} checkedIn={checkedIn} />
      </div>
    </div>
  );
}

type ChatMsg = { role: "user" | "assistant"; text: string; citations?: Citation[] };

function AssistantPanel({ pnr, lastName }: { pnr: string; lastName: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"rag" | "keyword" | null>(null);

  async function send(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: query }]);
    setBusy(true);
    try {
      const r = await api<{ answer: string; citations: Citation[]; engine?: "rag" | "keyword" }>(
        "/api/assist",
        {
          query,
          ref: pnr,
          lastName,
          // Last few turns give the model conversational context (multi-turn).
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }
      );
      setEngine(r.engine ?? "keyword");
      setMessages((m) => [...m, { role: "assistant", text: r.answer, citations: r.citations }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Sorry, I could not answer that — please connect to an agent." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    "Should I refund or rebook?",
    "Am I owed a hotel?",
    "Can I get compensation?",
    "What about my baggage?",
  ];

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-bold text-slate-900">Ask about your options</h3>
        </div>

        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  )}
                >
                  <p className="whitespace-pre-line">{m.text}</p>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                      {m.citations.map((c, j) => (
                        <div
                          key={j}
                          className="flex items-start gap-1.5 text-[11px] text-slate-500"
                        >
                          <FileText className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            <b className="text-slate-600">{c.title}</b> · {c.ruleRef}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>

        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <ShieldCheck className="h-3 w-3" /> Grounded in SkyJet policy — every answer
          cites its source.
          {engine === "rag" && (
            <span className="ml-auto rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-600">
              semantic · Gemini + Pinecone
            </span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
