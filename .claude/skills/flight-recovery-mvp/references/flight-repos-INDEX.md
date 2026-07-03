# Flight Disruption / Rebooking / PNR — Master Index

A single entry point to the GitHub research across three files. Nine repos, deep-dived in the same format (**how it works · functionality · drawbacks · unique/standout feature**).

- **Part 1** → [flight-rebooking-repos-analysis.md](flight-rebooking-repos-analysis.md) — the three closest "disruption + rebooking service" fits.
- **Part 2** → [flight-disruption-repos-analysis-part2.md](flight-disruption-repos-analysis-part2.md) — event pub/sub, OR/optimization, scheduling engine, UI mockup, multi-agent AI.
- **#9 pnrsh** → deep-dived below (the highest-star, most notable repo of the set).

---

## Master ranking — all 9 repos

Ranked by how usable/complete each is *as a reference*, not by stars.

| Rank | Repo | ★ | Lang | Theme | Runnable? | Best studied for |
|------|------|---|------|-------|-----------|------------------|
| 1 | [pnrsh](https://github.com/iangcarroll/pnrsh) | 129 | Go | PNR lookup | ✅ (real airline APIs) | Live PNR retrieval, clean adapters |
| 2 | [ben-marrett/flight-rebooking-service](https://github.com/ben-marrett/flight-rebooking-service) | 0 | Java | Rebooking service | ✅ end-to-end | Safe write path (idempotency + locking) |
| 3 | [konczyk/irrops](https://github.com/konczyk/irrops) | 0 | Rust | Scheduling engine | ✅ | Disruption-propagation mechanics |
| 4 | [nikhilc523/oneairagent](https://github.com/nikhilc523/oneairagent) | 0 | TS | HITL AI agent | ⚠️ mocked | AI-in-ops safety architecture |
| 5 | [deekshitaa1/AeroMind-AI](https://github.com/deekshitaa1/AeroMind-AI----Multi-Agent-Airline-Disruption-Management) | 0 | Python | Multi-agent | ✅ (shallow) | Full-stack demo + local LLM comms |
| 6 | [irinakomarchenko/airline-disruption-platform](https://github.com/irinakomarchenko/airline-disruption-platform) | 0 | Java | Event-driven microservices | ⚠️ 1 of 4 services | Kafka/saga architecture docs |
| 7 | [Zhouxing-Su/FlightDisruptionRecovery](https://github.com/Zhouxing-Su/FlightDisruptionRecovery) | 2 | C++ | OR / ROADEF 2009 | ❌ abandoned | Problem formulation + benchmark data |
| 8 | [kumarmanish9/AirlinesEventPublisher](https://github.com/kumarmanish9/AirlinesEventPublisher) (+Processor) | 0 | C# | Event pub/sub | ⚠️ shells only | Compensation-pipeline shape (BRE) |
| 9 | [chandraseskhar-SD/IrregulaFlightOperation](https://github.com/chandraseskhar-SD/IrregulaFlightOperation) | 0 | JS | IRROPS chatbot UI | ⚠️ static | Explainable-agent UX sketch |

**The honest headline:** only **pnrsh**, **ben-marrett**, and **konczyk/irrops** are complete, runnable, well-built software. Everything else is a mock, a scaffold, a doc set, or an abandoned/UI-only sketch — useful as pattern references, not as drop-in code.

---

## 9. iangcarroll/pnrsh  ·  ⭐129 · Go · MIT

> *"View hidden metadata on airline reservations. Fast, lightweight, stores no data, and displays useful data that would otherwise not be visible."* — live at [pnr.sh](https://pnr.sh)

### How it works
A small Go web app that, given a **name + 6-character confirmation code**, calls an airline's **own public mobile-app API** to pull the full reservation and render the normally-hidden fields. It supports **Aeromexico, Delta, United, and Virgin Atlantic** (Air Canada code is present too).

Architecture is a clean **adapter-per-airline** layout under `pkg/<airline>/pnr/`:
- `request.go` — builds and sends the airline API call. Each airline is reverse-engineered: United POSTs to `united.com/api/myTrips/lookup` with a bearer token fetched by a separate `getAuthToken()` (`request_auth.go`), spoofing a Chrome `User-Agent` and the site's `Origin`/`Referer` headers; Delta/Virgin share one Delta backend behind two endpoint constants (`DeltaEndpoint`, `VirginAtlanticEndpoint`).
- `types.go` — the airline's raw JSON response shape.
- `convert.go` — maps that raw response into a **normalized internal `PNR`** via helpers like `convertFlights`, `convertPassengers`, `convertRemarks`, `convertTickets`, `convertSsrs` (Delta adds `coupons.go` + `earnings.go`).

The `cmd/` layer is a stdlib `net/http` server: a home page per airline, and a `…RetrieveHandler` that validates the form (confirmation code must be exactly 6 chars), calls `airline.Retrieve(...)`, and renders an airline-specific `…-show.html` template. There is **no database** — data flows request → airline API → template and is never stored.

### Functionality
Surfaces the "back-office" contents of a PNR that airline websites hide from passengers, typically including:
- **Flight segments** with real operating details and status.
- **Passenger records** and **SSRs** (Special Service Requests — meals, wheelchair, seat prefs, etc.).
- **Remarks** — internal agent/notes on the booking.
- **Tickets / coupons** — ticket numbers and per-coupon status (flown/open/refunded).
- **Earnings** — miles/fare-class accrual (Delta).

Ships a `Dockerfile`, Heroku `Procfile`/`app.json` (one-click deploy), and a basic error-throttle counter (`pnrErrorThreshold`) in the request path.

### Drawbacks
- **Inherently fragile.** It depends on **undocumented, private airline APIs** — auth tokens, headers, and JSON shapes that airlines change without notice. Last pushed **Sep 2023**; adapters may already be stale (this is why it's a per-airline, easily-swapped design).
- **Only 4–5 carriers**, all reverse-engineered individually; adding one is real work (new auth + types + converter + templates).
- **Grey-area by nature** — it accesses reservations using only name + PNR (the same weak "auth" airlines use), so it doubles as a demonstration of how little protects PNR data. Legitimate for *your own* bookings; use it responsibly.
- Minimal validation/error handling (redirects with `?error=t`), no tests, no rate limiting beyond a simple counter.

### Unique / standout feature
**It actually talks to real airlines and shows real hidden data** — the only repo in this whole set that touches production airline systems. Two things make it worth studying regardless of the PNR use case: (1) the **adapter pattern** — each carrier isolated behind identical `Retrieve → request → types → convert` seams feeding one normalized `PNR`, which is exactly how you'd structure any multi-GDS/multi-carrier integration; and (2) it's a compact, real-world lesson in **PNR data security** — how a name + 6-char code is often the only thing standing between the public and a reservation's internal remarks, tickets, and SSRs.

---

## Decision guide — pick by what you're building

| If you need… | Start with | Then borrow from |
|--------------|-----------|------------------|
| **Look up / read a real reservation** | **#1 pnrsh** (adapters, normalized PNR) | — |
| **A correct rebooking write path** (retries, races) | **#2 ben-marrett** (idempotency + ETag locking) | #9 for PNR shape |
| **Disruption mechanics** (delay propagation, MTT, curfews) | **#3 konczyk/irrops** | #7 for cost model |
| **An AI copilot that can't touch money** | **#4 oneairagent** (HITL + validation + capability gating) | #5 for local-LLM comms |
| **A demoable end-to-end lifecycle** | **#5 AeroMind** (UI + DB + agents + Ollama) | replace its stubbed cores |
| **Event-driven microservice design** | **#6 irinakomarchenko** (Kafka/saga/outbox docs) | #8 for compensation split |
| **The optimization/OR formulation** | **#7 ROADEF** (cost + EU comp + benchmarks) | bring your own solver |

### If you were assembling one real system
A pragmatic composition from the strongest pieces:
1. **Ingest / read** reservations with **pnrsh's adapter pattern** (#1) → normalized PNR.
2. **Detect + route** disruptions via an **event backbone** modeled on #6's Kafka/saga contracts (compensation split as in #8).
3. **Recover the schedule** with **konczyk/irrops'** incremental-repair mechanics (#3), upgrading to #7's cost objective when you need optimality.
4. **Rebook safely** through **ben-marrett's** idempotent, optimistically-locked write path (#2).
5. **Assist the ops staff** with **oneairagent's** HITL-gated AI (#4), using #5's local-LLM step for passenger comms.

No single repo is that system — but together they map every layer of it.

*Index compiled 2026-07-02. Repo states/stars as observed on that date; the AI-agent and microservice repos are actively changing, so re-check before relying on any "not implemented" note.*
