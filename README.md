# SkyJet Flight Recovery — 22North Product Engineering Challenge 2026

> **Challenge 1 · Self-Service Flight Recovery for Disrupted Journeys**
> A self-service experience that lets airline passengers recover from weather/technical
> disruptions — **rebook, refund, or get an answer** — in **under 30 seconds**, without
> calling the contact centre. Complex cases hand off to a human *with full context attached*.

This repository is the full working workspace for the challenge submission: the **deployable
MVP**, the **design deliverables**, and the **research** the product decisions are grounded in.

---

## The problem in one line

SkyJet Airways (65 aircraft, Asia) sees **~40% of passengers call the contact centre** during
weather disruptions to ask three things — *Is my flight cancelled? Can I move to another flight?
Am I owed a refund?* — with average hold times **over 25 minutes**, peaking exactly when the
airline is most overwhelmed. This MVP answers all three, self-service, and knows when to escalate.

---

## Repository layout

```
22n/
├── skyjet-recovery/     ★ THE APP — Next.js 16 + React 19 MVP (has its own detailed README)
├── docs/                Design deliverables (architecture + feature scope)
│   ├── architecture.md      Architecture diagram · module design · data model · API · NFR · assumptions
│   └── features.md          Full prioritised feature backlog (P0–P3) + required deliverables
├── research/            Background research the product is grounded in
│   ├── competitor-analysis.md / -part3.md        Amadeus, Sabre, American, Delta, KLM, CMAC…
│   ├── flight-rebooking-repos-analysis.md        9 GitHub reference implementations, deep-dived
│   ├── flight-disruption-repos-analysis-part2.md
│   └── flight-repos-INDEX.md                     Master index + "if you were assembling one system"
└── README.md            ← you are here (workspace overview)
```

**Start here:** the application lives in **[`skyjet-recovery/`](skyjet-recovery/)** and has its own
comprehensive [README](skyjet-recovery/README.md) covering demo credentials, the API reference, the
RAG assistant, and the eligibility engine.

---

## Quick start

```bash
cd skyjet-recovery
npm install
npm run dev            # → http://localhost:3000
```

Requires **Node 18+** (developed on Node 22). **No database or API keys needed** — the app runs on a
deterministic in-memory seeded store, identically on a laptop and on Vercel. The RAG assistant is an
optional enhancement (see below); everything else works without any keys.

### Try it — demo credentials

Open the app, tap a scenario chip, or enter a PNR + last name:

| Scenario | PNR | Last name | What you'll see |
|---|---|---|---|
| **Weather cancellation** | `SJ7QK2` | `Sharma` | Rebook / refund + meals, **no** cash compensation (weather) |
| **Technical cancellation** | `SJ4RM9` | `Nair` | Same, **plus ₹10,000** compensation (airline-controlled) |
| **5-hour weather delay** | `SJ8XP5` | `Mehta` | Long-delay handling, meals, no compensation |
| **Unaccompanied minor** | `SJ2MN1` | `Gupta` | **Agent handoff** with context (not automated) |

---

## What makes it different

1. **Explainable eligibility** — every decision shows *why*, citing the actual rule
   (*"No cash compensation: weather is an extraordinary circumstance under DGCA CAR §3-M-IV —
   but you get a free rebooking, refund, and meals."*).
2. **Proactive + QR entry** — a QR / deep-link drops the passenger straight into their disrupted booking.
3. **Smart, reasoned recommendation** — the best rebooking option is highlighted with a plain-English reason.
4. **Warm agent handoff** — complex cases (minors, medical, groups) escalate *with full context attached*.
5. **Grounded Disruption Assistant** — a chatbot that answers free-form questions grounded in SkyJet
   policy **with citations** (no hallucination), personalised to the booking via the same eligibility engine.
6. **Live impact tile** — "calls deflected / minutes saved" shown on completion.

---

## The core: a pure, explainable eligibility engine

The crown jewel is [`skyjet-recovery/src/lib/eligibility.ts`](skyjet-recovery/src/lib/eligibility.ts) —
a **pure, fully unit-tested** function where the *cause* of the disruption drives entitlement
(cross-validated by **DGCA India** and **Delta**):

```
Weather / ATC / security  → free rebook OR full refund + meals/hotel   ✅
                            cash compensation                          ❌ (extraordinary circumstance)
Technical / crew / ops    → the above  +  tiered cash compensation     ✅ (airline-controlled)
                            (₹5,000 / ₹7,500 / ₹10,000 by block time)
```

Every result carries a human-readable `reason` and a `ruleRef` — that's what powers the explainable UI
and the grounded chatbot. It is deliberately a *reasoned* engine, not a shallow hardcoded `if/elif` table.

---

## Technology stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** |
| Language | **TypeScript** (strict) |
| Styling | **Tailwind CSS v4** + a small custom UI kit (CVA) |
| Validation | **Zod** on every API boundary |
| Testing | **Vitest** — rules engine, option scoring, assistant retrieval, seat map, and the API contract |
| Data | In-memory seeded store; **Prisma/PostgreSQL** schema documented for production |
| RAG (optional) | **Gemini** embeddings + **Pinecone** serverless, with a deterministic keyword fallback |
| Deploy | Vercel-ready |

---

## Architecture at a glance

A **modular monolith today, microservices-ready on paper** — one deployable process with clean module
seams so it can be split later without a rewrite. Disruptions are traffic *spikes*, so the design calls
for stateless services, cached flight status, async notifications, and **idempotent, race-safe rebooking**
(a double-tap can never double-book).

Full diagrams (module map, write-path sequence, booking state machine, NFR story) live in
**[`docs/architecture.md`](docs/architecture.md)**. The prioritised feature backlog and the required
challenge deliverables are in **[`docs/features.md`](docs/features.md)**.

---

## The Disruption Assistant (optional RAG chatbot)

A layered design where **every layer is grounded** — the model can explain policy but never invent it,
and the demo survives any vendor outage:

1. **Semantic RAG** — Gemini embeds the question → Pinecone finds the top policy clauses → Gemini Flash
   writes a short answer using *only* those clauses + verified eligibility facts → citations attached.
2. **Extractive fallback** — if generation fails, the top retrieved clause *is* the answer (verbatim, cited).
3. **Keyword retrieval** — if embeddings/Pinecone are unconfigured, a deterministic tokenise → synonym-expand
   → score engine answers, still with citations. So it can **never dead-air**.

To enable the semantic tier, copy `skyjet-recovery/.env.example` to `.env.local`, set `GEMINI_API_KEY`,
`PINECONE_API_KEY`, and `ADMIN_TOKEN`, then index the corpus once via `POST /api/admin/reindex`.
See the [app README](skyjet-recovery/README.md#the-disruption-assistant-rag-chatbot) for details.

---

## Research grounding

Every product decision traces back to real-world sources, documented in **[`research/`](research/)**:

- **Competitor analysis** — how Amadeus, Sabre, American, Delta, KLM, and CMAC handle disruption
  recovery, and where they fall short for the *passenger* (the gap this MVP targets).
- **Reference implementations** — nine GitHub repos deep-dived in a common format
  (*how it works · functionality · drawbacks · standout feature*); the idempotent write path,
  scored-options model, and warm-handoff patterns borrowed here are all cited back to their source.
  Start with **[`research/flight-repos-INDEX.md`](research/flight-repos-INDEX.md)**.

---

## Key assumptions

- Passenger/flight data is **mocked** with realistic, deterministic seed data (pinned to a fixed
  "disruption day" in IST).
- **No payment integration** (per brief) — refunds and compensation issue a reference number only.
- Lightweight auth: **PNR + last name** (production would use OTP / an IdP).
- Airline-caused disruption ⇒ no fare difference on rebooking; weather thresholds:
  long delay ≥ 3h, meals ≥ 2h, hotel ≥ 6h (overnight).

Full list in [`docs/architecture.md` §9](docs/architecture.md) and the app README.

---

## AI tools used (disclosure)

Built with **Claude / Claude Code** (per challenge rules) for competitor & regulatory research
synthesis, scaffolding, code generation, and documentation. All architecture, product decisions,
the eligibility rules, and final code were directed and reviewed by the team.

---

*22North Product Engineering Challenge 2026 · Challenge 1. Deadline 03-Jul-2026 12:00 IST.*
