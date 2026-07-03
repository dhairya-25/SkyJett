# Customer Journey — SkyJet Flight Recovery

> Deliverable: customer journey diagram. The "golden path" resolves the three questions that drive 40% of contact-centre calls — *Is my flight cancelled? Can I move to another flight? Am I owed a refund?* — in under 30 seconds.

## Before vs after

| | Today (phone) | With self-service |
|---|---|---|
| Learn about the disruption | Airport screen / rumour | **Proactive alert** with the reason, entitlements, and a QR deep-link |
| Get answers | >25-min hold | Status + explainable eligibility on one screen |
| Rebook | Agent does it | One tap on a **pre-held, recommended** option → boarding pass |
| Refund | Agent files it | One tap → reference number (auto-refund in 24h if no action) |
| Complex case | Repeat story to each agent | **Warm handoff** — agent already has full context |

## The golden path

```mermaid
flowchart TD
    A["🔔 Proactive alert (WhatsApp/SMS)<br/>'SJ 301 is cancelled due to weather —<br/>we've held a seat for you'"] -->|QR / deep-link, no typing| B
    A2["Manual entry:<br/>PNR + last name"] --> B
    B["Status card<br/>what happened + WHY (weather)"] --> C["Explainable eligibility ★<br/>rebook ✅ · refund ✅ · comp ❌ + the rule<br/>(DGCA CAR §3-M-IV cited)"]
    C --> D{Passenger<br/>chooses}
    D -->|"Accept held seat (1 tap)"| E["✅ Rebooked<br/>new boarding pass + bag re-route<br/>+ check-in"]
    D -->|Full refund instead| F["✅ Refund reference<br/>(auto-refund in 24h if no action)"]
    D -->|Free-form question| G["Grounded assistant<br/>answer + policy citation"] --> D
    D -->|"Complex case / 'I want a human'"| H["🤝 Warm agent handoff<br/>context summary attached"]
    E & F --> I["Impact tile:<br/>1 call deflected · ~25 min saved · <30s"]

    style C fill:#e0f2fe,stroke:#0284c7
    style H fill:#f3e8ff,stroke:#9333ea
```

## Journey emotions (why each beat exists)

```mermaid
journey
    title Disrupted passenger, weather cancellation
    section Disruption
      Flight cancelled: 1: Passenger
      Alert arrives first, with a reason: 3: SkyJet
    section Self-service (< 30s)
      Scan QR, land identified: 4: SkyJet
      See entitlements + why: 5: SkyJet
      Accept held rebooking: 5: SkyJet
      Boarding pass + bags rerouted: 5: SkyJet
    section Aftermath
      Impact visible, no call made: 5: SkyJet
```

## Automate vs escalate (the product decision)

| Case | Route | Why |
|---|---|---|
| Cancellation / delay ≥ 3h, standard booking | **Automate** | High-frequency, low-risk — rules engine decides, passenger confirms |
| Refund/compensation eligibility | **Automate** | Deterministic DGCA rules; explanation builds trust |
| Unaccompanied minor, medical, pets | **Escalate** | Duty-of-care risk — a human must own it |
| Groups > 4 / partner-airline tickets | **Escalate** | Multi-party / out-of-system constraints |
| No valid rebooking within policy | **Escalate** | Don't dead-end the passenger |
| Passenger asks for a human | **Escalate** | Always available, on every screen |

Every escalation is a **warm handoff**: case reference + flight context + what the passenger already tried, so they never repeat themselves.

## Demo scenarios (seeded)

| # | PNR / name | Scenario | What it demonstrates |
|---|---|---|---|
| 1 | `SJ7QK2` / Sharma | DEL→BKK cancelled, **weather** | Golden path; comp **not** owed — and the why |
| 2 | `SJ4RM9` / Nair | BOM→SIN cancelled, **technical** | Same flow, **+ ₹10,000 comp** (airline-controlled) |
| 3 | `SJ8XP5` / Mehta | BLR→DXB **5h delay**, weather | Long-delay threshold, meals entitlement |
| 4 | `SJ2MN1` / Gupta | Unaccompanied **minor** on cancelled flight | Escalation triggers + warm handoff |
