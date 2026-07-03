# Customer Journey — SkyJet Self-Service Flight Recovery

> A passenger's-eye walkthrough of the app: what a customer sees, taps, and gets, from the moment their flight is disrupted to the moment they're on their way again.
>
> Companion to [features.md](features.md) (what we build vs. defer). This document is the **customer walk** — every screen and every branch, in plain language.

---

## Design principles (why it feels the way it does)

- **KISS — Keep It Simple.** One decision per screen. The passenger is already stressed; the app never adds to it. No jargon, no dead ends, no forms longer than they need to be.
- **It's a website, not an app.** The passenger does **not** download anything. They tap a link (or scan a QR) and it opens instantly in their phone's browser. Nothing to install, nothing to log into, no app-store friction while they're standing at a gate.
- **Mobile-first by default.** The layout is built for a phone held in one hand — a single narrow column, big tap targets, the most urgent information at the top. This is how ~everyone will actually use it during a disruption.
- **Desktop view on demand.** A toggle at the top switches between **📱 Mobile View** and **💻 Desktop View**. Desktop widens the layout into a two-column board (details on the left, assistant + actions on the right) for anyone on a laptop or presenting on a big screen.
- **Boarding-pass look and feel.** The visual language mirrors a real boarding pass — the same card shape, the origin → destination layout, the sky-blue gradient header, a scannable QR. It feels familiar and trustworthy because it looks like the document the passenger already knows.
- **Explainability everywhere.** Every decision the app makes ("no cash compensation", "you're owed a hotel", "this is the best flight") is shown *with its reason and the rule behind it*. The passenger is never told "no" without being told "why".

---

## The journey at a glance

```
                    ┌─────────────────────────────────────────────┐
  Proactive alert   │   1. ENTRY                                   │
  (WhatsApp + QR) ──▶│   • Scan QR / tap link  → straight in       │
        or          │   • Or type PNR + last name                 │
  passenger opens   │   • Or tap a demo scenario                  │
  the website       └───────────────────┬─────────────────────────┘
                                         ▼
                    ┌─────────────────────────────────────────────┐
                    │   2. FLIGHT DETAILS                          │
                    │   • How late am I? (delay / cancelled)       │
                    │   • Route, timeline, the REASON (why)        │
                    │   • What I'm entitled to (explained)         │
                    └───────────────────┬─────────────────────────┘
                                         ▼
              ┌──────────── needs a specialist? ───────────┐
              │ yes                                    no   │
              ▼                                             ▼
   ┌────────────────────┐          ┌──────────────────────────────────┐
   │  AGENT HANDOFF     │          │   3. CHOOSE WHAT TO DO            │
   │  (warm, w/ context)│          │   ○ Rebook   ○ Refund   ○ Wait   │
   └────────────────────┘          └───┬──────────┬───────────┬───────┘
                                        ▼          ▼           ▼
                                    Rebook      Refund       Wait
                                   (new pass)  (reference)  (keep seat)
```

At every step, two things are always within reach: **"Talk to an agent instead"** and the **"Ask about your options"** assistant.

---

## Step 1 — The passenger arrives

There are three ways in, and all of them land in the same place: their disrupted booking, already identified.

### A. The proactive alert (the intended happy path)
SkyJet reaches out *first* — before the passenger even thinks to call. They get a **WhatsApp message**:

> *"Your flight SJ 301 (DEL → BKK) is cancelled due to weather. We have held a seat for you on the next flight. Recover in under 30 seconds — no need to call."*

The message carries a **QR code** and an **"Open self-service"** button. The passenger either **scans the QR** with their phone or **taps the button** — and the website opens straight into their booking. **No PNR typing, no login screen.** (The QR/link encodes their booking reference securely, so the app knows who they are the moment it opens.)

### B. Manual lookup (for anyone who comes on their own)
If a passenger opens the website directly, they see a simple two-field card:
- **Booking reference (PNR)** — e.g. `SJ7QK2`
- **Last name** — e.g. `Sharma`

One tap on **"Find my booking"** and they're in. Wrong details get a friendly error, not a wall.

### C. Demo scenarios (for judges / testing)
A row of one-tap scenario buttons (weather cancellation, technical cancellation, 5-hour delay, unaccompanied minor, senior with priority seat, standard waitlisted) lets anyone jump straight into a realistic case.

**Security note the passenger doesn't see:** the PNR + last name that got them in are re-checked on the server for *every* action afterwards (rebook, refund, handoff), so no one can act on a booking that isn't theirs.

---

## Step 2 — "What happened to my flight?"

The first thing the passenger sees after they're identified answers the only question on their mind: **how late am I?**

1. **Delay/cancellation banner** — a big, colour-coded headline at the very top:
   - **Cancelled** → red *"Flight cancelled"*.
   - **Delayed** → amber *"Delayed by 5h 20m"*, with the **new estimated departure time** vs. the original.
   It greets them by first name.

2. **Status card** — the boarding-pass-style detail card:
   - **Origin → destination**, flight number, times, and a **flight-progress timeline**.
   - A **live ops strip** showing the operational picture (inbound aircraft, gate, ETA) — the same information the airline has, so there's no information gap.
   - **The reason, stated plainly:** *"Reason: Weather (extraordinary circumstance)"* or *"Technical / crew"*. This matters — the cause is what decides what they're owed, so it's never hidden.
   - Their **PNR, name, and loyalty tier** as small badges.
   - An empathetic line: *"We are sorry for the disruption, Priya. Here is how we can get you moving right away."*

3. **"What you are entitled to"** — the eligibility panel, always visible. In four clear rows, each marked *Included* or *Not applicable* **with a reason**:
   - ✅/❌ **Free rebooking**
   - ✅/❌ **Full refund** (with the amount)
   - ✅/❌ **Cash compensation** (with the amount, when owed)
   - ✅/❌ **Care during the wait** (meals / hotel)

   And crucially, the **basis for the decision** is spelled out, e.g.:
   > *"Not eligible for cash compensation because the cause is weather — an extraordinary circumstance under DGCA rules. But you are entitled to a free rebooking, a full refund, and hotel accommodation."*

   If a refund is on the table, there's a reassuring safety net: *"Prefer to decide later? If you take no action, we will automatically refund you within 24 hours."*

4. **A goodwill card** (when the airline has extended one) — *"With our apologies"* — listing any complimentary meal, hotel, or discount on the next flight, clearly marked as a gesture *on top of* the statutory entitlements.

At this point the app splits into two roads.

---

## The fork: automate, or hand to a human

### If the booking needs a specialist → Agent handoff
Some situations are deliberately **not** automated — they need a human. The app detects these and, instead of the three options, shows a calm card: *"A specialist should handle this,"* listing the reasons (e.g. **unaccompanied minor**, group/multi-city, partner-airline or award ticket, no valid rebooking in policy, disputed/OTA booking).

One tap on **"Connect me to an agent"** performs a **warm handoff**: the passenger gets a **case reference** and sees exactly **what context was handed to the agent** — PNR, the disruption, what they'd already tried. The promise, shown on screen: *"The agent already has everything above — you will not need to repeat yourself."*

> This option is also **always available manually** — a *"Talk to an agent instead"* link sits under the three choices on every booking, for anyone who simply prefers a human.

### Otherwise → the passenger chooses
Under the heading **"What would you like to do?"**, up to three big, tappable options appear. Which ones show depend on the situation:

| Option | Shown when | One-line promise |
|---|---|---|
| 🔄 **Rebook the flight** | always | *Move to the next available SkyJet flight — free of charge.* |
| 💰 **Refund & cancel** | when a refund is due | *Cancel and get a full refund of ₹X.* |
| ⏳ **Wait for this flight** | only for delays (not cancellations) | *Keep your seat and travel on the delayed flight.* |

Tapping one expands it inline — no page reload, no losing your place.

---

## Step 3a — If the passenger chooses **REBOOK**

The goal: a new boarding pass in a few taps, with a smart recommendation so they don't have to weigh every option themselves.

1. **Choose your new flight.**
   - The **★ Recommended — best option** is highlighted at the top, with a **plain-English reason** (e.g. *"Same day, 3 hours later, direct — the soonest we can get you there"*), how many **seats are left**, and the **fare difference** (which is **₹0 / no fare difference** when the disruption was the airline's fault).
   - Below it, **"Or choose a different flight"** lists the other alternatives, each with its own reason, timing, seats, and fare tag.
   - If a flight's seats are being **held for higher-priority passengers** (see below), it shows a *waitlist note* instead of a seat button, gently steering the passenger to a flight with more room.

2. **Pick your seat** — a real, tappable **aircraft seat map**.
   - A **priority banner** explains the passenger's standing — **Senior**, **Business**, **Child/Infant**, or **Standard** — and what it means for them (e.g. a senior citizen is 1st priority and gets first pick of the good seats).
   - The map shows the whole cabin: **available**, **priority**, **your seat**, and **occupied**. Priority seats near the front are **reserved (locked)** for higher-priority passengers when a standard passenger still has other free seats to choose from — fair, and visibly so.
   - The app **pre-selects** the best seat the passenger's priority entitles them to, so they can just confirm.
   - A summary shows the chosen seat (window/aisle/middle) and any fare difference.

3. **Confirm.** The button says exactly what will happen — *"Confirm seat 14A & get boarding pass"*, or *"Pay ₹X more & confirm seat"* / *"Confirm · ₹X refund"* if fares differ. Tapping it is **safe to double-tap** — the system guarantees a stray second tap can't double-book (it uses an idempotency key + a version check behind the scenes).

4. **You're rebooked.** The success screen delivers:
   - A green *"You are rebooked — your new boarding pass is ready, no call, no queue."*
   - The **new boarding pass** in full boarding-pass styling: route, times, gate, seat, boarding time, sequence, PNR, and a **scannable QR to manage it**.
   - A note that **checked baggage is being re-routed automatically** to the new flight.
   - Any fare-difference settlement, stated clearly.
   - The goodwill card again, if applicable.
   - A **"Check in for this flight"** button — one tap to check in and *"proceed to gate."*

---

## Step 3b — If the passenger chooses **REFUND**

Shown only when a refund is actually due (so the passenger is never offered something they can't have).

1. **Confirm refund & cancel.** A plain card: *"We will cancel SJ 301 and refund the full fare to your original payment method. This cannot be undone."* The **exact refund amount** is shown. One deliberate confirm tap.

2. **Refund initiated.** The passenger gets:
   - A green *"Refund initiated — you will see it on your original payment method soon."*
   - A **refund reference number** (the app issues a reference, not a live payment — mirrors how a real refund is tracked) and the **amount**.
   - A note that a **confirmation has been emailed** to them.
   - Any goodwill gesture, still honoured.

---

## Step 3c — If the passenger chooses **WAIT** (delays only)

For a delay, some passengers just want to keep their existing flight. This option makes that a first-class, reassuring choice rather than "do nothing".

- *"You are keeping this flight"* — confirmation that **no change is needed**; they'll travel on the same flight.
- The **new estimated departure** vs. the **originally scheduled** time, side by side.
- Their **care entitlements while they wait** (meals if the delay is long enough, a hotel if it's overnight) — surfaced right here so they know to claim them.
- A promise: *"We will notify you on WhatsApp if the departure time changes again."*
- The escape hatch: *"You can still rebook or request a refund any time before departure."* — waiting is never a trap.

While the passenger is on this screen (or still deciding), the app **quietly polls the flight in the background** — so if ops pushes a further delay, a boarding call, or a cancellation, it updates on screen **without a refresh**.

---

## Always available: "Ask about your options" (the assistant)

Alongside the actions sits a small chat panel, **"Ask about your options."** The passenger can ask free-form questions in their own words:
- *"Should I refund or rebook?"*
- *"Am I owed a hotel tonight?"*
- *"Can I get compensation?"*
- *"What about my baggage?"*

Every answer is **grounded in SkyJet's actual policy** and **cites the exact clause** it came from (e.g. *"§4.2: weather delay over 6h overnight → hotel"*). The assistant **explains and points**, but never acts on its own — the passenger (and the rules engine) stay in control of any real decision. If it can't answer, it hands off to an agent rather than guessing.

---

## What we intentionally kept out (so the experience stays simple)

Staying true to KISS, the passenger is **not** asked to do things that would add friction or that a self-service tool shouldn't own on its own: real payment entry, account creation / SSO, partner-airline or award rebooking, group/multi-city juggling, or special-assistance cases. Each of those is **routed to a human with full context** instead — the app knows the limit of what it should automate, and hands off gracefully at exactly that line.

---

## The whole thing, in one breath

> A stressed passenger gets a WhatsApp saying their flight is cancelled, taps the link, and — without downloading anything or waiting on hold — sees their flight, understands *why* it happened and *what they're owed*, and in a few taps either walks away with a new boarding pass, a refund reference, or a clear plan to wait. If it's ever too complex, a human takes over already knowing everything. That's the entire product: **calm, clear, self-service recovery — in under 30 seconds, on the phone already in their hand.**

---

*Compiled 2026-07-03 · 22North Product Engineering Challenge 2026 · Challenge 1. Data is simulated.*
