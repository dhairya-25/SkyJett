# Flight Disruption & Rebooking — Repo Deep-Dive

An analysis of three GitHub repositories covering airline flight-disruption / rebooking, each taking a very different architectural approach:

| # | Repo | Approach | Language | State |
|---|------|----------|----------|-------|
| 1 | [ben-marrett/flight-rebooking-service](https://github.com/ben-marrett/flight-rebooking-service) | Single REST service, safe-writes focus | Java 21 / Spring Boot | **Runnable & complete** |
| 2 | [irinakomarchenko/airline-disruption-platform](https://github.com/irinakomarchenko/airline-disruption-platform) | Event-driven microservices (Kafka + Saga) | Java 21 / Spring Boot | **Scaffolding — 1 of 4 services built** |
| 3 | [nikhilc523/oneairagent](https://github.com/nikhilc523/oneairagent) | Human-in-the-loop AI agent | TypeScript / Node | **Backend runs on mocks; UI unbuilt** |

> All three are 0-star personal/portfolio projects (no license), pushed in early–mid 2026. They read as interview-prep / demonstration artifacts rather than products — which is exactly why they're useful as reference implementations of *specific patterns*.

---

## 1. ben-marrett/flight-rebooking-service

> *"A production-aware backend service demonstrating safe state transitions, idempotent operations, and optimistic concurrency control for airline disruption recovery."*

### How it works
A single Spring Boot service backed by PostgreSQL. The domain is a **state machine** on a booking:

```
CONFIRMED ──[disruption]──▶ DISRUPTED ──[rebook success]──▶ REBOOKED (terminal)
                                     └──[cancel — future]──▶ CANCELLED (terminal)
```

Three endpoints under `/api/v1/bookings`:
1. `GET /{ref}` — booking details; returns an **ETag** (`@Version`) for concurrency control.
2. `GET /{ref}/rebooking-options` — computes alternative flights **on demand** from live inventory, scores them, returns the top 5.
3. `POST /{ref}/rebook` — confirms a rebooking. Requires an `Idempotency-Key` header; optionally honours `If-Match` for optimistic locking.

The **scoring algorithm** (in `RebookingService`) starts every candidate at 100 and adjusts:

| Factor | Impact |
|--------|--------|
| Different calendar day | −30 |
| Delay vs original | −5 / hour (capped −40) |
| Departure within ±2h of original time-of-day | +10 |

Each option ships with a human-readable reason ("Same day, 6h later than original, direct flight"). Options are **never cached** — recomputed each call so selections can't go stale, and at rebook time the chosen flight must still be in the freshly computed option set (`InvalidFlightSelectionException` otherwise).

**Idempotency** ([ADR-001](https://github.com/ben-marrett/flight-rebooking-service/blob/main/docs/adr/001-idempotency.md)): the client sends a UUID `Idempotency-Key`. On first success the full JSON response is stored in a `rebooking_audit` table (`201 Created`). A replay of the same key on the same booking returns the stored response byte-for-byte (`200 OK`); the same key on a *different* booking is a `400`; a concurrent double-submit is caught via a unique DB constraint and safely retried.

### Functionality
- Retrieve a disrupted booking with a strong ETag.
- Generate scored, explained rebooking options from live flight inventory.
- Rebook safely with idempotent retries and optimistic-concurrency protection.
- Full audit trail of every rebooking (idempotency key, before/after flight, outcome, response payload).
- RFC-7807 `ProblemDetail` error responses; input validation on booking-reference format.
- OpenAPI/Swagger UI, Flyway migrations + seed data, Testcontainers integration tests, CI workflow, `docker-compose` for local Postgres.

### Tech stack
Java 21 · Spring Boot 3.x · PostgreSQL 16 · Flyway · springdoc-openapi · JUnit 5 + Testcontainers · Gradle (Kotlin DSL).

### Drawbacks
- **Deliberately narrow domain.** The README's own "Domain Simplifications" list: no passenger-rights math (EU261 / NZ CGA), no partner/interline/codeshare rebooking, no fare-difference handling, no seat/meal preservation, **one passenger per booking**, and **no flight-capacity tracking** (it can offer a full flight).
- **No async / no events.** Everything is synchronous request/response in one process — no notification pipeline, no reaction to upstream disruption feeds.
- **`CANCELLED` path and non-cancellation disruptions are stubs** ("future"); really only the cancellation→rebook happy path is exercised.
- **No auth/authz** at all (acknowledged) — any caller can read or rebook any reference.
- Idempotency/audit table **grows unbounded** (TTL noted as a production TODO); single-DB assumption, no distributed coordination.

### Unique / standout feature
**The rigor around safe writes.** Client-controlled idempotency keys *plus* ETag/`If-Match` optimistic locking *plus* revalidation of the selected flight against freshly-computed options — a genuinely production-minded treatment of "what happens when the retry/double-click/race actually occurs." The on-demand **scored options with plain-English reasons** are a nice bonus. This is the repo to study for **correctness of the write path**, not for domain breadth.

---

## 2. irinakomarchenko/airline-disruption-platform

> *"Microservice-based airline disruption and passenger rebooking platform built with Java, Spring Boot, Kafka, Docker and REST APIs."*

### How it works (as designed)
An event-driven, **Saga-orchestrated** system of four services, each with its own database, communicating asynchronously over Kafka:

```
flight-service → booking-service → rebooking-service → notification-service
        └───────────────── Kafka topics ─────────────────┘
```

The intended disruption→rebook saga (from `docs/architecture.md`):
1. A flight status flips to `CANCELLED`/`DELAYED`.
2. `flight-service` publishes `FlightStatusChangedEvent`.
3. `booking-service` finds affected bookings → publishes `RebookingRequestedEvent`.
4. `rebooking-service` starts the saga, finds an alternative flight, requests a seat.
5. `flight-service` reserves the seat → emits `SeatReservedEvent` (or `...Failed`).
6. `booking-service` updates the booking; `notification-service` notifies the passenger.

The design docs are the strong part here. `docs/kafka-events.md` specifies **8 topics** with full JSON payload contracts, an `eventId` on every message for consumer-side idempotency, Kafka **message keys chosen to preserve per-entity ordering** (e.g. `flightId`, `bookingId`), a **dead-letter topic**, and the **Transactional Outbox** pattern. `docs/api-contracts.md` specifies REST contracts for all four services.

### Functionality (what's actually implemented)
Only **`flight-service`** exists in code — and it's clean:
- `POST /api/v1/flights` — create a flight (normalises/validates airports, rejects same-origin-destination and bad schedules, dedupes by flight number).
- `GET /api/v1/flights`, `GET /api/v1/flights/{id}`.
- `PATCH /api/v1/flights/{id}/status` — change status (the intended Kafka trigger).
- `GET /api/v1/flights/search?...` — find `SCHEDULED` alternative flights on a route after a given time.

It uses a tidy layered structure: DTO request/response records, a MapStruct `FlightMapper`, JPA repository, `FlightStatus` enum, and a global exception handler.

### Tech stack (declared)
Java 21 · Spring Boot · Spring Web / Data JPA / **Kafka** · PostgreSQL or SQL Server · Docker Compose · OpenAPI · JUnit 5 · Mockito · Testcontainers.

### Drawbacks
- **It's mostly a blueprint, not a working system.** `booking-service`, `rebooking-service`, and `notification-service` are listed as *"Planned"* — **no code exists** for them. You cannot run a disruption→rebook flow end to end.
- **No Kafka wiring is implemented yet.** Even in `flight-service`, `updateFlightStatus()` just changes the status in the DB — it does **not** publish `FlightStatusChangedEvent`. None of the outbox / consumer / DLQ machinery from the docs exists in code.
- **The actual rebooking logic — the whole point — is unbuilt.** There's no seat-reservation, no saga orchestrator, no alternative-flight selection strategy beyond a route search.
- Only a default generated `...ApplicationTests` test; the promised Testcontainers/Mockito coverage isn't there.
- No license; single-author WIP (last push mid-2026) that reads as interview preparation ("Prepare the project for technical interviews" is a stated goal).

### Unique / standout feature
**The architecture documentation itself.** If you want a realistic reference for *how to decompose* airline disruption handling into an event-driven system, the trio of `architecture.md` / `kafka-events.md` / `api-contracts.md` is the value: concrete topic list, versioned event payloads, ordering keys, idempotent consumers, outbox + DLQ. Treat this repo as a **design spec with one reference service implemented cleanly**, not as runnable software.

---

## 3. nikhilc523/oneairagent

> *"OneAir Operations AI Agent — a human-in-the-loop assistant for airline ops staff (rebooking, refunds, policy lookup, booking status, escalation)."*

### How it works
An **internal staff tool**: an AI drafts actions, a human confirms anything that touches money. The design pairs **Dialogflow CX** (deterministic intent detection + slot filling + routing) with an **LLM** (open-ended generation) via a webhook, so structure lives in CX and generation lives in the backend.

Request path (backend `orchestrator.ts`):
1. Dialogflow CX classifies the message into one of six tags and extracts params (e.g. `booking_ref`), then calls `POST /dialogflow/webhook`.
2. The webhook routes by `tag` to one of six orchestrator handlers.
3. The handler **validates params against the real datastore**, fetches data (booking / customer / RAG policies), optionally calls the LLM, and for destructive actions creates a **proposal** instead of acting.

The six handlers:

| Handler | DB lookup | LLM | Creates HITL proposal |
|---------|:--:|:--:|:--:|
| `handleBookingStatus` | ✔ | ✗ | ✗ |
| `handlePolicyQuery` | ✔ (RAG) | ✔ | ✗ |
| `handleRebook` | ✔ | ✔ | **✔** |
| `handleRefund` | ✔ | ✔ | **✔** |
| `handleEscalation` | ✗ | ✗ | **✔** |
| `handleFallback` | ✔ (RAG) | ✔ | ✗ |

**Four signature patterns**, all enforced server-side:
- **Capability gating** (`tools/index.ts`): the LLM may emit only 5 fixed tools — `search_bookings`, `get_policy` (read-only) and `propose_rebook` / `propose_refund` / `propose_escalation` (which *never execute*; `isDestructiveTool()` = name starts with `propose_`).
- **Validation against ground truth** (`validation.ts`): before any proposal is shown, the booking is checked against the DB (exists? cancelled? completed? new date ≥2h before departure?), and refund/fee amounts are computed from policy rules — **the DB overrides the model**. A hallucinated booking never produces a proposal.
- **HITL gate** (`hitl.ts`): `createProposal` → `confirm` (executes: rebook updates `departAt`/`destination`, refund sets `status=cancelled`, escalation opens a ticket) → or `reject` (discards). Nothing mutates until a human confirms.
- **Audit + PII redaction** (`audit.ts`): every step is logged under one `traceId`; sensitive keys (name, email, card, …) are auto-redacted to `[REDACTED]`.

RAG (`rag/retriever.ts`) retrieves the top-3 of 10 seeded policy documents and stuffs them into the prompt with a "answer using ONLY these sources, cite them" instruction.

### Functionality
- Read-only booking status / itinerary lookups (fast, no LLM).
- Grounded policy Q&A with cited sources (RAG).
- Rebooking, refund, and escalation as **reviewed proposals** with computed fees/refund amounts, confirm/reject lifecycle, and a full audit trail.
- Testable directly via `/api/*` endpoints (no CX needed) or via the Dialogflow webhook; ships CX agent config (intents, entities, flows/pages, test cases) and a `render.yaml` deploy manifest.

### Tech stack
Node.js + TypeScript + Express · Dialogflow CX (config included) · **mock** in-memory datastore + **mock** keyword LLM (real OpenAI + PostgreSQL/pgvector + Redis are designed but Phase-5 TODOs) · deploys to Render.

### Drawbacks
- **Everything runs on mocks.** The "LLM" is keyword pattern-matching that does *not* actually read the retrieved policies; the "DB" is in-memory and **resets on every restart**. There's no real OpenAI provider (`llm/openai.ts` is in the spec but **not in the repo**) and no pgvector.
- **The spec oversells the build.** `SPEC.md` promises WebSocket **token streaming**, reconnect/resume, Redis concurrency locks, session summarization, and a **React Native (Expo) mobile app** — none of these exist in the repo. Transport is plain synchronous HTTP webhook; there is no `ws.ts` and no `mobile/` directory.
- **No auth on the execution endpoints.** `POST /api/proposals/:id/confirm` will execute for anyone; `actorId` is effectively hard-coded (`"staff-user"`), so the "human authority" is a UI convention, not an enforced identity.
- **Escalation bypasses validation** (any free-text reason is accepted), and there's no real ownership check tying a booking to the requesting agent.
- Single-turn in practice — the long-conversation windowing/summarization is described but not implemented. No license; portfolio/interview framing is explicit ("How this maps back to the interview story").

### Unique / standout feature
**The safety architecture for AI-in-operations: "authority lives in the human and the database, never in the model."** Even a fully prompt-injected LLM can only *propose* — it cannot execute, because execution is gated behind server-side validation + human confirmation + capability-limited tools, all audited. Of the three repos this is the best **conceptual template for trustworthy LLM automation** of consequential workflows; the code is a clean, well-documented skeleton of that pattern rather than a production system.

---

## Side-by-side summary

| Dimension | #1 rebooking-service | #2 disruption-platform | #3 oneairagent |
|-----------|----------------------|------------------------|----------------|
| **Core idea** | Safe rebooking write-path | Event-driven saga across services | HITL AI agent for ops staff |
| **Runnable today?** | ✅ Yes, end-to-end | ⚠️ Only flight-service | ⚠️ Yes, but all mocked |
| **Async/events** | No | Designed (not wired) | No (spec claims WS; absent) |
| **AI/LLM** | No | No | Yes (mock) |
| **Rebooking logic exists** | ✅ Scored options + rebook | ❌ Planned only | ✅ Proposal + execute (mock) |
| **Best-in-class at** | Idempotency & concurrency | Architecture docs / event contracts | Capability gating + HITL safety |
| **Biggest gap** | Narrow domain, no capacity | 3 of 4 services + Kafka unbuilt | No real LLM/DB/UI; no auth |
| **Maturity** | Complete demo | Blueprint + 1 service | Skeleton + rich docs |

### Which to use for what
- **Building the actual rebooking transaction correctly** → start from **#1**; it's the only one whose write path is complete and race-safe. Extend it with capacity tracking and multi-passenger support.
- **Designing the system as event-driven microservices** → mine **#2**'s docs for the topic/event contracts and saga flow; you'll be implementing most of it yourself.
- **Adding an AI copilot for ops staff without letting the model touch money** → adopt **#3**'s HITL + validation + capability-gating pattern; swap its mocks for a real LLM, real DB, and real auth.

*Analysis generated 2026-07-02 by reading each repo's README/spec, design docs, and core source files.*
