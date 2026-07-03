# Competitor & Reference Analysis — Self-Service Flight Recovery (PS 1)

> Research for the 22North Product Engineering Challenge 2026 — Challenge 1 (SkyJet Airways / Self-Service Flight Recovery).
> Purpose: understand how the market's leading self-service re-accommodation products work, so we can (a) borrow proven patterns, (b) position our MVP, and (c) defend design decisions to judges.
>
> **Note on "Drawbacks":** these are vendor marketing pages, so they do not list their own weaknesses. Drawbacks below are our *analytical inferences* (plus limitations that are explicitly stated, which are marked as such). Use them for competitive positioning, not as quoted fact.

---

## 1. Amadeus — Self Re-accommodation

**What it is:** Enterprise self-service re-accommodation module, part of Amadeus's airline disruption-management suite. Sold to airlines running the Amadeus stack.

### How it works (end-to-end)
1. A disruption occurs → the system runs an **automated eligibility check** against pre-configured airline business rules.
2. The passenger is **notified** and opens the self-service portal on their preferred channel (mobile app, website, airport kiosk).
3. They see an **automatically rebooked flight** plus **alternative options**, all filtered by business rules and interline agreements.
4. They choose to: **accept the default rebooking**, **pick an alternative**, or **request a refund** (cash or voucher via partners).
5. The transaction completes **without an agent**; the system records the choice for refund management and **no-show tracking**.

### Functionality
- Automated alternative-flight generation within business rules
- Multi-channel access (app / web / kiosk)
- Free rebooking to compliant alternatives (per airline rules)
- Refund option (cash + voucher via partners)
- Default-rebooking acceptance / acknowledgment
- **No-show tracking & management**
- Rule consistency enforced across all Amadeus disruption solutions (incl. Amadeus Passenger Recovery)
- Airline-side business-rule / policy configuration

### Drawbacks (analysis)
- **Ecosystem lock-in:** rule consistency is achieved *"across your Amadeus disruption management solutions"* → strongest value only if you're already all-in on Amadeus.
- **Enterprise-only:** requires deep PSS integration and upfront business-rule configuration — not realistic for a small/regional carrier to adopt quickly.
- **Complex cases fall out of scope:** operational edge cases are "handled separately by airline staff" — the self-service layer only covers the clean path.
- Refund is *initiated* by the passenger but still relies on back-office refund processing.

### ⭐ Standout feature
**No-show control via acknowledgment.** By requiring passengers to acknowledge the default rebooked flight, the airline gets *"a clear view of passengers' awareness of the proposed alternatives,"* letting it **better manage no-shows** — an operational benefit most self-service tools miss.

---

## 2. Sabre Mosaic — Disruption Management

**What it is:** Modular, journey-centric disruption-management platform within the Sabre Mosaic service suite. Emphasis on AI/automation + whole-trip intelligence.

### How it works (end-to-end) — a 3-layer model
1. **Detection & Intelligence:** monitors IRROPS events (delays, cancellations, aircraft swaps) and evaluates the **entire passenger journey across all legs**, not isolated segments.
2. **Automation & Recommendations:** smart re-accommodation logic auto-resolves **routine** disruptions using live inventory + business rules; **flags complex cases** (groups, special services) for agent review.
3. **Delivery:** solutions reach passengers via **both** self-service interfaces and agent-assisted support, with consistent options; results **sync back** to order/delivery systems.

### Functionality
- **Journey-aware rebooking** (full itineraries, not single legs)
- **Multi-leg connection validation** (prevents rebooking one leg but stranding on another)
- Automated re-accommodation for routine scenarios
- Self-service passenger rebooking (call-center deflection)
- **Agent intelligence dashboards** with recommended solutions for complex cases
- Inventory-aware options (current availability)
- Configurable business rules for logic + messaging
- Real-time integration with third-party PSS / order management
- Brand-consistent communications across touchpoints
- **Modular architecture** — start with one scenario/channel and expand

### Drawbacks (analysis + stated)
- **Integration-heavy:** *"Deployment time depends on your existing technology environment and integration requirements"* — no fixed timeline; implies significant integration effort despite "flexible options."
- **Complex cases not automated (stated):** groups, special services, and unique needs must be **flagged for agent review**.
- Enterprise product — requires PSS / order-management systems to connect to.

### ⭐ Standout feature
**Journey-aware rebooking:** *"See the whole journey, not just the leg."* It evaluates *"all connecting flights, passenger connections, and available inventory to provide holistic rebooking options"* — directly solving the classic failure where a passenger is rebooked on leg 1 but left stranded on leg 2.

---

## 3. Sabre — IROPS Reaccommodation (Departure Control)

**What it is:** Re-accommodation tool inside Sabre's Departure Control suite. More **operations/agent-facing** than a pure passenger app, with an optional self-service layer.

### How it works (end-to-end)
1. On a disruption, the system ingests **real-time data** (seat availability, flight status, passenger info).
2. It **notifies, prioritizes, and re-accommodates customers based on their value** to the airline (e.g., loyalty tier) to optimize satisfaction and minimize impact.
3. Ops staff can run **what-if scenario analysis** to compare recovery options and pick the best one quickly.
4. Passengers can optionally **self-manage their re-accommodation** on web or mobile during the disruption.

### Functionality
- **Value-based passenger prioritization** (notify/prioritize/reaccommodate by customer value)
- **What-if scenario analysis** for ops decision-making
- Real-time availability / flight-status / passenger data
- Reduced manual agent activity at call center + airport
- **Cost control** — lowers rebooking + compensation costs (hotels, ground transport, meal vouchers)
- Optional self-service (web / mobile) re-accommodation

### Drawbacks (analysis)
- **Ops-tool DNA:** primarily an agent/operations product; the passenger self-service is an add-on rather than the core.
- **Fairness / UX risk:** value-based prioritization means lower-tier passengers may get worse options later — defensible commercially, but a customer-experience and optics concern.
- Tied to the Sabre Departure Control ecosystem (integration + lock-in).

### ⭐ Standout feature
**Value-based prioritization + what-if scenario analysis.** It doesn't treat all passengers equally — it re-accommodates by **passenger value** and lets ops **simulate recovery scenarios** before committing. Powerful for the airline; a double-edged sword for fairness.

---

## 4. Delta — "Rebook Me" (Fly Delta app)

**What it is:** A real **consumer-facing** self-rebooking feature in Delta's app/website/kiosks. The best reference for the *passenger UX* we want to emulate.

### How it works (end-to-end, passenger POV)
Accessed via the **Fly Delta app**, **My Trips on delta.com**, or **airport kiosks**. Four steps:
1. View updated flight details → choose to **keep** the flight or **find alternates**.
2. Review **alternate flight options** → select a preferred flight.
3. **Confirm** the change.
4. Receive a **new boarding pass**.
> Passengers can *"rebook your flight as many times as you need until you're on your way."*

### Functionality
- Real-time alternate-flight suggestions
- **Same flight options that Delta agents see**
- **Automatic bag re-routing** to the selected flight
- Multi-platform (app / web / kiosk)
- **Unlimited rebooking attempts**
- New boarding-pass generation

### Drawbacks / limitations (explicitly stated by Delta)
Rebooking is **unavailable** for:
- Unaccompanied minors, group travel, or cruise bookings
- Departures from **Amsterdam-Schiphol (AMS)** or **Paris-CDG**
- Standby requests for earlier/later flights
- Flights delayed **< 30 min (domestic)** or **< 60 min (international)**
- Ineligible flights simply won't display "due to the check-in window."

*Analysis:* no proactive auto-rebooking is emphasized (passenger-initiated); refund path is less prominent than rebooking; eligibility exclusions push a meaningful minority back to agents.

### ⭐ Standout feature
**"Access to the same flight options that our agents have"** — it democratizes rebooking authority normally reserved for customer-service reps. Combined with **automatic bag re-routing** and **unlimited attempts**, it removes the two biggest reasons passengers still call.

---

## Cross-Product Comparison

| Capability | Amadeus | Sabre Mosaic | Sabre IROPS | Delta Rebook Me |
|---|:---:|:---:|:---:|:---:|
| Passenger self-service | ✅ | ✅ | ➕ (add-on) | ✅ (consumer) |
| Auto-rebook (default option) | ✅ | ✅ | ✅ | ➖ (passenger-initiated) |
| Alternatives + refund/voucher | ✅ | ✅ | ✅ | ✅ (refund secondary) |
| Journey / connection aware | ➖ | ⭐ | ✅ | ➖ |
| Value-based prioritization | ➖ | ➖ | ⭐ | ➖ |
| No-show acknowledgment tracking | ⭐ | ➖ | ➖ | ➖ |
| Agent handoff for complex cases | ✅ | ✅ | ✅ | ✅ (via exclusions) |
| Automatic bag re-routing | ➖ | ➖ | ➖ | ⭐ |
| Same options as agents | ➖ | ➖ | ➖ | ⭐ |
| Hotel/meal/transport vouchers | ✅ | ➖ | ✅ | ➖ |
| Proactive notification | ✅ | ✅ | ✅ | ➖ |

Legend: ✅ core · ➕ optional/add-on · ➖ not emphasized · ⭐ standout

---

## What this means for OUR MVP (PS 1)

**Patterns to borrow (proven, judges will recognize them):**
- Delta's clean **4-step flow**: view → choose alternate → confirm → new boarding pass.
- Amadeus's **business-rules eligibility engine** deciding who self-serves and what appears.
- Sabre Mosaic's **journey/connection awareness** → justifies our *missed-connection* scenario.
- Sabre IROPS's **hotel/meal/transport voucher** handling → our overnight-delay bonus feature.
- Everyone's **agent handoff** for complex cases → validates our automate-vs-escalate line.

**Where WE differentiate (our edge over these products):**
1. **Proactive + QR deep-link:** the alert doesn't just notify — it drops the passenger *straight into their disrupted booking* via a QR/deep link. (KLM notifies; nobody makes it this frictionless.)
2. **Explainable eligibility:** we show *why* ("eligible under Policy §4.2: weather delay >6h overnight → hotel"). These enterprise tools apply rules invisibly — we make them transparent (scores our Innovation + Explainability).
3. **Smart "best option" recommendation:** not just a list of alternatives — a highlighted, reasoned top pick.
4. **Impact tile:** "X calls deflected / Y minutes saved" — turns the Amadeus/Sabre business claim into a live, visible metric.

**One-liner for the deck:**
> "We're building a focused, *explainable* version of what Amadeus and Sabre sell to airlines — proactive, self-service disruption recovery — optimized for the passenger, not just the operations team."

---

## Sources
- [Amadeus — Self Re-accommodation](https://amadeus.com/en/airlines/products/self-re-accommodation)
- [Sabre Mosaic — Disruption Management](https://www.sabre.com/airline-mosaic/service-suite/disruption-management/)
- [Sabre — IROPS Reaccommodation (Departure Control)](https://www.sabre.com/products/suites/departure-control/irops-reaccommodation/)
- [Sabre — Self-Service Reaccommodation](https://www.sabre.com/products/suites/departure-control/self-service-reaccommodation/)
- [Delta — Rebook Me](https://www.delta.com/content/www/en_US/traveling-with-us/travel-tips-and-tools/rebook-me.html)


# Competitor & Reference Analysis — Part 2 (PS 1)

> Continuation of [competitor-analysis.md](competitor-analysis.md). Same lens: how it works · functionality · drawbacks · standout feature.
> Covers: **Delta Delayed/Canceled**, **KLM Travel Alerts**, **American IRROPS (Dynamic Reaccom)**, **VoyagerAid — The Future of Re-accommodation**.
>
> **Note on "Drawbacks":** vendor/airline pages don't list their own weaknesses. Drawbacks are our *analysis* (plus limitations explicitly stated, which are marked). Delta's exclusions and American's reviewer criticism are real and sourced.

---

## 5. Delta — Delayed or Canceled Flight (support hub)

**What it is:** Delta's full disruption support page — the policy + tooling layer *behind* "Rebook Me." Best reference for **automatic safety nets** and **eligibility rules**.

### How it works (end-to-end)
1. On a cancellation/significant delay, Delta **auto-notifies** via email, text, phone, or the Fly Delta app.
2. It **first tries to rebook you at no cost** and **auto-reroutes checked bags** when possible.
3. You can self-serve alternatives via the app / My Trips (browse, book, self-cancel, request refund/eCredit).
4. **Safety net:** if you take *no action within 24 hours*, Delta **automatically refunds** to your original payment.

### Functionality
- Multi-channel auto-notification (email / SMS / phone / app)
- Automatic rebooking attempt + automatic bag rerouting
- Self-service alternative search, booking, cancel, refund/eCredit
- "Track My Bags" + Baggage Service Office reporting
- Reimbursement forms (meal / hotel / transport)
- Accommodation requests (hotel, ground transport, meal vouchers)
- Refund-status checker + Travel Resolution Form

### Drawbacks / limitations (**stated by Delta**)
- **Weather & ATC excluded from reimbursement** — Delta won't reimburse expenses for delays caused by *"Air Traffic Control delays"* or *"Weather delays."*
- Accommodations apply **only when the disruption is "within our control"** and is a >3-hour delay / misconnect / cancellation.
- Excludes prepaid hotels/activities, alternative transport to final destination, and lost wages.
- Agent required for: unaccompanied minors, Delta Vacations, third-party bookings.
- Non-refundable tickets stay non-refundable unless cancel/significant-delay/schedule-change applies.

### ⭐ Standout feature
**Automatic 24-hour refund.** *"If none of these actions are taken within 24 hours, we'll automatically issue a refund back to your original form of payment."* Removes the burden of chasing compensation — a rare passenger-first default.

> 🎯 **Directly useful to us:** the "within our control vs. weather/ATC" distinction is *real policy logic*. It makes our eligibility engine defensible: **weather cancellation → rebook + refund YES, but hotel/meal compensation only if within airline control.**

---

## 6. KLM — Travel Alerts (proactive disruption updates)

**What it is:** KLM's proactive notification + self-service adjustment flow. The clearest real-world proof of the **"reach out first"** model that is our core differentiator.

### How it works (end-to-end)
1. If a flight is disrupted, KLM **contacts you directly** via phone call, SMS, or email.
2. It **rebooks you automatically if required**, and the message tells you the new flight *or* how to request a refund.
3. You **self-adjust** travel date, departure time, or destination by logging into **My Trip**.

### Functionality
- Proactive multi-channel alerts (call / SMS / email)
- Automatic rebooking when required
- Self-service date / time / destination adjustment via My Trip
- Self-service refund request
- Journey-stage travel updates (before + during travel)

### Drawbacks (analysis)
- Self-service is **fairly basic** — adjust date/time/destination; less of a rich, guided "pick the best alternative" flow than Delta/AA.
- **Notification-dependent:** value hinges on reaching the passenger through the right channel with current contact details.
- Refund is **request-based**, not an automatic safety net like Delta's.

### ⭐ Standout feature
**Proactive reach-out + auto-rebook.** KLM doesn't wait for the passenger — it *"will reach out to you directly to help you rebook"* and *"rebook you automatically if required."* This is exactly our proactive-alert differentiator, validated by a major carrier.

> 🎯 **Directly useful to us:** confirms our proactive model is real and desirable. Our edge over KLM = a **QR/deep-link that drops the passenger straight into a rich, guided recovery flow** (KLM just sends info + a My-Trip login).

---

## 7. American Airlines — IRROPS / Dynamic Reaccom

**What it is:** American's self-service rebooking tool (launched 2017 as "Dynamic Reaccom"). A complete, mature self-rebooking loop — and a cautionary tale on execution.

### How it works (end-to-end)
1. Accessed via mobile app, airport kiosk, or aa.com.
2. The tool **finds the best solution for each customer** and **walks them through** rebooking.
3. It **handles the ticket reissue**, **serves the new boarding pass**, and **sends a baggage reroute message** — automatically.
4. Tickets are **reissued/revalidated instantly**, enabling immediate check-in (if within the new flight's check-in window).

### Functionality
- Self-rebook PNR/Order across app / kiosk / web
- Auto "best solution" recommendation + guided flow
- **Instant ticket reissue / revalidation**
- New boarding pass generation
- Automatic baggage reroute message
- Update ticket info + check in for the new flight
- Same class of service **or lower** (business → business/coach)
- Covers AA + American Eagle (regional) flights

### Drawbacks (analysis + reviewer-sourced)
- **Coverage limited** to AA + American Eagle — no partner/interline self-rebooking.
- Rebook only in **same class or lower** (no upgrades even when that's the only reasonable option).
- **Execution criticized:** reviewers (The Points Guy: *"Needs Work"*; View from the Wing) reported it sometimes surfaces **suboptimal routings** and doesn't always match what an agent could do.
- Works only **inside the check-in window** for the new flight.

### ⭐ Standout feature
**End-to-end automation in one flow:** *finds best option → guides → reissues ticket → serves boarding pass → reroutes bags* — the complete self-service loop with no agent touch. When it works, it's the fullest self-rebooking experience of the consumer set.

> 🎯 **Directly useful to us:** this is the exact happy-path loop we should build — and its criticism ("suboptimal options") tells us **our smart, *explainable* recommendation is a genuine differentiator**, not just a nice-to-have.

---

## 8. VoyagerAid — Self-Service Re-accommodation: The Future

**What it is:** A disruption-management vendor's **vision/feature blog**. Best source for **"future enhancements"** slide material — where this space is heading.

### How it works (the vision)
A unified platform combining **prediction → prioritization → policy-driven self-service → analytics**: predict disruptions early, score/prioritize passengers, let travelers self-recover in minutes under auto-applied policy, and measure recovery KPIs.

### Functionality / capabilities
- **AI disruption prediction** — analyzes weather, maintenance reports, and operational patterns to predict a disruption *before it happens*
- **Passenger scoring** — weighs frequent-flyer status, connecting itineraries, passenger category to prioritize
- **Self-service reaccommodation** — choose next flight, adjust seats/bags, request hotel/meal vouchers when eligible
- **Policy-based vouchers/refunds** — rules auto-applied, consistent across stations & teams
- **Omnichannel notifications**
- **Analytics/KPIs** — uptake, recovery time, cost; improved NPS

### Drawbacks (analysis)
- **Aspirational vendor content** — a vision, not a spec; real results depend heavily on data quality + integration.
- **Passenger scoring** raises the same fairness/optics concern as Sabre IROPS (lower-tier flyers deprioritized).
- **AI prediction** needs rich, reliable data feeds (weather, maintenance, ops) that a smaller carrier may lack.

### ⭐ Standout idea
**Predict the disruption *before it happens*** (weather + maintenance + ops patterns) and pre-empt the recovery — moving from reactive → *predictive*. Plus **recovery-KPI analytics** to prove the business impact.

> 🎯 **Directly useful to us:** these are our **"future enhancements"** slide (worth points: judges explicitly ask for it). Our MVP is reactive+proactive; "predictive re-accommodation + recovery analytics" is the credible next step we can articulate.

---

## Cross-Product Comparison (Part 2)

| Capability | Delta (support) | KLM Alerts | AA Dynamic Reaccom | VoyagerAid (vision) |
|---|:---:|:---:|:---:|:---:|
| Proactive notification | ✅ | ⭐ | ✅ | ✅ |
| Auto-rebook attempt | ✅ | ✅ | ✅ | ✅ |
| Guided "best option" rec | ➖ | ➖ | ✅ (criticized) | ✅ (AI) |
| Instant ticket reissue + boarding pass | ✅ | ➖ | ⭐ | ✅ |
| Automatic bag rerouting | ✅ | ➖ | ✅ | ➕ |
| Automatic refund safety net | ⭐ | ➖ | ➖ | ➖ |
| Hotel/meal vouchers | ✅ | ➖ | ➖ | ✅ |
| Predictive (pre-disruption) | ➖ | ➖ | ➖ | ⭐ |
| Passenger scoring/prioritization | ➖ | ➖ | ➖ | ✅ |
| Recovery analytics / KPIs | ➕ | ➖ | ➖ | ⭐ |
| Explicit eligibility rules (control vs weather) | ⭐ | ➖ | ➖ | ✅ |

Legend: ✅ core · ➕ partial · ➖ not emphasized · ⭐ standout

---

## What this means for OUR MVP (Part 2 takeaways)

**New patterns worth borrowing:**
- **Delta's "within our control vs. weather/ATC" rule** → the backbone logic for our eligibility engine (weather = rebook/refund yes, compensation no). Makes our engine *realistic and defensible*.
- **Delta's automatic 24-hour refund safety net** → a slick, passenger-first default we can demo ("no action? we protect you automatically").
- **AA's full loop** (recommend → guide → reissue → boarding pass → bag reroute) → our exact happy path.
- **KLM's proactive reach-out** → validates our differentiator is real.

**Where WE win (sharpened by Part 2):**
1. **Explainable + smart recommendation** — AA's tool is criticized for suboptimal, opaque options. We show a *reasoned, best* pick with the *why*. This is our clearest edge.
2. **Proactive → QR deep-link → rich guided flow** — KLM notifies but dumps you into a basic My-Trip login; we drop you into a complete recovery journey.
3. **Fair + transparent eligibility** — vs. the hidden passenger-scoring of IROPS/VoyagerAid, we make rules visible.
4. **Future-vision slide** — VoyagerAid gives us a credible roadmap: *predictive* re-accommodation + recovery-KPI analytics.

**Refined deck one-liner:**
> "Amadeus/Sabre optimize for the ops team; AA's consumer tool is opaque and gets criticized for bad options. We combine KLM's proactive reach-out, AA's full self-service loop, and Delta's real eligibility rules — and add the one thing none of them have: **explainability**."

---

## Sources
- [Delta — Delayed or Canceled Flight](https://www.delta.com/us/en/change-cancel/delayed-or-canceled-flight)
- [KLM — Travel Alerts](https://www.klm.com/information/travel-alerts)
- [American Airlines — IRROPS (SalesLink)](https://saleslink.aa.com/en-US/resources/html/irregular-operations-irops.html)
- [Frequent Business Traveler — AA Launches Dynamic Reaccom](https://www.frequentbusinesstraveler.com/2017/10/american-airlines-launches-dynamic-reaccom-a-self-service-rebooking-tool/)
- [The Points Guy — My Experience With AA Dynamic Reaccommodation ("Needs Work")](https://thepointsguy.com/news/my-experience-aa-dynamic-reaccommodation/)
- [View from the Wing — American Now Lets You Re-Route Yourself](https://viewfromthewing.com/american-now-lets-re-route-flights-go-wrong/)
- [VoyagerAid — Self-Service Re-Accommodation: The Future](https://www.voyageraid.net/blog/self-service-re-accommodation-the-future-of-airline-disruption/)
- [VoyagerAid — What Is AI-Powered Self-Service Re-accommodation](https://www.voyageraid.net/blog/what-is-ai-powered-self-service-re-accommodation-in-airlines/)
