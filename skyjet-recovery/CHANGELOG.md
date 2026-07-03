# Changelog

All notable changes to the SkyJet Recovery app are recorded here so anyone can
get the context of what changed and why. Newest entries first.

Format: each entry has a date, a short summary, the files touched, and the
reason/behaviour so a reader doesn't need the original conversation.

## 2026-07-03

### Docs: added a real-world deployment blueprint (production design) — .md + .docx
- **What:** New [`docs/production-deployment.md`](docs/production-deployment.md) and a styled Word
  version [`docs/SkyJet-Production-Deployment.docx`](docs/SkyJet-Production-Deployment.docx) — an
  end-to-end plan for taking the MVP to production. Written as **Today (MVP) → Production adds** and
  answers, concretely, for **rebooking / refund / waiting(waitlist)**: how the system finds options
  (nearby-airport **geospatial search** + related-flight indexed query + **connection graph**), which
  **data structures** (B-tree route index, Redis GEO / R-tree / k-d tree, time-expanded flight graph,
  top-K heap, priority-queue waitlist, refund state machine), what **logic** runs, how the **database
  changes even after a flight is booked** (idempotent, optimistically-locked, atomic seat-decrement
  write path + the exact tables touched), and the full list of **databases & external systems**
  (Postgres/Redis/PostGIS/Pinecone/Kafka/S3/warehouse + PSS/GDS, DCS, OAG/Cirium, weather, payment,
  notifications, IdP). Includes a gap table, NFR/security/compliance, a phased roadmap, a 3-flow
  summary table, and a "current code → production component" appendix.
- **Why:** The user asked for a document covering what we'd need to add if the system were deployed
  in the real world (rebooking nearby/related-flight discovery + data structures + logic; refund and
  waitlist without payment integration; DB changes and which databases are needed).
- **How:** Content grounded in the live sources (`store.ts`, `service.ts`, `eligibility.ts`,
  `priority.ts`, `rebooking-priority.ts`, `rag/*`, `schema.prisma`). The .docx was generated with
  `docx-js` (generator kept in the session scratchpad, not committed) so it can be regenerated;
  verified well-formed (unpack + XML parse) and renders to 11 pages.
- **Files:** `docs/production-deployment.md`, `docs/SkyJet-Production-Deployment.docx` (docs only; no
  behaviour change).

### Docs: generated a detailed Word (.docx) API reference for submission
- **What:** New [`docs/SkyJet-API-Reference.docx`](docs/SkyJet-API-Reference.docx) — a
  styled, submission-ready Word document covering **all 12 endpoints** across the three
  users. Each endpoint entry gives its purpose, authentication, when it's used, request
  fields, example request & response, behaviour/guarantees, and every error. Also includes
  a cover page, endpoint index, global conventions, shared data types, the 8-step rebook
  enforcement table, the assist engine-selection table, a status-code table, and
  end-to-end flow diagrams + the demo-credentials table.
- **Why:** The user needs a Word document of all APIs, in detail, for their challenge submission.
- **How:** Built with `python-docx` via a generator script (kept in the session scratchpad,
  not committed) so the doc can be regenerated; content mirrors `docs/api.md` and the live
  `src/app/api/*` + `src/lib/*` sources.
- **Files:** `docs/SkyJet-API-Reference.docx` only (documentation; no behaviour change).

### Docs: added a test credentials / sample data guide for reviewers
- **What:** New [`docs/testing.md`](docs/testing.md) — a shareable guide so anyone
  can test the app end-to-end. Covers local run steps, the demo reset, a table of
  all 8 seeded **PNR + last name** login credentials mapped to their scenario and
  expected outcome, what each of the 4 scenarios exercises, the dev/admin bearer
  token (`skyjet-ops-2026`), and copy-paste `curl` examples per endpoint.
- **Why:** The user wanted a single document to hand testers with demo credentials
  and sample/seed data so they can exercise the project themselves.
- **Source of truth:** written directly from `src/lib/seed.ts` (passengers, bookings,
  flights), `src/lib/admin-auth.ts` (dev token), `.env.example`, and `package.json`.
- **Files:** `docs/testing.md` only (documentation; no behaviour change).

### Docs: rewrote the API reference to cover the whole system + all users
- **What:** Expanded [`docs/api.md`](docs/api.md) from a 7-endpoint sketch into a
  complete reference organised by the **three users** of the system (passenger,
  ops/admin agent, system/demo). Now documents every route that actually exists —
  the previously-undocumented `POST /api/status` (quiet poll), `POST /api/seatmap`,
  `GET /api/admin/flights`, and `POST /api/admin/flight` — plus the two auth models,
  idempotency/locking/rate-limit conventions, the shared data types (`BookingView`,
  `Booking`, `Flight`, `EligibilityResult`, `RebookOption`, `SeatMap`, `Priority`),
  the full rebook enforcement order (8 steps), the four-tier assist engine selection,
  a status-code table, and end-to-end flow diagrams per user.
- **Why:** The request was a detailed API doc covering the whole system and all users;
  the old doc missed 4 of 12 endpoints and both the ops/admin and seat-selection surfaces.
- **Source of truth:** written directly from `src/app/api/*` and `src/lib/*` (types,
  service, eligibility, seatmap, priority, admin-auth, seed) so shapes match the code.
- **Files:** `docs/api.md` only (documentation; no behaviour change). Also added a
  workspace-root `../README.md` orienting the app + docs + research.

### Chatbot advice: "Should I refund or rebook?"
- **What:** The existing "Ask about your options" chatbot can now **recommend**
  between refunding and rebooking, tailored to the passenger's own situation —
  not just explain policy. Ask "should I refund or rebook?", "what do you
  suggest?", "I'm confused about my options", etc. and it gives a concrete
  suggestion with reasons.
- **How:** New deterministic advisor `recommendAction()` weighs the SAME facts
  the UI already computes — the eligibility engine + the scored rebooking options
  (same-day vs next-day, hours later, fare difference, seat availability). It
  never invents amounts or policy. Example (SJ8XP5): *"I'd lean toward rebooking:
  SJ 524 gets you to Dubai the same day, about 3h later … a full ₹61,000 refund
  is available if you no longer need to travel."*
- **Logic:** same-day + soon (≤8h) alternative → lean **rebook**; only next-day /
  long wait → **either** (passenger's call); no seat actually available →
  **refund**; booking that must escalate (e.g. unaccompanied minor) → **agent**
  (no self-service advice); on-time flight → nothing to do.
- **Engine (per request — deterministic core + optional LLM polish):** the
  deterministic recommendation is served verbatim when no LLM is configured. When
  `GEMINI_API_KEY` + `PINECONE_API_KEY` are set, the recommendation is passed to
  the Gemini prompt to rephrase naturally, still grounded in the recommendation +
  policy clauses. Answers stay cited.
- **Files:** new `src/lib/advisor.ts` (`recommendAction`, `wantsAdvice`) +
  `src/lib/advisor.test.ts` (+8 tests, suite 105 → 113); `src/lib/rag/rag.ts`
  (advice-mode prompt + `recommendation` option); `src/app/api/assist/route.ts`
  (advice routing before the semantic/keyword paths); `src/components/recovery-app.tsx`
  ("Should I refund or rebook?" suggestion chip). Verified end-to-end over HTTP
  for delayed, cancelled, escalation, and factual (non-advice) queries, and in
  the browser via the chip.

### "Sorry for the inconvenience" — ops goodwill gesture
- **What:** Ops can now extend a discretionary **goodwill gesture** to a
  disrupted flight from the admin console: a **free meal**, **free
  accommodation**, a one-tap **10% off**, and/or a **custom % discount** on the
  passenger's next ticket, with an optional personal apology note. Every
  passenger on that flight then sees a warm **"With our apologies"** card listing
  the perks and a trackable reference (e.g. `GW-T2O4WE`).
- **Why it's separate from eligibility:** This is **discretionary service
  recovery**, deliberately distinct from the **statutory** DGCA duty-of-care /
  compensation the eligibility engine derives automatically. The passenger card
  is explicitly framed as *"a goodwill gesture — in addition to your
  entitlements,"* so the two never look redundant. Keeps the explainability
  theme: statutory vs. goodwill are visibly different things.
- **Model / behaviour:**
  - Applied **per-flight** (same model as an ops note): one write reaches every
    passenger on the flight, and it appears on the passenger side within the
    existing ~10s live poll — no passenger action needed.
  - The gesture is stamped server-side with a **stable reference** (kept across
    edits) and an `issuedAt`. An **all-empty** gesture (no meal, no hotel, 0%) or
    an explicit `null` **clears** it — never a phantom. The ops feed records the
    change (`… · goodwill: meal, hotel, 10% off`).
  - Discount is validated **0–100%** (out-of-range → `400`). Flows through the
    existing token-guarded `POST /api/admin/flight` and `buildBookingView`, so no
    new endpoint was needed.
  - Passenger card shows on the **disrupted**, **rebooked**, and **refund**
    screens (it persists after the passenger acts).
- **Files:** `src/lib/types.ts` (`GoodwillInput`/`GoodwillGesture`,
  `Flight.goodwill`, `FlightOpsPatch.goodwill`), `src/lib/store.ts` (`applyOps`
  handles/stamps/clears goodwill; ops-feed summary includes it),
  `src/app/api/admin/flight/route.ts` (Zod schema + refine),
  `src/components/admin-console.tsx` (goodwill editor block + `GoodwillToggle` in
  each flight row), `src/components/recovery-app.tsx` (`GoodwillCard` +
  render on the disrupted/rebooked/refund screens),
  `src/app/api/admin/admin.test.ts` (+4 tests), `prisma/schema.prisma`
  (goodwill columns for parity). Tests: 101 → 105. Verified end-to-end over HTTP
  (admin send → passenger lookup carries the gesture; edit keeps the ref;
  discount>100 → 400; null clears).

## 2026-07-02

### Priority scheduling for scarce rebooking seats
- **What:** Alternative flights during a disruption aren't empty — they have only
  a few spare seats, so not everyone fits. Those seats are now **rationed by
  priority**: they're held for higher-priority passengers (**senior citizens
  first**, then business, then infant/child), and a lower-priority passenger is
  **waitlisted** for a flight until enough seats remain for everyone who outranks
  them — then steered to a flight with more room.
- **Rule:** a passenger may take a seat on an alternative **iff `seatsAvailable >
  (higher-priority passengers on the same route still needing a seat)`**.
  Deterministic; holds seats for higher tiers without bumping anyone already
  seated. Equal-rank peers don't hold seats against each other.
- **Where:**
  - New `src/lib/rebooking-priority.ts` (`competingBookings`,
    `higherPriorityWaiting`, `capacityFor`) — pure/testable.
  - `src/lib/service.ts` — every `RebookOption` now carries `available`,
    `heldForHigherPriority`, `capacityNote`; the **recommended** option is the
    best one the passenger can actually take (never a held flight).
  - `src/app/api/rebook/route.ts` — a held-seat rebooking is rejected with a
    clear "waitlist" **409** (verified end-to-end).
  - `src/components/recovery-app.tsx` — waitlisted options render a `WaitlistNote`
    ("Seats held for N higher-priority passengers…") in place of the seat button.
- **Demo data:** self-contained **Scenario 4** — cancelled `SJ711` (DEL→DXB) with
  four passengers (senior / business / infant / standard) competing for **2 seats**
  on `SJ713`; roomy next-day `SJ715` is the fallback. New demo buttons: `SJ7SR1 /
  Reddy` (senior — gets a seat) and `SJ7ST4 / Kapoor` (standard — waitlisted).
- **Files:** new `src/lib/rebooking-priority.ts` (+ `rebooking-priority.test.ts`),
  new `src/app/api/rebook/rebook-priority.test.ts`; changed `src/lib/service.ts`,
  `src/app/api/rebook/route.ts`, `src/lib/seed.ts` (Scenario 4 + 4 passengers),
  `src/components/recovery-app.tsx`. Adds 13 tests; suite at 101.
- **Builds on** the existing `computePriority` tiers and seat-map priority zone —
  this adds the *capacity/accommodation* dimension (who gets a scarce seat),
  distinct from *which physical seat* they pick.

### Settle the fare difference when rebooking
- **What:** When a passenger rebooks to a different flight, the **fare
  difference** between the new flight and what they originally paid is now shown
  and settled: a **pricier** flight charges the difference, a **cheaper** flight
  refunds it, an equal fare shows "No fare difference".
- **Where it shows:**
  - Each alternative-flight card and the recommended card show a **fare-difference
    tag** (amber "Pay ₹X more" ↑ / emerald "₹Y refund" ↓ / grey "No fare
    difference").
  - The seat-selection step shows the difference next to the chosen seat and the
    confirm button reads e.g. **"Pay ₹1,400 & confirm seat 12A"** or
    **"Confirm seat 12A · ₹1,700 refund"**.
  - The rebooked screen shows a settlement note ("₹1,400 charged to your original
    payment method" / "₹1,700 will be refunded…").
- **Behaviour:** The difference is always **new flight fare − original fare paid**
  (`booking.farePaid` is never mutated), so re-rebooking recomputes correctly and
  is never cumulative. Surfaced via a new `BookingView.fareSettlement` and
  `RebookOption.fareDiff`; recorded in the audit trail. No payment integration
  (per brief) — the charge/refund is simulated with a reference message.
- **Note:** This intentionally overrides the earlier "airline-caused disruption ⇒
  no fare difference" assumption (updated in the README), per request.
- **Files:** `src/lib/types.ts` (`Flight.fare`), `src/lib/seed.ts` (per-flight
  fares chosen to show both a top-up and a refund), `src/lib/service.ts`
  (`fareDifference` helper, `RebookOption.fareDiff`, `BookingView.fareSettlement`),
  `src/app/api/rebook/route.ts` (audit detail), `src/components/recovery-app.tsx`
  (`FareTag` + fare rows in the flight cards, seat-confirm, and rebooked screen).
  Tests +1 (fare settlement).

### Flight progress timeline on every dashboard
- **What:** Added a shared **flight-progress timeline** (a horizontal stepper)
  that shows where a flight is in its journey: `Scheduled → [Delayed] →
  Check-in open → Boarding → Departed → Arrive <dest>`, or the short
  `Scheduled → Cancelled` for a cancelled flight. Past steps are filled with a
  check, the current step pulses, upcoming steps are muted. A delay renders
  amber (with the `+delay · new ETD` detail), a cancellation renders red.
- **Where:** Shown on **both** dashboards from the same component:
  - Passenger app — inside the flight status card ("Flight progress"), so a
    passenger sees the live stage of their flight. It updates with the existing
    10s live poll, so an ops push (delay set, boarding call, cancellation)
    advances the timeline without a refresh.
  - Ops console — inside each flight row, so operators see the same stage view
    the passenger sees.
- **Behaviour / design:** The timeline is **derived purely** from the existing
  `Flight` fields (`status`, `delayMinutes`, `cause`, `opsStatus`, times) —
  it folds the disruption axis (`FlightStatus`) and the boarding-progress axis
  (`OpsStatus`) into one ordered journey with exactly one "current" step. No API
  or store changes were needed (both dashboards already carry the full `Flight`).
  Estimated arrival shifts with the delay so the endpoint stays honest.
- **Files:** new `src/lib/timeline.ts` (`buildFlightTimeline` /
  `currentTimelineStep`, pure) + `src/lib/timeline.test.ts` (5 tests), new
  `src/components/flight-timeline.tsx` (`FlightTimeline` stepper, `compact`
  option), `src/components/recovery-app.tsx` (timeline in `StatusHeader`),
  `src/components/admin-console.tsx` (timeline in `FlightRow`).

### Remove the "calls deflected / minutes saved" impact tile
- **What:** Removed the `ImpactTile` (and its `Stat` helper) from the rebooked
  and refund success screens — the little "1 Call deflected · ~25 Minutes saved ·
  <30s To resolve" box no longer renders. Requested.
- **Files:** `src/components/recovery-app.tsx` — deleted `ImpactTile`/`Stat`, the
  two render sites, and the now-unused `stats` prop on `RebookedScreen` (the API
  still returns `stats`; it's just no longer shown).

### Pick your seat on an airplane seat map when rebooking
- **What:** Rebooking is now a two-step flow. Choosing "Rebook the flight" shows
  the alternative flights on the same route (as before); tapping **Choose your
  seat / Select seat** on one opens a full **aircraft seat map** for that flight.
  Occupied seats render as taken (muted, non-clickable), free seats are white and
  selectable, the picked seat turns sky-blue with a check. The passenger confirms
  a seat, and that exact seat lands on the boarding pass.
- **Behaviour / correctness:**
  - The seat map is **deterministic per flight** (stable across renders) and
    **server-authoritative** — a new `POST /api/seatmap` returns the live map, and
    the rebook endpoint re-validates the chosen seat against it, so two passengers
    can never take the same seat (second one gets `409 "That seat was just
    taken."`). Verified end-to-end over HTTP.
  - The number of **free seats always equals the flight's `seatsAvailable`**: the
    "already taken by others" base fill is sized from `seatsAvailable + seats
    booked this session`, an invariant, so the pattern never jitters as seats fill
    — only the specifically-booked seats flip to occupied.
  - `seat` is **optional** on `/api/rebook` — omitting it auto-assigns the first
    free seat (preserves the old one-tap behaviour and all existing contracts).
  - A320neo layout: 30 rows × 6 (A–C · aisle · D–F), first 2 rows a business
    cabin; window/aisle/middle is shown for the picked seat.
- **Files:** new `src/lib/seatmap.ts` (deterministic map + helpers, `seatmap.test.ts`),
  new `src/app/api/seatmap/route.ts` (authenticated map fetch, `seatmap.test.ts`),
  `src/app/api/rebook/route.ts` (accept + validate `seat`, record it on the
  boarding pass), `src/lib/store.ts` (`bookedSeats` set + book/release/seatsTaken),
  `src/lib/service.ts` (boarding pass uses the chosen seat), `src/lib/types.ts`
  (`Booking.seat`, `Flight.totalSeats`), `src/components/recovery-app.tsx`
  (`RebookSection` two-step flow + `SeatSelect`/`SeatMapView`/`SeatButton`/
  `SeatLegend`; `HeldRebooking`/`OptionCard` now open the seat picker). Tests:
  59 → 70.

### Put "What would you like to do?" above "What you are entitled to"
- **What:** Moved the three-option decision block (`ProceedOptions` + its
  expanded rebook/refund/wait panels + the escalation callout) into the left
  column, directly above the entitlements card (`EligibilityPanel`), so the
  passenger sees the options to act before the eligibility details. Applies to
  both mobile and desktop reading order. Assistant + "Start over" moved to the
  right column.
- **Files:** `src/components/recovery-app.tsx` (post-login CONFIRMED/DISRUPTED
  layout).

### Three main options after the flight details
- **What:** Below the flight-details card, a passenger with a disrupted booking
  now picks from three clear primary options:
  1. **Rebook the flight** — expands the held-seat + alternative-flight list.
  2. **Refund & cancel the flight** — expands a confirm panel (amount + "cannot
     be undone") before committing the refund.
  3. **Wait for the existing flight** — keeps the current seat; shows the new
     estimated departure and any meal/hotel care. Client-side only (no booking
     change — the booking already *is* that flight).
- **Behaviour:** Options act as a single-select accordion (clicking the active
  one collapses it). "Refund & cancel" and "Rebook" only appear when eligible;
  "Wait for the existing flight" only appears for a **delayed** flight (not a
  cancelled one). "Talk to an agent" is kept as a small secondary link. Bookings
  that must be handled by an agent (e.g. unaccompanied minor) still show the
  escalation callout instead of the options.
- **Files:** `src/components/recovery-app.tsx` — new `ProceedOptions`,
  `OptionChoice`, `RefundConfirm`, `WaitPanel` components and a `choice` state;
  removed the old `SecondaryActions` (refund is now a main option).

### Show estimated flight delay first, right after login
- **What:** After a passenger looks up their booking (logs in), the very first
  thing they now see is a prominent **estimated-delay banner** at the top of the
  screen, above the flight status card. For a delayed flight it shows the delay
  duration and the new estimated departure time; for a cancelled flight it shows
  the cancellation prominently.
- **Why:** Requested so the passenger's most urgent question — "how late is my
  flight?" — is answered immediately on entry instead of being a thin title bar.
- **Files:** `src/components/recovery-app.tsx` (new `FlightDelayBanner`
  component, rendered as the first element of the post-login
  CONFIRMED/DISRUPTED view).

### Ops/admin panel — control live flight status
- **What:** New airline **ops console** at `/admin` that pushes live flight
  updates to passengers: set an **estimated delay** (+ cause), advance
  **boarding progress** (On time → Reporting → Boarding → Departed),
  **cancel / restore** a flight, and send an optional passenger-facing note.
  Each change reaches every passenger on that flight within ~10s — no passenger
  action needed.
- **How it reaches passengers:** the passenger app polls a quiet read endpoint
  (`POST /api/status`) every 10s while the passenger is still deciding, so a
  delay/boarding/cancellation appears without a refresh. The delay drives the
  **eligibility engine live** (e.g. crossing the 6h threshold flips on the hotel
  entitlement), and `opsStatus` feeds the flight-progress timeline on both
  dashboards.
- **Model / behaviour:** `Flight.opsStatus` (`ON_TIME|REPORTING|BOARDING|
  DEPARTED`) is a **new axis, orthogonal to `FlightStatus`**, so boarding
  progress never regresses the eligibility/rebooking logic. A `DEPARTED` flight
  is excluded from rebooking options. Changes are recorded on a **separate ops
  feed** (`store.opsLog`), kept out of the passenger impact stats.
- **Auth:** separate from passenger auth — the panel and its write endpoints are
  guarded by a bearer `ADMIN_TOKEN` (dev fallback `skyjet-ops-2026`; **disabled
  in production** until the env var is set). Passengers still use PNR + last name.
- **Files:** new `src/lib/admin-auth.ts`, `src/app/admin/page.tsx`,
  `src/components/admin-console.tsx`, `src/components/flight-ops-strip.tsx`
  (passenger live strip + `useLiveView` poll hook), `src/app/api/admin/flight/route.ts`
  (write), `src/app/api/admin/flights/route.ts` (worklist), `src/app/api/status/route.ts`
  (passenger poll), `src/app/api/admin/admin.test.ts` (8 tests). Changed:
  `src/lib/types.ts` (`OpsStatus`, `FlightOpsPatch`, `OpsLogEntry`, flight ops
  fields), `src/lib/seed.ts`, `src/lib/store.ts` (`listFlights` / `applyOps` /
  `opsLog`, departed excluded from options), `prisma/schema.prisma`,
  `src/components/recovery-app.tsx` (live poll + ops strip), `.env.example`.

### Start tracking changes
- **What:** Added this `CHANGELOG.md`.
- **Why:** Requested — keep a running record of every change so anyone can pick
  up the context of what was modified.
