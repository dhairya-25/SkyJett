# Flight Disruption & IRROPS — Repo Deep-Dive (Part 2)

Companion to [flight-rebooking-repos-analysis.md](flight-rebooking-repos-analysis.md). Five more repos, spanning event pub/sub, optimization research, a scheduling engine, a UI mockup, and a multi-agent AI system.

| # | Repo | Angle | Language | State |
|---|------|-------|----------|-------|
| 4 | [kumarmanish9/AirlinesEventPublisher](https://github.com/kumarmanish9/AirlinesEventPublisher) + [AirlinesMessageProcessor](https://github.com/kumarmanish9/AirlinesMessageProcessor) | Event pub/sub for IRROP → compensation | C# / .NET | **Thin shells; logic hidden in a DLL** |
| 5 | [Zhouxing-Su/FlightDisruptionRecovery](https://github.com/Zhouxing-Su/FlightDisruptionRecovery) | ROADEF-2009 optimization (research) | C++ | **Abandoned — author says "dummy code only"** |
| 6 | [konczyk/irrops](https://github.com/konczyk/irrops) | Deterministic aircraft scheduling engine | Rust | **Runnable, genuinely engineered** |
| 7 | [chandraseskhar-SD/IrregulaFlightOperation](https://github.com/chandraseskhar-SD/IrregulaFlightOperation) | IRROPS chatbot UI concept | JS (React/MUI) | **Static mockup only** |
| 8 | [deekshitaa1/AeroMind-AI](https://github.com/deekshitaa1/AeroMind-AI----Multi-Agent-Airline-Disruption-Management) | Multi-agent disruption + compensation | Python | **Full-stack demo; shallow logic, empty RAG** |

> As with Part 1, all are 0–2★ personal projects with no license. Value is as pattern references, not products.

---

## 4. kumarmanish9/AirlinesEventPublisher + AirlinesMessageProcessor

> *Publisher:* "…event publisher for any types of IRROP events (Cancel, Delay, Rebook etc)."
> *Processor:* "…process and validate with **BRE** [Business Rules Engine] to assign the eligible compensations."

### How it works
A classic **producer/consumer pair** built as .NET `BackgroundService` worker apps that share a common `AirlineCoreLibrary`:

- **Publisher** — a hosted `Worker` loop that every **10 seconds** calls `publisher.PublishFlightEventAsync()` to emit a simulated IRROP event (cancel/delay/rebook).
- **Processor** — a hosted `Worker` loop that every **5 seconds** calls `processor.ProcessFlightEventAsync()`, which consumes an event, runs it through a **Business Rules Engine (BRE)**, and assigns the eligible passenger compensation.

Both use constructor-injected services (`IEventPublisher`, `IEventProcessor`) registered via `RegisterAppServices()`, following idiomatic .NET dependency-injection and hosted-service patterns. Together they model the decoupled **compensation pipeline**: disruption events in one service, rules-based compensation adjudication in another.

### Functionality
- Emit IRROP events on a timer (Cancel / Delay / Rebook).
- Consume events and evaluate compensation eligibility via a rules engine.
- Structured logging (`AppLogger.LogInfo`), separate dev/prod `appsettings`.

### Drawbacks
- **The interesting logic is not source-available.** Everything that matters — `IEventPublisher`, `IEventProcessor`, the BRE, the message-bus/transport, and the event schema — lives inside a **committed binary `AirlineCoreLibrary.dll`**, not in the repo. You can read the two 15-line worker loops and nothing else.
- **No real messaging is visible.** There's no queue/topic config in `appsettings.json` (no RabbitMQ/Kafka/Service Bus connection strings), so how the two processes actually communicate is opaque — it may just be the DLL simulating events in-process.
- **Simulation only** — publisher "simulates a flight event"; the processor uses `Thread.Sleep(5000)` (blocking) rather than event-driven consumption.
- One-line READMEs; no build/run instructions, no tests, no license (Dec 2024).

### Unique / standout feature
The **conceptual separation of concerns**: modelling IRROP compensation as an **event-sourced pipeline** where a rules engine (BRE) — not hardcoded `if`s — decides eligibility, split cleanly across a publisher and a processor. It's the right enterprise shape for compensation handling. Unfortunately it's more of an *architecture sketch in two `Program.cs` files* than a studyable implementation, because the substance is compiled away into the DLL.

---

## 5. Zhouxing-Su/FlightDisruptionRecovery

> README (verbatim): *"这个仓库已经被废弃! This repo has been abandoned! 这里没有有用的代码! There is dummy code only!"*

### How it works (as designed)
An academic C++ attempt at the **ROADEF 2009 Challenge** — the *integrated* airline disruption recovery problem (simultaneously recover aircraft routings, flight schedules, and passenger itineraries under a cost objective). Despite the "abandoned" warning, the header (`FlightDisruptionRecovery.h`) contains a surprisingly complete **domain model and solver skeleton**:

- **Rich domain types:** `Aircraft` (model + id), `Maint` (maintenance windows), `Flight`, `Rotation`, `Itinerary` (with per-flight cabin arrangements), `Config` (first/business/economy cabin layout), plus disruption inputs `AltFlight` / `AltAircraft` / `AltAirport`.
- **A real cost objective:** `Settings` carries `DelayCost`, `CancellationCost`, `DowngradeCost`, family/model/config-violation penalties, and objective factors `a`, `b`, `r`.
- **EU261-style legal compensation** baked in: `getCancellationLegalCompensation()` (€250/€400/€600 by planned duration) and `getDelayLegalCompensation()` (tiered by delay minutes).
- **A metaheuristic solver scaffold:** `solve()`, `genInitSolution()`, and tabu/local-search knobs (`MAX_ITER_COUNT`, `TABU_TENURE_BASE`, `PERTURB_STRENGTH`, `MAX_NO_IMPROVE_COUNT`), plus `check()` and CSV result reporting.

Ships **all official ROADEF 2009 benchmark instances** (A01–A24+, ~371 CSV files: aircraft, airports, flights, itineraries, rotations, distances, positions, and their `alt_*` disruption variants).

### Functionality
Realistically: **parses the ROADEF instance format and defines the problem**. The solver body is incomplete/stubbed (the author's own warning), so it does not produce validated recovery solutions.

### Drawbacks
- **Abandoned and non-functional** by explicit admission — "dummy code only." Do not expect to run it.
- **Dates/times are `std::string`** — the header's own `Problems:` note flags this as a design flaw (no real temporal arithmetic).
- Windows/Visual Studio project (`.sln`/`.vcxproj`), depends on a sibling `CPPutilibs` submodule; no build docs, MIT-less, last touched 2017.

### Unique / standout feature
**Fidelity to the real, hard research problem.** Of all eight repos across both parts, this is the only one that models *integrated* recovery — aircraft rerouting **and** flight delay/cancellation **and** passenger itinerary reassignment **and** cabin downgrade — under a single **cost objective with legal compensation**, against the **canonical ROADEF 2009 benchmark data**. It's the right reference for *what a serious optimization formulation looks like*, even though the optimizer itself was never finished.

---

## 6. konczyk/irrops

> *"A deterministic, incremental aircraft scheduling engine."*

### How it works
A well-built Rust engine (plus a REPL-style TUI) that assigns aircraft to flights and then **repairs the plan incrementally** as disruptions are injected. The `Schedule` holds aircraft, airports, and time-sorted flights, and exposes three core operations:

1. **`assign()`** — greedy, **deterministic** aircraft-to-flight assignment. For each unscheduled flight it picks the first eligible aircraft *at the origin airport* (candidates sorted by name for reproducibility), enforcing: **airport continuity** (an aircraft's previous destination must equal the next origin), **minimum turn time (MTT)**, aircraft-maintenance/availability windows, airport curfews, and no double-booking (busy-interval overlap checks).
2. **`apply_delay(flight, minutes)`** — shifts a flight and **propagates the delay down the aircraft's rotation chain**, cascading knock-on effects. Flights that can no longer be operated are unscheduled with a typed reason: `MaxDelayExceeded` (cap = 2000 min), `AircraftMaintenance`, `AirportCurfew`, or `BrokenChain`.
3. **`apply_curfew(airport, from, to)`** — closes an airport window and unschedules the flights (and their downstream chain) that can no longer operate.

Every disruption produces a `DisruptionReport` (kind, affected flights, unscheduled-with-reason, first break). `recover` simply re-runs `assign()` to slot unscheduled flights back in **without global re-optimization** — the design's stated philosophy. Correctness is guarded by **`assert_invariants()`** in debug builds (status↔aircraft consistency, positive delays, spatial + temporal continuity, first-flight origin = aircraft base) and a suite of **property tests** (`proptests.rs`) plus targeted tests for assign/curfew/delay.

### Functionality
- Load a scenario from JSON (aircraft, airports, flights); scales to the bundled **5,000-flight stress test**.
- Deterministic initial assignment respecting continuity/MTT/availability/curfew.
- Inject delays and curfews; watch cascading unscheduling with typed reasons.
- Local repair (`recover`) and a live `stats` breakdown of fleet utilization.
- Interactive TUI: `ls`, `delay`, `curfew`, `recover`, `stats`.

### Drawbacks
- **It schedules *aircraft*, not *passengers*.** There's no PNR/itinerary/rebooking layer, no crew, no cost/optimization objective — "recovery" means re-slotting flights, not minimizing passenger disruption or cost.
- **Deterministic greedy, by design** — first-fit assignment with **no global optimization**, so solutions are repeatable but not optimal; `MAX_DELAY` is hardcoded (2000).
- Disruption vocabulary is limited to **delay + curfew + aircraft-availability** (from JSON); no cancellations, diversions, or capacity/seat modelling.
- In-memory, single-process CLI/TUI — no API, no persistence, no service surface; no license (Feb 2026).

### Unique / standout feature
**Engineering quality and the "incremental repair" model.** It's the most *soundly built* of the eight: typed unscheduling reasons, a structured disruption report, **debug invariant assertions**, and **property-based tests** — and it correctly implements the genuinely tricky part of IRROPS, **delay propagation along an aircraft rotation chain with cascading breaks**, then repairs locally rather than replanning the world. The best repo here to study for *correct disruption-propagation mechanics*.

---

## 7. chandraseskhar-SD/IrregulaFlightOperation

> *"design using material ui for irrops use case."*

### How it works
A Create-React-App front end (Material-UI + styled-components; `axios` and `react-router` present) that renders a **static mockup of an IRROPS passenger self-service chatbot** named "Aira." The `Irrops` component lays out a phone-width chat screen visualizing an **agentic reasoning trace**:

- **Input** — a hardcoded passenger message ("I cannot afford to wait that long! Is there any possibility of arranging an earlier flight?").
- **LLM Intent** — labelled panels for **Observation / Thought / Action** (a ReAct-style agent loop).
- **Response Builder** — a second Observation/Thought/Action block for composing the reply.

Other files are CRA scaffolding and practice components (`Prractise.js`, `Heloo.js`, a `MyContext` sketch, a `ChatBot.js`).

### Functionality
Essentially **visual only**. It shows *what an IRROPS agent UI could look like* — the structured display of an LLM agent's intermediate reasoning to a support/ops user — but there is no live chat, no state, and nothing is wired to `axios`; the text is hardcoded.

### Drawbacks
- **Not a working app** — a static layout with placeholder copy; the reasoning panels are empty labels, not populated from any model.
- Default, unedited **Create-React-App README** (no project description or run notes beyond CRA boilerplate).
- Practice/scratch files and heavy commented-out styling left in `src/`; no backend, no tests of substance, no license (Sep 2023).

### Unique / standout feature
The **UX idea**: surfacing an agent's **Observation → Thought → Action** trace *and* a separate response-builder stage in a clean, branded chat UI. As a **design reference for an explainable IRROPS assistant** it's a useful starting sketch — but it's a Figma-in-React, not functioning software.

---

## 8. deekshitaa1/AeroMind-AI

> *"A multi-agent airline disruption management system that automates incident handling, passenger compensation, flight rebooking, communication, audit logging, analytics, and AI-powered operational support using Python, Streamlit, SQLite, and Ollama."*

### How it works
The broadest scope of the five, and the only **full-stack, runnable, end-to-end demo** here. A Streamlit multi-page front end (dashboard, incidents, incident summary, **AI copilot**, analytics, audit logs, reports) sits over SQLite databases (`aeromind.db`, `flights.db`, `passengers.db`) and a **multi-agent backend** driven by a local LLM via **Ollama (phi3)** — so no API keys or cost.

The `orchestrator.resolve_incident()` runs three agents in sequence:
1. **Policy agent** (`evaluate_incident`) → compensation eligibility & amount.
2. **Rebooking agent** (`suggest_alternative_flight`) → an alternative flight.
3. **Communication agent** (`generate_passenger_message`) → drafts a passenger notification with **Ollama phi3**.

…and returns `{ policy, rebooking, message }` for the UI to display, with audit logging and analytics pages on top.

### Functionality
- Log/triage a disruption incident (type + severity).
- Compute passenger compensation, propose a rebooking, and auto-draft a passenger message with a **local LLM**.
- Dashboards, audit logs, analytics/reports, and an AI-copilot page; a set of `test_*.py` scripts (orchestrator, rebooking, comm agent, ollama, embedding).

### Drawbacks
- **The "intelligence" is shallow.** The policy/compensation agent is a **hardcoded `if/elif`** table (Technical Failure ₹15,000, Cancelled ₹12,000, Delayed ₹5,000) — not the RAG-grounded policy engine the README implies. The rebooking agent is a **naive linear scan** returning the *first* non-cancelled flight — it ignores origin/route, timing, seats, and passenger preference.
- **The advertised RAG is largely empty stubs.** `agents/compensation_agent.py`, `agents/rag_policy_agent.py`, and `rag/retrieval.py` are **empty files**, even though `faiss_index.bin`, `policy_chunks.pkl`, `vector_store.py`, and `ingest.py` are committed — so "AI-powered policy retrieval" isn't actually wired into the resolve flow.
- **Only one agent uses the LLM** (communication); the rest are deterministic rules, so "multi-agent AI" overstates it.
- **No human-in-the-loop / validation** — the pipeline just produces outputs; nothing checks the booking exists or gates the action. One-line README, no license (Jun 2026).

### Unique / standout feature
**End-to-end breadth on a zero-cost local stack.** It's the only repo of the five you can clone and see the *whole* disruption lifecycle in a UI — incident → compensation → rebooking → **LLM-drafted passenger comms** → audit/analytics — all offline via Ollama + SQLite. As a **hackathon-grade full-stack template** (especially the local-LLM passenger-communication step and the Streamlit ops console) it's the most immediately demoable, provided you replace the stubbed policy/RAG/rebooking cores with real logic.

---

## Side-by-side summary

| Dimension | 4 C# pub/sub | 5 C++ ROADEF | 6 Rust irrops | 7 JS UI | 8 Python AeroMind |
|-----------|:---:|:---:|:---:|:---:|:---:|
| **Runnable today?** | ⚠️ shells only | ❌ abandoned | ✅ yes | ⚠️ static UI | ✅ yes |
| **Core logic in source?** | ❌ (in DLL) | ⚠️ model yes, solver no | ✅ | ❌ (mockup) | ⚠️ shallow / stubs |
| **Optimization / cost model** | rules (BRE, hidden) | ✅ full cost objective | ❌ greedy | — | ❌ hardcoded |
| **Passenger vs aircraft focus** | compensation | both (integrated) | aircraft only | passenger UX | passenger + comp |
| **LLM/AI** | no | no | no | concept only | yes (Ollama phi3) |
| **Tests** | none | none | ✅ property + unit | CRA default | basic scripts |
| **Best studied for** | event-pipeline shape | problem formulation | disruption mechanics | agent-trace UX | full-stack demo |

### Which to use for what
- **Correct disruption mechanics** (delay propagation along rotations, MTT/continuity, typed break reasons) → **#6 konczyk/irrops**, hands down the best-engineered.
- **How to *formulate* the optimization** (integrated aircraft + itinerary recovery, cost + EU compensation, benchmark data) → **#5**'s domain model and the ROADEF instances — then bring your own solver.
- **A demoable full lifecycle with local LLM comms** → **#8 AeroMind**, after replacing its hardcoded/stubbed cores.
- **An explainable IRROPS assistant UI** → **#7** as a visual starting point.
- **An event-sourced compensation pipeline shape** → **#4**'s concept (but the substance is locked in a DLL).

### How these relate to Part 1
- Want the **production-safe write path** → Part 1 #1 (ben-marrett).
- Want the **event-driven microservice architecture** → Part 1 #2 (irinakomarchenko) for the design; **#4** here echoes the same pub/sub-for-compensation idea in .NET.
- Want the **HITL AI-agent safety model** → Part 1 #3 (oneairagent); **#8** here is the fuller (but less safe) multi-agent cousin, and **#7** is a UI concept for the same space.
- Want the **algorithmic/OR core** the app repos lack → **#5** (formulation) + **#6** (working scheduling mechanics).

*Analysis generated 2026-07-02 by reading each repo's README, source, and (where present) design docs. Note: #4's real logic is a compiled DLL and #5 is an author-declared abandoned scaffold — both assessed from what is actually in-repo.*
