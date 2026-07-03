# Reference & Context Analysis — Part 3 (PS 1)

> Continuation of [competitor-analysis.md](competitor-analysis.md) and [Part 2](competitor-analysis-part2.md).
> This batch is **context, not competitors**: a passenger-satisfaction study, India's **DGCA regulations** (critical for our eligibility engine), a passenger-POV article, and one adjacent product (hotel/transport recovery).
> Covers: **VoyagerAid — Satisfaction**, **HappyFares / DGCA India rules**, **Forbes 2026**, **CMAC Group (Smartlink)**.
>
> *(VoyagerAid — Future is in [Part 2 §8](competitor-analysis-part2.md).) Sources that blocked direct fetch (VoyagerAid, HappyFares) were captured via search + reputable secondary sources; DGCA figures should be verified against the current DGCA CAR before quoting as legal fact.*

---

## 9. VoyagerAid — Self-Service IROPS Tools & Passenger Satisfaction

**What it is:** A study/argument blog linking self-service during disruptions to higher passenger satisfaction. Best source for **hard stats** and **the "why it works" psychology**.

### Core argument
Self-service during IROPS raises satisfaction because **passengers feel in control — and control reduces anxiety.** Travelers re-accommodate themselves *faster than agents can*, cutting queues and call-center load.

### 📊 Key statistics (for the business slide)
- **67–72% of passengers used self-service tools during disruptions in 2025.**
- In 2025, **self-service usage during disruptions *surpassed* self-service during regular bookings.**
- **~Two-thirds of travelers are unhappy with airline communication during disruptions** (Aug 2025 studies).
- **57% want more informative updates**; only **34%** are pleased with notification frequency.

### Metrics the article says to track (great for our impact tile + KPIs slide)
Digital self-service adoption · **time-to-reaccommodate** · **call deflection / AHT** · refund-vs-voucher split · ancillary retention · **post-event NPS**.

### Drawback / gap it identifies
**Communication is still the weak link** — even with self-service, passengers feel under-informed during disruptions. That gap is an *opportunity*, not a solved problem.

### 🎯 Most useful insight for us
**"Control reduces anxiety."** Design the UX so the passenger always feels in control (clear status, visible options, one-tap actions). And since the data shows **comms is the #1 pain point**, our **proactive + transparent** notification is aimed squarely at the biggest unmet need.

---

## 10. HappyFares / DGCA — Indian Air Passenger Rights (regulatory backbone)

**What it is:** India's DGCA rules on cancellations, delays, refunds, and compensation. **This is the real-world policy our eligibility engine should encode** (SkyJet is an Asian carrier → DGCA is the realistic model).

### The rules (as commonly summarized — verify against current DGCA CAR)
**Cancellations**
- Airline must offer **either an alternate flight OR a full refund** — passenger's choice.
- If cancelled with **< 2 weeks' notice** and no acceptable alternate, **compensation** is owed *on top of* the refund.
- Refund processed within **~7–15 working days**.

**Delays (duty of care by delay length)**
- **2–4 hours:** free **meals & refreshments**.
- **4–12 hours:** **rebooking or full refund** + meals.
- **> 12 hours (overnight):** **hotel accommodation** + airport–hotel transport mandatory.

**Compensation amounts** (per DGCA CAR Section 3, Series M, Part IV — **confirm current values**): tiered by block time, commonly cited as **₹5,000 / ₹7,500 / ₹10,000** (≤1h / 1–2h / >2h block time), or booked one-way fare if lower.

**Claim window:** up to **2 years**.

### ⭐ The single most important rule for our engine
**Weather = "extraordinary circumstances."** For weather (and ATC/security/force-majeure) disruptions:
- ❌ **No monetary compensation** owed.
- ✅ But the airline **must still provide meals, hotel, and a choice of full refund OR alternate flight.**
- *"Weather doesn't excuse the airline from its duty of care — only from the financial compensation obligation."*

### 🎯 Directly useful to us
This **exactly matches Delta's "within our control vs. weather"** logic (Part 2 §5) — cross-validated across two regions. Our eligibility engine's core branch:

```
IF disruption cause == weather/ATC/force-majeure:
    → offer: rebook (free) OR full refund      ✅ always
    → duty of care: meals (>2h), hotel (overnight)  ✅
    → cash compensation                        ❌ not eligible
ELSE (airline-controllable: technical, crew, ops):
    → rebook (free) OR full refund             ✅
    → duty of care                             ✅
    → cash compensation (tiered by delay)      ✅ eligible
```
This is what makes our engine **defensible and explainable** ("Not eligible for cash compensation because the cause is weather — an extraordinary circumstance under DGCA — but you're entitled to a free rebooking, refund, and hotel").

---

## 11. Forbes — Summer 2026 Digital Survival Kit (passenger POV)

**What it is:** A traveler-perspective article on surviving 2026's disruptions. Best source for **framing the problem** and understanding passenger frustration.

### The passenger mindset (2026)
Travelers now *assume* disruption and prepare for it — *"The question is no longer whether something will go wrong. The question is whether you'll be ready when it does."* Disruptions are *"outpacing 2025 levels."*

### Tools passengers already reach for
- **Flighty** — real-time disruption/gate alerts *"often preceding official airline communications."*
- **AirHelp** — flight monitoring + **compensation eligibility checks** + claims.
- **Flightradar24** — live aircraft tracking to anticipate delays.
- TripIt (itinerary), eSIMs, AirTags (bags), AI assistants (ChatGPT/Claude/Gemini) as first-response.

### Passenger pain points (what to design against)
- **Information asymmetry** — *"passengers stand in the wrong line waiting for an agent to tell them something the airline already knows."*
- Lost-luggage uncertainty; surprise baggage fees; signal loss at airports.
- **Compensation unawareness** — passengers don't know they're eligible.

### 🎯 Most useful insight for us (two of them)
1. **Kill information asymmetry:** give the passenger the *same real-time operational picture the airline has* — ideally *before* the airport boards update. (This is *why* proactive alerts win.)
2. **Bake compensation eligibility into the disruption notification:** *"Users discovering delays should simultaneously learn whether they qualify for compensation, transforming frustration into actionable recovery."* → This is our **explainable eligibility, delivered in the alert itself.**

> ⚠️ Damning detail: third-party apps (Flighty, AirHelp) beat the airline's own comms. The airline *owns* the data but loses the passenger relationship. Our pitch: **SkyJet should be the first to tell you — not Flighty.**

---

## 12. CMAC Group — Smartlink (adjacent: hotel + transport recovery)

**What it is:** A disruption product focused on **welfare** (hotels + ground transport), not flight rebooking. Adjacent to our scope, but validates two of our design choices.

### How it works (3 phases)
1. **Initiation:** airline sends passengers **self-booking links via SMS / Email / QR / App.**
2. **Execution:** passenger picks accommodation/transport; the system **"automatically selects the best options based on airline-set rules and real-time measures — availability, airport proximity and rates."**
3. **Tracking:** passenger confirmations include tracking info; airline staff see the status of entire jobs.

### Functionality
- Hotel booking (2.5m rooms) + ground transport (7m+ vehicles)
- Self-service passenger interface + agent portal
- Real-time booking-status visibility
- **EU261 compliance tracking & record-keeping**
- **Drawdown** — block-book rooms in bulk during mass disruptions, intelligently allocated
- 24/7 multilingual contact centres
- *(No meal vouchers mentioned)*

### Drawbacks (analysis)
- **Narrow scope** — welfare only (hotels/transport); doesn't rebook flights.
- No meal-voucher handling on the page.
- Enterprise/airline-operations oriented.

### ⭐ Standout feature
**Drawdown:** proactively **block-books hotel inventory** during mass disruptions and allocates it intelligently — securing rooms *before* individual passengers scramble. Proactive inventory, not reactive booking.

### 🎯 Directly useful to us (validates 2 of our ideas)
- **QR self-booking links** — CMAC uses *"SMS/Email/QR/App"* to deep-link passengers into self-service. This **independently validates our QR deep-link entry point.**
- **Auto "best option" selection by rules + real-time availability/proximity/rates** — validates our **smart recommendation** approach for rebooking.

---

## 📊 Stat sheet for the deck (from this batch)

| Stat | Use it for |
|---|---|
| **67–72%** chose self-service during disruptions (2025) | "Passengers *want* this" → justifies the whole product |
| Self-service in disruptions **> regular booking** self-service (2025) | Disruption is the killer use-case |
| **~2/3 unhappy** with airline disruption comms | The gap we fill (proactive + transparent) |
| **57%** want more informative updates; **34%** happy with frequency | Communication is the unmet need |
| Weather = **no compensation** but **refund/rebook + duty of care** owed (DGCA) | Eligibility-engine backbone |
| Delays: meals **>2h**, hotel **overnight/>12h** (DGCA) | Concrete rule thresholds |
| Third-party apps beat airline's own alerts (Forbes) | "SkyJet should tell you first" |

---

## Consolidated "what we build differently" (across all 12 references)

1. **Proactive, first** — reach the passenger before the boards/third-party apps do (KLM, Forbes, CMAC all point here).
2. **QR deep-link** into a rich guided flow (validated by CMAC).
3. **Explainable eligibility, in the alert** — show *why* + the DGCA rule, and surface compensation eligibility immediately (Forbes + DGCA + the AA "opaque options" gap).
4. **Smart, reasoned "best option"** recommendation (validated by CMAC; the gap AA gets criticized for).
5. **Fair & transparent** — vs. hidden value-scoring (Sabre IROPS / VoyagerAid).
6. **Live impact tile** (calls deflected, minutes saved, time-to-reaccommodate) — the KPIs VoyagerAid says matter.

---

## Sources
- [VoyagerAid — Self-Service IROPS Tools & Passenger Satisfaction](https://www.voyageraid.net/blog/link-between-passenger-satisfaction-and-self-service-irops-tools/)
- [HappyFares — Flight Delay & Cancellation Compensation in India 2026 (DGCA)](https://www.happyfares.in/blog/flight-delay-compensation-india-2026/)
- [HappyFares — IRROPS Airline Rebooking Explained (2026)](https://www.happyfares.in/blog/irrops-airline-rebooking-explained-2026/)
- [DGCA — Know Your Rights (official)](https://www.dgca.gov.in/digigov-portal/)
- [PIB — Guidelines for Compensating Air Passengers (Cancellation & Delay)](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1984936)
- [AirHelp — Air Passenger Rights in India](https://www.airhelp.com/en-int/air-passenger-rights-in-india/)
- [Forbes — 2026 Digital Survival Kit for Flight Delays & Cancellations](https://www.forbes.com/sites/christopherelliott/2026/04/25/heres-your-summer-2026-digital-survival-kit-for-flight-delays-and-cancellations/)
- [CMAC Group — Disruption Management (Smartlink)](https://www.cmacgroup.com/aviation/disruption-management)
