# SkyJet Flight Recovery — Test Credentials & Sample Data

> Everything a reviewer needs to test the app end-to-end. All data is **simulated seed data** — no real passengers, no real payments. Sign-in is **PNR + last name** (both must match).

---

## 1. Run it locally

```bash
cd skyjet-recovery
npm install
npm run dev          # → http://localhost:3000
```

- No environment variables are required. The app ships with an in-memory seeded store, so it works out-of-the-box.
- The RAG chatbot (Disruption Assistant) is optional and falls back to deterministic keyword retrieval when no keys are set. To light up the semantic path, copy `.env.example` → `.env.local` and add `GEMINI_API_KEY` + `PINECONE_API_KEY`.
- Run the tests with `npm test`.

**Reset the demo** at any time (restores all seed state) — the store also resets on a cold start:

```bash
curl -X POST http://localhost:3000/api/reset
```

---

## 2. Demo login credentials

Log in on the home page (`/`) with a **PNR** and the passenger's **last name**. Each row is a self-contained test scenario.

| # | PNR | Last name | Passenger | Route | Disruption | What you should see |
|---|-----|-----------|-----------|-------|-----------|---------------------|
| 1 | **SJ7QK2** | **Sharma** | Aarav Sharma (Standard, senior) | DEL → BKK | **Cancelled · Weather** | Rebook **or** full refund + meals & hotel. **No cash compensation** (weather = extraordinary). *The primary demo booking.* |
| 2 | **SJ4RM9** | **Nair** | Priya Nair (Silver, +infant) | BOM → SIN | **Cancelled · Technical** | Rebook/refund **+ cash compensation** (airline-controlled cause). |
| 3 | **SJ8XP5** | **Mehta** | Rohan Mehta (Gold, Business) | BLR → DXB | **Delayed 300 min · Weather** | Long-delay: rebook/refund **+ meals**, no compensation. |
| 4 | **SJ2MN1** | **Gupta** | Ishaan Gupta (Standard) | DEL → BKK | **Cancelled · Weather** | **Unaccompanied minor → must escalate** to a human agent (warm handoff). |
| 5 | **SJ7SR1** | **Reddy** | Kavya Reddy (Silver, senior) | DEL → DXB | **Cancelled · Technical** | Priority **rank 1** — gets a scarce same-day seat. |
| 6 | **SJ7BZ2** | **Singh** | Arjun Singh (Gold, Business) | DEL → DXB | **Cancelled · Technical** | Priority **rank 2** — gets the other scarce same-day seat. |
| 7 | **SJ7IN3** | **Iyer** | Meera Iyer (Standard, +infant) | DEL → DXB | **Cancelled · Technical** | Priority **rank 3** — waitlisted onto the roomy next-day flight. |
| 8 | **SJ7ST4** | **Kapoor** | Dev Kapoor (Standard) | DEL → DXB | **Cancelled · Technical** | Priority **rank 4** — waitlisted onto the next-day flight. |

> **Fastest path for a reviewer:** start with **SJ7QK2 / Sharma** (weather refund story), then **SJ4RM9 / Nair** (compensation story), then **SJ2MN1 / Gupta** (escalation story). Bookings 5–8 together demonstrate priority-based seat allocation when seats are scarce.

---

## 3. What each scenario exercises

- **Scenario 1 (DEL→BKK, weather cancel)** — the golden path: identified status card → scored rebooking options → boarding pass, *or* an explainable refund. Alternative flights include a pricier one (pay the difference), a cheaper one (refunded the difference), a full flight (filtered out), and a next-day option.
- **Scenario 2 (BOM→SIN, technical cancel)** — same flow but the cause is airline-controlled, so **cash compensation** applies. Shows the cause-driven eligibility engine.
- **Scenario 3 (BLR→DXB, 300-min weather delay)** — a long *delay* (not a cancel) crossing the meals threshold; Business cabin.
- **Scenario 4 (DEL→DXB, technical cancel, scarce seats)** — four passengers (5–8) compete for **2** same-day seats. Priority order: **senior → business → infant → standard**. The top two are seated same-day; the rest are waitlisted to the roomy next-day flight.

---

## 4. Ops / admin panel

The flight-status ops console (`/admin`, and `POST /api/admin/flight`) is guarded by a bearer token.

- **Local/dev token (works out-of-the-box):** `skyjet-ops-2026`
- In **production** the panel stays disabled (503) until you set `ADMIN_TOKEN` in the deployment env.

```bash
curl http://localhost:3000/api/admin/flights \
  -H "Authorization: Bearer skyjet-ops-2026"
```

---

## 5. API quick-reference (for scripted testing)

All mutating endpoints are `POST`, JSON in/out. Write endpoints take a client-generated `idempotencyKey`.

```bash
# Identify & load a booking
curl -X POST http://localhost:3000/api/lookup \
  -H 'content-type: application/json' \
  -d '{"pnr":"SJ7QK2","lastName":"Sharma"}'

# Request a refund (idempotent)
curl -X POST http://localhost:3000/api/refund \
  -H 'content-type: application/json' \
  -d '{"ref":"SJ7QK2","idempotencyKey":"'"$(uuidgen)"'"}'

# Escalate to a human agent
curl -X POST http://localhost:3000/api/escalate \
  -H 'content-type: application/json' \
  -d '{"ref":"SJ2MN1"}'

# Impact stats tile
curl http://localhost:3000/api/stats
```

Full endpoint contracts live in [api.md](api.md).

---

*All data here is fictional seed data (`src/lib/seed.ts`). Refunds and compensation issue a reference number only — there is no payment integration. Reset anytime with `POST /api/reset`.*
