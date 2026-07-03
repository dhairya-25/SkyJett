---
name: flight-recovery-mvp
description: Use when designing, building, presenting, or making product/engineering decisions for the 22North Product Engineering Challenge 2026 Challenge 1 — the SkyJet Airways self-service flight recovery / IRROPS disruption rebooking MVP. Covers flight-status, rebooking, refund & compensation eligibility (DGCA rules), agent handoff, competitor analysis, GitHub reference implementations, tech stack, scope, and demo/deck guidance.
---

# Flight Recovery MVP — SkyJet Airways (22North PS1)

## Overview

**Business problem:** SkyJet Airways (regional, 65 aircraft, Asia) — during weather disruptions **~40% of passengers call the contact center** to ask three things: *Is my flight cancelled? · Can I move to another flight? · Am I owed a refund?* Average wait **> 25 min**. The COO wants **digital self-service** before the next holiday season.

**Core principle:** *Automate the high-frequency, low-risk decisions; route complex, high-risk ones to an agent — always with a warm handoff carrying full context, so the passenger never repeats themselves.* Judges grade **product thinking + polish + explainability**, not feature count.

**The one-liner (use in the deck):** *"A focused, explainable version of what Amadeus and Sabre sell to airlines — proactive, self-service disruption recovery, optimized for the passenger, not just the ops team."*

## When to use / not use

**Use for:** anything on PS1 — architecture, the eligibility/rules engine, the customer journey, the rebooking flow, the deck, the demo script, defending design decisions in the Q&A, competitor/regulatory framing.

**Not for:** the other 5 challenges (Conversational Booking, Investor Self-Service, AI Studio, Cloud Cost, Security & Compliance).

## Hard constraints (do not violate)

- **Deadline:** submission **03-Jul-2026, 12:00 IST** — treat scope as a *~1-day* build, not 48h.
- **No payment integration** — refunds issue a **reference number only**.
- Passenger/flight data via **mock APIs**; realistic seed data is fine.
- Team ≤ 2; **one project**; **AI-tool usage must be disclosed** in the README.
- Finalists **present in person** in Vadodara → every decision must be defensible aloud.

## Recommended MVP scope (one polished vertical slice)

**Build:**
1. PNR + last-name lookup over mock API (4–5 seeded bookings) — optional **QR deep-link** entry.
2. Disruption **status** screen (cancelled + long delay), showing *what* + *why* (weather).
3. **Rebooking** flow: alternatives → **smart recommended "best option"** → one-click → new boarding pass.
4. **Refund/compensation eligibility** rules engine → decision + **reason** + amount → reference number.
5. **Agent-handoff** card with a context summary (out-of-policy cases).
6. A screen showing the **proactive alert** that would be sent.
7. *(If time)* **impact tile**: "X calls deflected / Y minutes saved / time-to-reaccommodate".

**Explicitly defer (say so — deliberate scoping scores points):** real payments, real auth/IdP, live inventory, partner/interline rebooking, loyalty, multi-language, predictive disruption, capacity tracking.

## The three product decisions (the "hidden test" in the brief)

- **Scenarios to support:** ✅ cancellation · ✅ long delay (>3h) · ✅ weather-caused missed connection. ⏸️ defer diversions, overbooking, voluntary changes.
- **Automate (self-service):** status check · rebook (free, airline-caused) · refund/compensation eligibility.
- **Escalate (agent-assisted):** special assistance (minors/medical/pets) · groups/multi-city · partner-airline/award tickets · no valid rebooking in policy · disputed fares/OTA bookings · anyone who asks for a human.

## ⭐ Eligibility engine — the core logic (crown jewel)

Cross-validated by **DGCA (India)** *and* **Delta**: cause of disruption drives entitlement.

```
IF cause ∈ {weather, ATC, security, force-majeure}:   # "extraordinary circumstances"
    → rebook (free) OR full refund        ✅ always (passenger's choice)
    → duty of care: meals (>2h), hotel (overnight / >12h)  ✅
    → CASH COMPENSATION                    ❌ NOT owed
ELSE (airline-controllable: technical, crew, ops):
    → rebook (free) OR full refund        ✅
    → duty of care                        ✅
    → CASH COMPENSATION (tiered by delay) ✅ owed
```

**DGCA specifics to encode** *(verify current DGCA CAR before quoting as legal fact)*: cancellation → alternate flight OR full refund; refund in ~7–15 working days; meals **>2h**, hotel **overnight/>12h**; compensation tiers commonly **₹5,000 / ₹7,500 / ₹10,000** by block time; claim window 2 years. EU261 analogue (from ROADEF repo): **€250 / €400 / €600** by distance/duration.

**Why this wins:** make the rule **explainable** — *"Not eligible for cash compensation because the cause is weather (an extraordinary circumstance under DGCA), but you're entitled to a free rebooking, a full refund, and a hotel."* American's real tool is criticized for *opaque, suboptimal* options — transparency is our clearest edge. **Do NOT** hardcode a shallow `if/elif` compensation table (the AeroMind repo's mistake); make it a real, reasoned rules engine.

## Differentiators (all validated by the research)

1. **Proactive + QR deep-link** — reach the passenger first, drop them straight into a rich guided flow (KLM only notifies + a basic login; CMAC validates QR links).
2. **Explainable eligibility, in the alert** — show *why* + surface compensation immediately (Forbes: bake eligibility into the notification).
3. **Smart, reasoned "best option"** recommendation (the gap AA gets criticized for).
4. **Fair & transparent** — vs. the hidden value-scoring of Sabre IROPS / VoyagerAid.
5. **Warm agent handoff** with full context.
6. **Live impact tile** — the KPIs VoyagerAid says matter (call deflection, time-to-reaccommodate, NPS).

## Tech stack + architecture

**Stack:** TypeScript · **Next.js 14 (App Router)** · Tailwind + shadcn/ui · Route Handlers (REST) + Zod · **Prisma + SQLite** (Postgres-ready) · Vitest on the rules engine · Vercel deploy · PWA manifest. (Matches 22North's React/Node/Postgres/REST leaning.)

**Architecture:** modular monolith now, **microservices-ready on paper** — service modules: `booking`, `flightStatus`, `rebooking`, `eligibility`, `notification`, `handoff`. Diagram them as independently-deployable services.

**NFR story (scores the 15% bucket):** disruptions are **traffic spikes** → stateless services, **cached** flight status, **async notifications via a queue**, **idempotent rebooking** (double-tap can't double-book). AWS mapping: ECS/Lambda + RDS Postgres + SQS.

## Engineering patterns to borrow (from the 9-repo analysis)

| Pattern | Source repo | Use in our MVP |
|---|---|---|
| Idempotency-key + ETag/optimistic-lock + revalidate selection vs fresh options | **ben-marrett/flight-rebooking-service** | the `POST /rebook` write path (race-safe) |
| Scored options (start 100, adjust) + plain-English reason per option | **ben-marrett** | smart recommendation + explainability |
| Adapter-per-airline lookup → one normalized PNR, no DB | **pnrsh** (Go) | booking-lookup abstraction |
| Event-driven saga: topics, message keys for ordering, outbox, DLQ, idempotent consumers | **irinakomarchenko/airline-disruption-platform** | async notification + NFR/future story |
| Business Rules Engine as an event pipeline for compensation | **kumarmanish/AirlinesEventPublisher** | eligibility-engine framing |
| Delay propagation along rotation chain + typed break reasons | **konczyk/irrops** (Rust) | disruption mechanics (depth/future) |
| Tiered EU261 legal compensation + explicit cost objective | **Zhouxing-Su/FlightDisruptionRecovery** (ROADEF) | compensation tiers reference |
| HITL: "authority in the human + DB, never the model"; capability gating; validate vs ground truth; audit + PII redaction | **nikhilc523/oneairagent** | agent handoff; guardrails if an AI assistant is added |
| Observation→Thought→Action explainable agent UX | **chandraseskhar-SD/IrregulaFlightOperation** | explainability UX (if chat) |
| Full-stack demo shape: incident→comp→rebook→LLM comms→audit (but shallow logic) | **deekshitaa1/AeroMind-AI** | demo structure; a cautionary example of what NOT to hardcode |

## Key stats for the deck (from the research)

- **67–72%** of passengers chose self-service during disruptions (2025); disruption self-service now **exceeds** regular-booking self-service.
- **~2/3 of travelers are unhappy** with airline disruption comms; **57%** want more informative updates; only **34%** happy with frequency.
- Third-party apps (Flighty) beat airlines' own alerts → pitch: **"SkyJet should tell you first."**
- SkyJet's own numbers: **40% call**, **>25-min** waits, **65 aircraft**.

## Competitive landscape (one line each — detail in references)

- **Amadeus** — rules-engine self-service; ⭐ no-show tracking via acknowledgment; enterprise lock-in.
- **Sabre Mosaic** — ⭐ journey/connection-aware rebooking; integration-heavy.
- **Sabre IROPS** — ⭐ value-based prioritization + what-if; ops-tool, fairness risk.
- **Delta Rebook Me** — ⭐ "same options as agents" + auto bag reroute; excludes minors/groups.
- **Delta (support hub)** — ⭐ automatic 24-hour refund; weather/ATC excluded from reimbursement.
- **KLM Travel Alerts** — ⭐ proactive reach-out + auto-rebook; self-service is basic.
- **American Dynamic Reaccom** — ⭐ full loop (reissue+boarding pass+bag reroute); criticized as opaque/suboptimal.
- **VoyagerAid (vision)** — ⭐ predict disruption before it happens; = our "future" slide.
- **CMAC Smartlink** — ⭐ Drawdown block-booking; validates QR self-booking links.

## Evaluation rubric mapping (weightings)

Working Product / UX / **Self-Service 30%** · Innovation & Product Thinking 20% · Solution Design & NFR 15% · Business Understanding 15% · Engineering Quality 10% · Presentation 10%. This challenge is a bullseye for the 30% bucket. Spend freed time on differentiators (20%) + a flawless demo (10%).

## Deliverables owed

Working MVP · source code · README (team name, members, college, build/run, tech stack, **AI tools used**) · architecture diagram · API design/docs · DB schema · customer journey · key assumptions · ≤10-slide deck · 3–5 min demo video.

## Key assumptions

Mock APIs; no payments (refund = reference number); auth = PNR + last name (optional OTP); airline-caused disruption → rebooking has no fare difference; long-delay threshold = 3h; auto-rebook window = same-day / next 24h.

## Reference files (deep-dive research — read on demand)

- **[references/competitor-analysis.md](references/competitor-analysis.md)** — §1–8 products (Amadeus, Sabre Mosaic, Sabre IROPS, Delta Rebook Me, Delta support hub, KLM, American, VoyagerAid-Future) + comparison tables + "what this means for us." *(This file absorbed the former Part 2; Part-3's "Part 2 §8" link points here.)*
- **[references/competitor-analysis-part3.md](references/competitor-analysis-part3.md)** — §9–12 context (VoyagerAid satisfaction/stats, **DGCA India rules**, Forbes passenger POV, CMAC Smartlink) + deck stat-sheet + consolidated differentiators.
- **[references/flight-repos-INDEX.md](references/flight-repos-INDEX.md)** — master index of **9 GitHub repos**, ranked, with a "pick by what you're building" decision guide + the **pnrsh** deep-dive.
- **[references/flight-rebooking-repos-analysis.md](references/flight-rebooking-repos-analysis.md)** — ben-marrett (safe write path), irinakomarchenko (event-driven saga), oneairagent (HITL AI safety).
- **[references/flight-disruption-repos-analysis-part2.md](references/flight-disruption-repos-analysis-part2.md)** — kumarmanish (BRE pipeline), ROADEF (OR formulation + EU261), konczyk/irrops (delay propagation), chatbot UI, AeroMind (full-stack demo).

*Skill compiled 2026-07-02 from the d:\22n\research folder. References are a snapshot — re-sync if the research files change.*
