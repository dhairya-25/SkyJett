# Deck Outline — ≤10 slides (with speaker notes)

> Build the slides from this skeleton. Rubric mapping: Self-Service/UX **30%** · Innovation **20%** · Solution Design/NFR **15%** · Business Understanding **15%** · Engineering **10%** · Presentation **10%**.
>
> **The one-liner:** *"A focused, explainable version of what Amadeus and Sabre sell to airlines — proactive, self-service disruption recovery, optimised for the passenger, not just the ops team."*

## 1 — The problem (Business, 15%)
- SkyJet: 65 aircraft, Asia. During weather disruptions **~40% of passengers call**, waiting **>25 minutes** — to ask three questions: *Is my flight cancelled? Can I move? Am I owed a refund?*
- The call centre drowns exactly when passengers are most anxious. COO wants digital self-service before holiday season.
- Market context: 67–72% of passengers now *prefer* self-service during disruptions; ~2/3 are unhappy with airline disruption comms.

## 2 — Product decisions (the hidden test)
- **Scenarios:** cancellation · long delay (≥3h) · (deferred: diversions, overbooking, voluntary changes).
- **Automate:** status, free rebooking, refund/compensation eligibility — high-frequency, low-risk.
- **Escalate:** minors, medical, pets, groups, partner tickets, no-valid-option, "I want a human" — always with warm context.
- *Say out loud: we scoped deliberately; a flawless narrow product beats a broken broad one.*

## 3 — The journey (demo setup slide)
- Paste the customer-journey diagram (docs/customer-journey.md).
- Beat: **alert reaches the passenger first** → QR → identified → explained → recovered in **<30s**.

## 4 — LIVE DEMO (the 30% bucket — give it 90 seconds)
1. Proactive WhatsApp alert → tap QR → land identified.
2. Status card: what + **why** (weather).
3. Eligibility panel: rebook ✅ refund ✅ comp ❌ **with the DGCA rule cited**.
4. Accept the **held** recommended flight → boarding pass + bags rerouted + check-in.
5. Impact tile: 1 call deflected · ~25 min saved.
- Backup: scenario chips for technical (comp ₹10,000) and minor (handoff). Have the demo video ready as insurance.

## 5 — The eligibility engine ★ (Innovation, 20%)
- Cause drives entitlement: extraordinary (weather/ATC/security) → rebook/refund + care, **no cash comp**; airline-controlled (technical/crew/ops) → **+ tiered comp** (₹5k/₹7.5k/₹10k by block time, DGCA CAR §3-M-IV).
- Pure, deterministic, unit-tested function; every decision ships a plain-English **reason + rule citation**.
- Contrast: American's tool is criticised as opaque; Sabre IROPS scores passengers by value. **We show the why.**

## 6 — Grounded assistant (Innovation, 20%)
- Free-form questions ("Am I owed a hotel tonight?") answered **extractively** from a curated policy corpus — with citations; cannot hallucinate.
- Personalised through the *same* rules engine — one source of truth.
- Guardrails: grounded-only, refuses off-topic, proposes but never executes actions.

## 7 — Architecture & NFR (15%)
- Paste the architecture + sequence diagram (docs/architecture.md).
- Modular monolith → microservices-ready seams; AWS mapping (ECS/Lambda, RDS, ElastiCache, SQS).
- **The write path**: authenticated → idempotent → state machine → optimistic lock → revalidated. A double-tap can't double-book; refund XOR rebook is enforced.
- Disruption = traffic spike: stateless, cached status, queued notifications.

## 8 — Engineering quality (10%)
- TypeScript strict end-to-end · Zod on every boundary · **45 unit tests** on the rules engine, scoring, and the API contract · E2E smoke script · audit trail on every action · rate limiting + security headers · Prisma schema committed for the Postgres swap.
- AI-tool disclosure (per rules): Claude Code for research synthesis, scaffolding, codegen — decisions and review by the team.

## 9 — What we deliberately deferred
- Real payments/IdP, live GDS inventory, partner/interline, multi-language, predictive pre-disruption alerts (VoyagerAid-style), Kafka/event backbone, heavy RAG stack.
- *Framing: each is a roadmap item with a designed seam — not a gap.*

## 10 — Impact (close)
- Per disrupted flight (~180 pax): if self-service handles the routine 70%, that's **~126 calls deflected, >52 agent-hours saved** — per flight, per disruption.
- Passenger: 25-minute hold → **<30-second recovery**, with entitlements explained instead of hidden.
- "SkyJet tells you first, tells you why, and gets you moving — before you'd have gotten off hold."
