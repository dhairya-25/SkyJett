# Feature Specification — SkyJet Self-Service Flight Recovery (PS1)

> 22North Product Engineering Challenge 2026 · Challenge 1.
> Source of truth for **what we build vs. defer**. Priorities are tuned for a **~1-day build** (deadline 03-Jul-2026 12:00 IST). Background & rationale live in the [flight-recovery-mvp skill](../.claude/skills/flight-recovery-mvp/SKILL.md) and [research/](../research/).

## Priority legend

| Tag | Meaning | Rule |
|---|---|---|
| **P0** | Must-have — the golden demo path | Build first. Demo fails without it. |
| **P1** | Should-have — key differentiators | Build if P0 is solid. These win the 20% Innovation bucket. |
| **P2** | Could-have — polish | Only if time remains. |
| **P3** | Deferred — out of MVP scope | **List explicitly in the deck** (deliberate scoping scores points). |

## 🔒 The Golden Demo Path (must work flawlessly)

This is the ~90-second story judges see. Every P0 exists to serve it:

1. Passenger gets a **proactive alert** (cancellation) → taps the **QR / deep-link**.
2. Lands identified → sees a clear, empathetic **status card** (what + why).
3. Picks **Rebook** → sees alternatives with a **recommended "best option"** → one tap → **new boarding pass**.
4. (Alt branch) Picks **Refund** → **explainable eligibility** decision + reason + amount → reference number.
5. (Edge branch) A special-assistance case → **warm agent handoff** with context summary.
6. Closes on the **impact tile**: "1 call deflected · ~25 min saved."

---

## 1. Identify & Access

| Feature | Priority | Description / Acceptance |
|---|---|---|
| PNR + last-name lookup | **P0** | Enter 6-char PNR + surname → fetch booking from mock API. Invalid → friendly error. |
| QR / deep-link entry | **P1** | QR encodes a PNR deep-link → lands straight in the disrupted booking, no typing. (Differentiator; validated by CMAC.) |
| Optional OTP step | **P2** | Mock OTP screen to show auth awareness. Note real IdP as future work. |
| Real authentication / SSO | **P3** | Deferred — mock only. |

## 2. Disruption Status

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Status card: cancelled | **P0** | Show flight, status, **reason (weather)**, reassurance. |
| Status card: long delay (>3h) | **P0** | Same card for delay ≥ threshold. |
| "Why" transparency | **P0** | Always state the cause — drives eligibility + kills information asymmetry (Forbes insight). |
| Weather-caused missed connection | **P1** | Detect broken connection; show it as one journey (Sabre Mosaic pattern). |
| Real-time flight tracking (inbound aircraft, gate, ETA) | **P2** | Give the passenger the same operational picture the airline has — kills information asymmetry (Forbes). |
| Cascading delay propagation (knock-on down the rotation) | **P3** | Advanced disruption mechanics (konczyk/irrops repo). Future depth. |
| Diversions / overbooking / voluntary changes | **P3** | Deferred. |

## 3. Rebooking (automated)

| Feature | Priority | Description / Acceptance |
|---|---|---|
| List alternative flights | **P0** | Pull candidates from mock inventory. |
| **Smart "best option"** recommendation | **P0** | Highlight top pick with a **plain-English reason** ("Same day, 3h later, direct"). Scoring model à la ben-marrett repo. **This is our edge over AA's opaque tool.** |
| One-click confirm | **P0** | Confirm → booking state → REBOOKED. |
| New boarding pass | **P0** | Generate/display new pass after rebook. |
| Idempotent rebook | **P1** | Idempotency key + revalidate selection vs fresh options → double-tap can't double-book (ben-marrett pattern). |
| Seat / bag handling | **P2** | Show auto bag-reroute + seat retention (Delta/AA pattern). |
| Accept **default** rebooking in one tap | **P1** | Pre-assign the best option so the passenger can just accept (Amadeus/KLM/AA default-rebooking pattern). |
| No-show acknowledgment tracking | **P2** | Record that the passenger saw/accepted the proposed flight → airline manages no-shows (Amadeus ⭐ feature). |
| Re-rebook / change again (unlimited attempts) | **P2** | "Rebook as many times as needed until you're on your way" (Delta). |
| Check-in for the rebooked flight | **P2** | Instant reissue → check in for the new flight (AA pattern). |
| No fare difference (airline-caused) | **P0** | Assumption baked in; state it. |
| Cost/disruption-optimized selection | **P3** | Optimization objective for the best option (ROADEF formulation). Future. |
| Partner / interline / award rebooking | **P3** | Deferred → escalate to agent instead. |

## 4. Refund & Compensation Eligibility (automated)

| Feature | Priority | Description / Acceptance |
|---|---|---|
| **Eligibility rules engine** | **P0** | Cause-driven logic: weather → refund/rebook + duty-of-care, **no cash compensation**; airline-caused → + tiered compensation. (DGCA + Delta validated.) |
| **Explainable decision** | **P0** | Show verdict **+ the reason + the rule** ("Not eligible for cash comp: weather = extraordinary circumstance under DGCA; you get free rebooking + refund + hotel"). **Core differentiator.** |
| Refund amount + reference number | **P0** | No payments — issue a reference number only. |
| Duty of care: meals (>2h) / hotel (overnight) | **P1** | Surface entitlement per DGCA thresholds. |
| Compensation tiers (₹5,000/₹7,500/₹10,000) | **P1** | Encode DGCA-style tiers for airline-caused cases. |
| Voucher / eCredit alternative to cash refund | **P2** | Offer voucher vs. refund (refund-vs-voucher split is a tracked KPI; Amadeus/VoyagerAid). |
| Self-book hotel / ground transport (voucher or reference) | **P2** | Let the passenger self-arrange overnight welfare (CMAC Smartlink) — issue a reference, no payment. |
| Refund / request status tracker | **P2** | Check the status of a submitted refund/request (Delta). |
| Auto 24-hour refund safety net | **P2** | "No action in 24h → auto-refund" (Delta pattern) — great demo beat. |
| Real refund disbursement | **P3** | Deferred (no payment integration). |

## 5. Agent Handoff / Escalation

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Escalation triggers | **P0** | Route special-assistance, groups, no-valid-rebooking, disputed/OTA, "I want a human" to an agent. |
| **Warm handoff with context summary** | **P0** | Package PNR + disruption + what the passenger tried → agent never asks them to repeat. |
| "Talk to an agent" always visible | **P0** | Present on every screen. |
| Live agent chat / queue | **P3** | Deferred — mock the handoff. |

## 6. Proactive Notification (the differentiator)

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Disruption detection → alert | **P0** | On cancellation, show the **alert that would be sent** (mock SMS/WhatsApp) with a deep link. |
| Pre-held seat in the alert | **P1** | "We've held a seat on SJ456 — tap to accept" (KLM pattern). |
| Multi-channel (SMS/WhatsApp/email) mock | **P2** | Show channel options; mocked send. |
| Auto-generated personalized alert message | **P2** | Compose the notification text per passenger/disruption (AeroMind comms agent) — templated, not hardcoded. |
| Ongoing status updates / "keep me posted" opt-in | **P2** | Subscribe to journey-stage updates before + during travel (KLM). |
| Drawdown / bulk pre-booking for mass disruption | **P3** | Block-book inventory proactively at scale (CMAC). Future/scale. |
| Real Twilio/WhatsApp integration | **P3** | Deferred — mock only (allowed by constraints). |
| Predictive (pre-disruption) alerts | **P3** | Deferred → "future enhancements" slide (VoyagerAid vision). |

## 7. Impact / Analytics

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Impact tile | **P1** | "X calls deflected · Y minutes saved · time-to-reaccommodate." Turns the value claim into a visible metric. |
| **Sub-30-second recovery** headline | **P1** | Resolve the core journey in < 30s and show it ("Recover in under 30s vs a 25-min hold"). Cheap to add; strong demo line. |
| KPI dashboard | **P2** | Small ops view: deflection rate, refund-vs-rebook split, NPS placeholder. |

## 8. Cross-cutting UX & Non-functional

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Mobile-first, polished UI | **P0** | Tailwind + shadcn/ui; clean cards, empathetic microcopy. Wins the 30% bucket. |
| Installable PWA | **P2** | Manifest + service worker. |
| Explainability everywhere | **P0** | Every decision shows its "why." The connective theme of the whole product. |
| Cached flight status | **P1** | NFR story: many ask the same question during a spike. |
| Async notifications via queue | **P1** | NFR story (design/diagram; mock impl). |
| Accessibility (contrast, labels, keyboard) | **P2** | Baseline a11y for polish. |
| Input validation (Zod) + error states | **P0** | No broken/blank screens in the demo. |

---

## 9. Policy Grounding & Explainability Assistant (RAG-lite)

> Adapted from the appliance-manual RAG project. **Build the lightweight version** — a small curated policy set with an in-memory embedding + cosine-similarity search (or curated keyword mapping), always with a **deterministic fallback** so the demo never dead-airs. **Do NOT** stand up a separate FastAPI/Qdrant/reranker service in a ~1-day build.

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Grounded "Disruption Assistant" (**semantic search** over policy docs) | **P1** | Ask "Am I owed a hotel tonight?" → semantic-search ~8–10 curated policy snippets → answer **grounded in the cited clause**. Enriches the explainable eligibility (§4). |
| **Policy-clause citation** on every answer | **P1** | Eligibility + assistant answers cite the exact clause ("§4.2: weather delay >6h overnight → hotel"). Extends the P0 explainability theme. |
| **Assistant guardrails** (grounded-only, refuse off-topic, no autonomous actions, PII-safe) | **P1** | Answer only from retrieved policy; deflect off-topic; the assistant may **propose** but never execute actions (human/rules confirm) — "authority in the human + DB, never the model" (oneairagent repo). |
| **Multiple policies in one grounded answer** | **P2** | Combine clauses across fare class / partner rules into one response (their "multiple manuals" idea). |
| **Reranking** of retrieved clauses | **P2** | Rank the most relevant clause for the passenger's exact situation. Marginal at ~10 docs; matters as the corpus grows — good "how it scales" talking point. |
| **Admin upload → auto-index** policy | **P2** | Ops uploads updated disruption policy → auto-chunked/embedded, no code change. Extra admin surface — build light or defer. |
| Heavy RAG stack (Qdrant + dedicated reranker model + full embeddings pipeline / NVIDIA NIM) | **P3** | Deferred — the enterprise version. State as future work; keeps the demo bulletproof. |

**How this connects:** §4's eligibility engine gives the *decision*; this assistant makes the *explanation* conversational and source-cited, and answers free-form "what am I entitled to?" questions — all in **< 30s** (§7). Together they are the "explainability" differentiator judges reward.

---

## 10. Security, Governance & Audit (NFR — scores the 15% bucket)

> Mostly cheap to add and disproportionately valuable — enterprise-readiness signals judges reward. Patterns from the reference repos (ben-marrett, oneairagent) and DGCA/EU261 compliance.

| Feature | Priority | Description / Acceptance |
|---|---|---|
| Idempotency + optimistic locking on writes | **P1** | (See §3) race-safe rebooking; the standout engineering pattern from ben-marrett. |
| Audit trail of every action | **P2** | Log every rebook/refund/handoff (who, before/after, outcome, trace-id) — governance + debuggability (ben-marrett, oneairagent, AeroMind). |
| PII redaction / data minimization | **P2** | Redact name/email/PNR in logs; show only what's needed on screen (oneairagent). Good DPDP/privacy story. |
| Compliance record-keeping (DGCA/EU261) | **P2** | Persist eligibility decisions + entitlements for audit (CMAC EU261 tracking). |
| RFC-7807-style error responses + input validation | **P1** | Clean, typed API errors; no blank/broken screens (ben-marrett). |

## 11. Future / Scale enhancements (deferred — for the "Future Work" slide)

> All **P3**. Capture them to *talk about*, not to build. Deliberate deferral is a scored signal of judgment.

| Idea | Source | Value |
|---|---|---|
| Predictive (pre-disruption) alerts | VoyagerAid | React before the disruption is even announced. |
| Full RAG stack (Qdrant + reranker + NIM) | appliance-manual project | Enterprise-grade policy grounding at scale. |
| What-if recovery simulation (ops) | Sabre IROPS | Let ops compare recovery scenarios before committing. |
| Cost/OR-optimized rebooking | ROADEF | Minimize total passenger disruption/cost, not just per-passenger. |
| Cascading delay propagation | konczyk/irrops | Model knock-on effects along aircraft rotations. |
| Event-driven microservices (Kafka + saga + outbox + DLQ) | irinakomarchenko | The scale architecture behind the modular monolith. |
| Baggage tracking ("Track My Bags") | Delta / Forbes | Close the lost-luggage anxiety loop. |
| Live agent chat / queue | — | Real-time human handoff instead of a mock. |

---

## Deliverables (required by the brief — separate from features)

| Deliverable | Priority | Notes |
|---|---|---|
| Working MVP (deployed URL) | **P0** | Vercel live link. |
| Source code | **P0** | Clean, typed, in a shareable repo. |
| README (team, members, college, build/run, stack, **AI tools used**) | **P0** | AI-tool disclosure is mandatory. |
| Architecture diagram | **P0** | Modular monolith → microservices-ready. |
| Customer journey diagram | **P0** | The golden path. |
| API design / docs | **P1** | REST endpoints + schemas. |
| DB schema | **P1** | Prisma schema doubles as this. |
| Key assumptions doc | **P0** | Already drafted — formalize. |
| ≤10-slide deck | **P0** | Problem → journey → demo → arch → differentiators → assumptions → impact. |
| 3–5 min demo video | **P1** | Optional but recommended — insurance against a live glitch. |
| Vitest tests on rules engine | **P1** | High-signal for the 10% Engineering bucket. |

---

## Scope guardrails

- **Finish the P0 golden path before touching any P1.** A flawless narrow demo beats a broken broad one (the brief says this explicitly).
- Every **P3** goes on the "Future Enhancements" slide — deferring on purpose is a scored signal of product judgment.
- If time is tight, cut in this order: P2 → P1 impact/analytics → P1 seat/bag → keep the golden path sacred.

*Compiled 2026-07-02. Adjust priorities together before building.*
