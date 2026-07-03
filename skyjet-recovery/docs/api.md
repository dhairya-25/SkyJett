# API Reference — SkyJet Flight Recovery

> **Deliverable: complete API design & documentation.**
> Every endpoint the system exposes, grouped by the **user** who calls it, with real
> request/response shapes drawn from the live code (`src/app/api/*`), the shared data
> types, the security model, and the end-to-end flows each actor follows.

All endpoints are **JSON over REST**, served by Next.js Route Handlers. Requests are
validated with **Zod**; every error is `{ "error": "<human-readable message>" }` with a
meaningful HTTP status. There is no versioning prefix — the base path is `/api`.

---

## Table of contents

1. [The three users of the system](#1-the-three-users-of-the-system)
2. [Global conventions](#2-global-conventions) — auth · idempotency · locking · rate limiting · errors · headers
3. [Shared data types](#3-shared-data-types) — the objects every response is built from
4. [Passenger API](#4-passenger-api) — lookup · status · seatmap · rebook · refund · escalate · assist
5. [Ops / Admin API](#5-ops--admin-api) — flights · flight · reindex
6. [System / demo API](#6-system--demo-api) — stats · reset
7. [Status codes at a glance](#7-status-codes-at-a-glance)
8. [End-to-end flows by user](#8-end-to-end-flows-by-user)

---

## 1. The three users of the system

| User | Who they are | Authenticated by | Endpoints |
|---|---|---|---|
| **Passenger** | A traveller whose flight was disrupted, self-serving on the mobile web app | **PNR + last name** on every call | `lookup`, `status`, `seatmap`, `rebook`, `refund`, `escalate`, `assist` |
| **Ops / Admin agent** | Airline operations staff pushing live flight changes (delay, boarding, cancellation, goodwill) and (re)indexing policy | **Bearer token** (`ADMIN_TOKEN`) | `admin/flights`, `admin/flight`, `admin/reindex` |
| **System / demo** | Public read of impact metrics; demo reseed control | None | `stats`, `reset` |

A fourth actor — the **live human agent** who receives a warm handoff — is not an API
consumer; they receive the context pack produced by `POST /api/escalate`.

---

## 2. Global conventions

### Authentication

- **Passenger endpoints** — every booking **read *and* write** requires the **PNR *and*
  the passenger's last name**. A PNR alone is never enough: PNRs are short and guessable,
  so the surname is the second factor. `store.findBooking(pnr, lastName)` must match both.
- **Ops/Admin endpoints** — guarded by `Authorization: Bearer <ADMIN_TOKEN>`. In
  development, when `ADMIN_TOKEN` is unset, a well-known dev token `skyjet-ops-2026` is
  accepted so the console works out of the box; **in production an unset token disables the
  admin surface entirely** (`503`). All admin data is simulated, so the dev fallback is safe.
- **System endpoints** (`stats`, `reset`) are unauthenticated.

### Idempotency (writes)

`rebook` and `refund` take a client-generated `idempotencyKey`. Replaying the same key
returns the **stored** response with header `idempotent-replay: true` and causes **no second
side effect**. Keys are scoped server-side to `(action, booking)` — e.g. `rebook:SJ7QK2:<key>`
— so a key can never replay a *different* operation or a different booking.

### Optimistic locking (writes)

Writes accept an optional `expectedVersion` (the `booking.version` from the last read). If it
doesn't match the current version, the write is rejected with `409` — so two tabs or a race
can't silently clobber each other. On every successful write, `version` increments by 1.

### Rate limiting

`POST /api/lookup` is limited to **30 attempts/min per client** (keyed by IP) to blunt PNR
enumeration; beyond that it returns `429`. `POST /api/status` (the poll endpoint) is
deliberately **not** rate-limited or audited, so live-status polling stays cheap.

### Errors

Every error body is `{ "error": "<message>" }`. Messages are human-readable and, crucially,
**non-enumerating**: a wrong PNR and a wrong surname return the *same* `404`, so the API never
confirms whether a given PNR exists.

### Security headers

Responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and referrer /
permissions policies (applied globally). Writes never expose PII beyond what the authenticated
passenger already owns.

---

## 3. Shared data types

These are the building blocks every response is assembled from. Full definitions in
[`src/lib/types.ts`](../src/lib/types.ts), [`src/lib/eligibility.ts`](../src/lib/eligibility.ts),
and [`src/lib/service.ts`](../src/lib/service.ts).

### `BookingView` — the shared response envelope

`buildBookingView()` returns everything the client needs in one round-trip. `lookup`,
`status`, `rebook`, `refund`, and `escalate` all return this shape (the last three add a
field or two):

```ts
{
  booking: Booking;                                   // see below
  flight: Flight;                                     // the disrupted flight
  rebookedFlight?: Flight;                            // present once rebooked
  eligibility: EligibilityResult;                     // the explainable decision
  escalation: { escalate: boolean; reasons: string[] };
  options: RebookOption[];                            // scored alternatives (empty if not disrupted)
  boardingPass?: BoardingPass;                        // present on a REBOOKED booking
  fareSettlement?: { difference: number };            // >0 charged to passenger, <0 refunded
  refund?: { reference: string; amount: number };     // present on REFUND_REQUESTED
  handoff?: { reference, passenger, pnr, tier, context: string[] }; // present on ESCALATED
}
```

### `Booking`

```ts
{
  ref: string;                 // PNR (6 chars) — primary key
  passenger: Passenger;        // { firstName, lastName, email(masked), tier, isSenior?, isChild? }
  flightId: string;            // primary / disrupted flight
  status: "CONFIRMED" | "DISRUPTED" | "REBOOKED" | "REFUND_REQUESTED" | "ESCALATED";
  cabin: "ECONOMY" | "BUSINESS";
  fareClass: string;
  farePaid: number;            // INR
  specialFlags: SpecialFlag[]; // UNACCOMPANIED_MINOR | MEDICAL | PET_IN_CABIN | GROUP | PARTNER_TICKET
  withInfant?: boolean;
  partySize: number;
  rebookedFlightId?: string; seat?: string; refundReference?: string; handoffReference?: string;
  version: number;             // optimistic-concurrency guard
}
```

### `Flight`

```ts
{
  id, flightNo, origin, originCity, destination, destinationCity,
  departure, arrival,          // ISO UTC
  durationMin,
  status: "SCHEDULED" | "CANCELLED" | "DELAYED",
  cause: "WEATHER" | "ATC" | "SECURITY" | "TECHNICAL" | "CREW" | "OPERATIONAL" | "NONE",
  delayMinutes, aircraft, cabin, seatsAvailable, fare, totalSeats?,
  opsStatus: "ON_TIME" | "REPORTING" | "BOARDING" | "DEPARTED",   // boarding progress (ops-controlled)
  opsNote?, opsUpdatedAt?,
  goodwill?: { reference, issuedAt, freeMeal, freeAccommodation, discountPercent, message? }
}
```

> `status`/`cause` drive **eligibility**; `opsStatus`/`opsNote`/`goodwill` are **operational
> progress** an ops agent pushes and are orthogonal to entitlement.

### `EligibilityResult` — the explainable decision

```ts
{
  disruption: "CANCELLED" | "LONG_DELAY" | "NONE";
  causeCategory: "EXTRAORDINARY" | "AIRLINE_CONTROLLED" | "NONE";
  causeLabel: string;                                   // e.g. "Weather"
  refund:       { eligible, amount, reason };
  rebook:       { eligible, reason };
  compensation: { eligible, amount, reason, ruleRef };  // 0 for extraordinary; tiered otherwise
  dutyOfCare:   { meals, hotel, reason };
  headline: string;                                     // one-line summary for the UI
  ruleRef: string;                                      // e.g. "DGCA CAR §3-M-IV — ..."
}
```

The rule (cross-validated by **DGCA India** and **Delta**): the **cause** drives entitlement.
Weather/ATC/security = *extraordinary* → free rebook **or** full refund + duty of care, but
**no cash compensation**. Technical/crew/operational = *airline-controlled* → the above **plus**
tiered compensation (`≤60 min → ₹5,000 · ≤120 → ₹7,500 · else → ₹10,000` by block time).
Thresholds: long delay ≥ 180 min, meals ≥ 120 min, hotel ≥ 360 min.

### `RebookOption` — a scored alternative

```ts
{
  flight: Flight;
  score: number;               // starts at 100; −30 next-day, −5/h later (cap −40), +10 near original time-of-day
  reason: string;              // plain English, e.g. "Same day · 3h later · direct"
  recommended: boolean;        // the single best option the passenger can actually take now
  fareDiff: number;            // candidate fare − fare paid (>0 pay difference, <0 refunded)
  available: boolean;          // false = seats held for higher-priority passengers (waitlisted)
  heldForHigherPriority: number;
  capacityNote: string;
}
```

### `SeatMap` + `Priority` (seat selection)

```ts
SeatMap = {
  flightId, flightNo, aircraft, rows, columns: ["A".."F"],
  businessRows, priorityRows, total, available,
  seats: Seat[]                // each: { id:"12C", row, col, occupied, cabin, aisle, window, priority }
}
Priority = { tier: "SENIOR"|"BUSINESS"|"CHILD_INFANT"|"STANDARD", rank: 1..4, label, reason }
```

Seat-allocation priority during a mass rebooking: **senior (1) → business (2) →
child/infant (3) → standard (4)**. Front `priorityRows` are held for ranks 1–3.

---

## 4. Passenger API

### `POST /api/lookup` — identify & load  ·  *(rate-limited, audited)*

Authenticate and return the full [`BookingView`](#bookingview--the-shared-response-envelope):
booking, flight, eligibility, scored rebooking options, and the escalation assessment — in one
call, so the UI never makes chatty follow-up reads.

```jsonc
// request
{ "pnr": "SJ7QK2", "lastName": "Sharma" }

// 200 (abridged)
{
  "booking": { "ref": "SJ7QK2", "status": "CONFIRMED", "farePaid": 18500, "version": 0, "...": "..." },
  "flight":  { "flightNo": "SJ 301", "status": "CANCELLED", "cause": "WEATHER", "...": "..." },
  "eligibility": {
    "headline": "Rebook free or take a full refund, plus meal/hotel care — cash compensation doesn't apply for weather.",
    "refund":       { "eligible": true,  "amount": 18500, "reason": "..." },
    "rebook":       { "eligible": true,  "reason": "..." },
    "compensation": { "eligible": false, "amount": 0,
                      "reason": "No cash compensation: weather is an \"extraordinary circumstance\" ...",
                      "ruleRef": "DGCA CAR §3-M-IV — no compensation for extraordinary circumstances" },
    "dutyOfCare":   { "meals": true, "hotel": false, "reason": "Meals & refreshments" }
  },
  "options":    [ { "flight": { "...": "..." }, "score": 95, "reason": "Same day · 3h later · direct",
                    "recommended": true, "fareDiff": 0, "available": true } ],
  "escalation": { "escalate": false, "reasons": [] }
}
```

**Errors:** `400` missing/malformed fields · `404` no match (uniform, non-enumerating) · `429` rate-limited.

---

### `POST /api/status` — quiet re-poll  ·  *(not rate-limited, not audited)*

Same auth and same `BookingView` response as `lookup`, but records **no audit entry** and
applies **no rate-limit friction** — the passenger app polls it to pick up live flight changes
pushed from the ops panel (a new delay, a boarding call, a cancellation). Using `lookup` for
polling would pollute the impact metrics and burn the rate limit; `status` exists so it doesn't.

```jsonc
// request
{ "pnr": "SJ7QK2", "lastName": "Sharma" }
// 200 → BookingView (identical shape to lookup)
```

**Errors:** `400` · `404`.

---

### `POST /api/seatmap` — authoritative seat map for an option

Returns the server-owned seat map for a flight the passenger is **considering** rebooking onto,
plus the passenger's seat-allocation priority and the seat that would be auto-assigned. The map
is only served for flights that are actually rebookable right now (recomputed live), so it stays
in lock-step with what `rebook` will validate — the airplane the client renders can never
disagree with the endpoint.

```jsonc
// request
{ "ref": "SJ7QK2", "lastName": "Sharma", "flightId": "SJ303" }

// 200
{
  "seatMap": { "flightId": "SJ303", "flightNo": "SJ 303", "aircraft": "A320neo",
               "rows": 30, "columns": ["A","B","C","D","E","F"],
               "total": 180, "available": 42,
               "seats": [ { "id": "1A", "row": 1, "col": "A", "occupied": false,
                            "cabin": "BUSINESS", "aisle": false, "window": true, "priority": true } ] },
  "priority": { "tier": "SENIOR", "rank": 1, "label": "Senior citizen", "reason": "..." },
  "recommendedSeat": "3C"
}
```

**Errors:** `400` · `404` booking not found · `409` that flight isn't available for rebooking.

---

### `POST /api/rebook` — confirm a new flight  ·  *(idempotent, race-safe, audited)*

Move the booking to a chosen alternative. This is the most guarded endpoint in the system.

```jsonc
// request  (seat + expectedVersion optional)
{ "ref": "SJ7QK2", "lastName": "Sharma", "flightId": "SJ303",
  "seat": "14C", "idempotencyKey": "0d9f6c1e-…", "expectedVersion": 0 }

// 201 (abridged) — 200 + header idempotent-replay:true on a key replay
{ "booking": { "status": "REBOOKED", "version": 1, "seat": "14C", "...": "..." },
  "boardingPass": { "flightNo": "SJ 303", "seat": "14C", "gate": "A7", "boarding": "…", "...": "..." },
  "fareSettlement": { "difference": 0 },
  "stats": { "callsDeflected": 1, "minutesSaved": 25, "...": "..." } }
```

**What it enforces, in order:**
1. **Re-auth** (PNR + last name) → `404` if no match.
2. **Idempotency replay** — repeated key returns the stored `200` with `idempotent-replay: true`.
3. **State machine** — `409` if a refund is already in progress, or the case is escalated.
4. **Optimistic lock** — `409` if `expectedVersion` is stale.
5. **Selection revalidation** — the `flightId` must still be in freshly-computed options → `409` "no longer available". *(This is why a stale tab can't book a now-full flight.)*
6. **Priority capacity** — `409` if seats on that option are held for higher-priority passengers (the passenger is waitlisted).
7. **Seat validation** — an explicit `seat` must be free (`409` "just taken") and permitted for the passenger's priority (`409` reserved-zone); with no `seat`, the best seat their priority entitles them to is auto-allocated. Full flight → `409`.
8. **Success** — releases any previously held seat (re-rebooking is allowed), decrements inventory, sets `status=REBOOKED`, `version++`, audits `REBOOK` with the fare settlement, caches the payload, returns `201`.

---

### `POST /api/refund` — request a refund  ·  *(idempotent, audited)*

Initiate a full refund. **No payment integration** (per brief) — issues a reference number
only. Mutually exclusive with rebooking: DGCA entitles the passenger to one *or* the other.

```jsonc
// request
{ "ref": "SJ7QK2", "lastName": "Sharma", "idempotencyKey": "…", "expectedVersion": 0 }

// 201 (abridged)
{ "booking": { "status": "REFUND_REQUESTED", "version": 1, "...": "..." },
  "refund": { "reference": "RF-8H2KQ1", "amount": 18500 },
  "stats": { "...": "..." } }
```

**Errors:** `400` · `404` · `409` — already rebooked / refund already in progress / escalated /
not eligible (flight operating normally, so `eligibility.refund.eligible` is false).

---

### `POST /api/escalate` — warm agent handoff  ·  *(audited)*

Hand the case to a human agent with a **context pack**, so the passenger never repeats
themselves. Calling it again **joins the existing case** (same reference, no duplicate, no
second audit/version bump).

```jsonc
// request
{ "ref": "SJ2MN1", "lastName": "Gupta" }

// 200 (abridged) — full BookingView + handoff + stats
{ "booking": { "status": "ESCALATED", "...": "..." },
  "handoff": {
    "reference": "AG-3TQ7X2",
    "passenger": "Ishaan Gupta",
    "pnr": "SJ2MN1",
    "tier": "STANDARD",
    "context": [
      "Flight SJ 301 DEL→BKK — CANCELLED (weather)",
      "Unaccompanied minor — needs assisted handling",
      "Passenger used self-service before escalating — context attached."
    ] },
  "stats": { "...": "..." } }
```

**Escalation triggers** (`evaluateEscalation`): any special flag (unaccompanied minor, medical,
pet-in-cabin, group, partner ticket), `partySize > 4`, or **no valid self-service rebooking
within policy**. The passenger can also escalate voluntarily ("talk to a human"), in which case
the context reads *"Passenger requested a human agent."*

**Errors:** `400` · `404`.

---

### `POST /api/assist` — grounded Disruption Assistant (chatbot)

Answer a free-form question, **grounded in SkyJet policy with citations** — never invented.
Optional `ref` + `lastName` (verified) personalise the answer through the *same* eligibility
engine that powers the UI, so the chatbot can't contradict the eligibility panel. `history`
(last few turns) enables follow-ups like *"and what about a hotel?"*.

The route selects one of four engines, in order, and reports which answered in `engine`:

| Order | `engine` | When | How |
|---|---|---|---|
| 0 | `advisor` | Query asks for advice (*"should I refund or rebook?"*) **and** a verified booking is present | Deterministic `recommendAction()` weighs eligibility + scored options → a concrete recommendation (rephrased by the LLM if configured) |
| 1 | `rag` | Gemini + Pinecone configured and the question is on-topic | Embed → Pinecone top clauses → Gemini Flash writes an answer using **only** those clauses + PII-free eligibility facts |
| 2 | `keyword` | Always available fallback | Deterministic tokenise → synonym-expand → score over the curated policy set |

```jsonc
// request
{ "query": "and what about a hotel?", "ref": "SJ7QK2", "lastName": "Sharma",
  "history": [ { "role": "user", "text": "my flight was cancelled" } ] }

// 200
{ "matched": true, "intent": "hotel", "engine": "rag",
  "answer": "Based on your flight SJ 301: …",
  "citations": [ { "title": "Hotel for overnight delays",
                   "ruleRef": "DGCA CAR §3-M-IV — duty of care", "snippet": "…" } ] }
```

**Data minimisation:** the model receives the question, the retrieved clauses, and PII-free
eligibility facts (flight number, verdicts) — **never** a name, PNR, or email. Unmatched
queries return a safe fallback (`matched: false`) that offers the agent; the assistant **never
guesses and never acts** (rebooking/refunds stay behind the authenticated write path).

**Errors:** `400` empty/oversized query (max 300 chars).

---

## 5. Ops / Admin API

Guarded by `Authorization: Bearer <ADMIN_TOKEN>` (dev fallback `skyjet-ops-2026` outside
production). A missing token in production disables the surface (`503`); a wrong token → `401`.

### `GET /api/admin/flights` — ops worklist

```jsonc
// GET  (header: Authorization: Bearer <token>)
// 200
{ "flights": [ { "id": "SJ301", "flightNo": "SJ 301", "status": "CANCELLED",
                 "cause": "WEATHER", "opsStatus": "ON_TIME", "...": "..." } ],
  "opsLog": [ { "id": "…", "at": "…", "flightId": "SJ301", "flightNo": "SJ 301",
                "summary": "Delay 0→120m", "before": "…", "after": "…" } ],
  "now": "2026-07-03T06:00:00.000Z" }
```

**Errors:** `401` invalid token · `503` panel disabled (prod, no token).

---

### `POST /api/admin/flight` — apply an ops change to one flight

Push a live change — delay, cause, boarding progress, cancellation, a passenger-facing note, or
a "sorry for the inconvenience" **goodwill gesture**. Because passenger booking views read the
flight live, **one update reaches every affected PNR** without a per-booking write. At least one
field must be supplied.

```jsonc
// request  (all fields optional; goodwill:null clears an existing gesture)
{ "flightId": "SJ522",
  "status": "DELAYED", "cause": "WEATHER", "delayMinutes": 300,
  "opsStatus": "BOARDING", "note": "Boarding at gate A7",
  "goodwill": { "freeMeal": true, "freeAccommodation": false,
                "discountPercent": 15, "message": "Apologies for the delay." } }

// 200
{ "ok": true,
  "flight": { "id": "SJ522", "status": "DELAYED", "delayMinutes": 300, "opsStatus": "BOARDING",
              "goodwill": { "reference": "GW-…", "issuedAt": "…", "...": "..." }, "...": "..." },
  "opsLog": [ { "summary": "Delay 0→300m; boarding", "...": "..." } ] }
```

Field bounds: `delayMinutes` 0–2880, `discountPercent` 0–100, `note` ≤160 chars, `message`
≤200 chars. **Errors:** `400` invalid/empty patch · `401` · `404` flight not found · `503`.

---

### `POST /api/admin/reindex` — (re)index the policy corpus

Embed every policy clause with Gemini (`RETRIEVAL_DOCUMENT`, 768-dim, normalised) and upsert it
into the Pinecone serverless index by stable clause id (idempotent). Ops story: edit
[`policies.ts`](../src/lib/policies.ts) → hit this endpoint → the assistant answers from the new
policy, no redeploy.

```jsonc
// POST  (header: Authorization: Bearer <ADMIN_TOKEN>)
// 200
{ "ok": true, "indexed": 13, "index": "skyjet-policies" }
```

**Errors:** `401` bad token · `502` indexing failed (upstream) · `503` `ADMIN_TOKEN` unset **or**
RAG not configured (`GEMINI_API_KEY` / `PINECONE_API_KEY` missing).

---

## 6. System / demo API

### `GET /api/stats` — impact metrics

Live figures derived from the audit trail. `callsDeflected = selfServed = rebooks + refunds`;
`minutesSaved = selfServed × 25` (the average contact-centre hold).

```jsonc
// 200
{ "rebooks": 3, "refunds": 1, "escalations": 1,
  "selfServed": 4, "callsDeflected": 4, "minutesSaved": 100 }
```

### `POST /api/reset` — reseed the demo store

```jsonc
// POST → 200
{ "ok": true }
```

Restores the seeded bookings/flights so a fresh walkthrough always works. Demo control only.

---

## 7. Status codes at a glance

| Code | Meaning here |
|---|---|
| `200` | Read OK · idempotent replay · handoff · ops change · assist |
| `201` | Write applied (rebook, refund) |
| `400` | Malformed or missing fields (Zod), or empty admin patch |
| `401` | Admin: invalid bearer token |
| `404` | Booking or flight not found (uniform, non-enumerating message) |
| `409` | Business conflict — state machine · stale `expectedVersion` · stale/held selection · seat taken/reserved · not eligible |
| `429` | `lookup` rate-limited |
| `502` | Admin reindex: upstream (Gemini/Pinecone) failure |
| `503` | Admin surface disabled (`ADMIN_TOKEN` unset in prod) or RAG not configured |

---

## 8. End-to-end flows by user

### Passenger — the golden path

```
proactive alert / QR deep-link
      │
      ▼
POST /api/lookup            → BookingView: status card + eligibility + scored options
      │
      ├─ Rebook branch
      │     POST /api/seatmap (flightId)      → airplane + recommended seat
      │     POST /api/rebook  (flightId, seat, idempotencyKey, expectedVersion)
      │                                        → 201 new boarding pass  (< 30s)
      │
      ├─ Refund branch
      │     POST /api/refund  (idempotencyKey, expectedVersion)
      │                                        → 201 RF-reference + amount
      │
      └─ Special case (minor / "talk to a human")
            POST /api/escalate                → warm handoff pack (AG-reference)
      │
      ▼
(background)  POST /api/status  polled for live flight updates
GET /api/stats                 → "1 call deflected · ~25 min saved"
```

**Demo bookings** (all `password` = last name):

| Scenario | PNR | Last name | Flight / cause | What the API returns |
|---|---|---|---|---|
| Weather cancellation | `SJ7QK2` | `Sharma` | SJ 301, WEATHER | Rebook/refund + meals, **no** compensation (senior → seat priority 1) |
| Technical cancellation | `SJ4RM9` | `Nair` | SJ 415, TECHNICAL | Above **+ ₹10,000** compensation (infant → priority 3) |
| 5-hour weather delay | `SJ8XP5` | `Mehta` | SJ 522, WEATHER | Long-delay handling, meals, no compensation (business → priority 2) |
| Unaccompanied minor | `SJ2MN1` | `Gupta` | SJ 301, WEATHER | `escalation.escalate = true` → **agent handoff**, not automated |
| Priority contention | `SJ7SR1/BZ2/IN3/ST4` | `Reddy/Singh/Iyer/Kapoor` | SJ 711 → SJ 713 (2 seats) | Senior & business get seats; infant & standard are **waitlisted** (`available:false`) |

### Ops / Admin agent

```
GET  /api/admin/flights           → worklist + recent ops-log
POST /api/admin/flight            → push delay / cancel / boarding / note / goodwill
                                     (one write reaches every PNR on that flight, live)
POST /api/admin/reindex           → re-embed policies after editing policies.ts
```

### System / demo

```
GET  /api/stats                   → impact tile figures (public)
POST /api/reset                   → reseed between demo runs
```

---

*Compiled from the live `skyjet-recovery/` codebase (`src/app/api/*`, `src/lib/*`). Keep in
sync if endpoints, the rules engine, or the store change — see [architecture.md](architecture.md)
for the module design and [../README.md](../README.md) for the product overview.*
