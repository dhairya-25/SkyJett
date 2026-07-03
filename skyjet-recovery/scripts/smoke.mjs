// End-to-end smoke test of the recovery API. Requires the server running
// (npm run dev / npm start). Usage: node scripts/smoke.mjs
const BASE = process.env.BASE || "http://localhost:3000";

const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, replay: r.headers.get("idempotent-replay"), body: await r.json().catch(() => ({})) };
};
const get = async (p) => (await fetch(BASE + p)).json();

let pass = 0, fail = 0;
const ok = (c, m) => {
  if (c) { pass++; console.log("  ✓", m); }
  else { fail++; console.log("  ✗ FAIL:", m); }
};

await post("/api/reset");

console.log("1. Weather cancellation lookup (SJ7QK2 / Sharma)");
let r = await post("/api/lookup", { pnr: "SJ7QK2", lastName: "Sharma" });
ok(r.status === 200, "200 OK");
ok(r.body.flight.status === "CANCELLED" && r.body.flight.cause === "WEATHER", "flight cancelled / weather");
ok(r.body.eligibility.refund.eligible && r.body.eligibility.refund.amount === 18500, "refund eligible ₹18,500");
ok(r.body.eligibility.compensation.eligible === false, "NO cash compensation (weather = extraordinary)");
ok(r.body.eligibility.dutyOfCare.meals === true, "meals included");
const rec = r.body.options.find((o) => o.recommended);
ok(rec && r.body.options.length >= 2, "options w/ recommended: " + r.body.options.map((o) => o.flight.id + (o.recommended ? "*" : "")).join(","));
ok(!r.body.options.some((o) => o.flight.id === "SJ305"), "full flight SJ305 filtered out");

console.log("2. Writes are authenticated (PNR alone is not enough)");
r = await post("/api/rebook", { ref: "SJ7QK2", flightId: rec.flight.id, idempotencyKey: "kx" });
ok(r.status === 400, "rebook without last name -> 400");
r = await post("/api/rebook", { ref: "SJ7QK2", lastName: "Wrong", flightId: rec.flight.id, idempotencyKey: "kx" });
ok(r.status === 404, "rebook with wrong last name -> 404");

console.log("3. Rebook to recommended (" + rec.flight.id + ")");
r = await post("/api/rebook", { ref: "SJ7QK2", lastName: "Sharma", flightId: rec.flight.id, idempotencyKey: "k1" });
ok(r.status === 201, "201 Created");
ok(r.body.booking.status === "REBOOKED", "status REBOOKED");
ok(!!r.body.boardingPass?.flightNo, "boarding pass issued: " + r.body.boardingPass?.flightNo + " seat " + r.body.boardingPass?.seat);

console.log("4. Idempotency replay (same key k1)");
r = await post("/api/rebook", { ref: "SJ7QK2", lastName: "Sharma", flightId: rec.flight.id, idempotencyKey: "k1" });
ok(r.status === 200 && r.replay === "true", "replayed (200 + idempotent-replay header)");

console.log("5. No double-dip: refund after rebook is blocked");
r = await post("/api/refund", { ref: "SJ7QK2", lastName: "Sharma", idempotencyKey: "r1" });
ok(r.status === 409, "409 Conflict: " + r.body.error);

console.log("6. Technical cancellation (SJ4RM9 / Nair)");
r = await post("/api/lookup", { pnr: "SJ4RM9", lastName: "Nair" });
ok(r.body.eligibility.compensation.eligible === true, "compensation eligible (airline-controlled)");
ok(r.body.eligibility.compensation.amount === 10000, "₹10,000 (block time > 2h)");
r = await post("/api/refund", { ref: "SJ4RM9", lastName: "Nair", idempotencyKey: "r2" });
ok(r.status === 201 && r.body.refund?.reference, "refund initiated: " + r.body.refund?.reference);
r = await post("/api/rebook", { ref: "SJ4RM9", lastName: "Nair", flightId: "SJ417", idempotencyKey: "k2" });
ok(r.status === 409, "rebook after refund blocked (409)");

console.log("7. Long weather delay (SJ8XP5 / Mehta)");
r = await post("/api/lookup", { pnr: "SJ8XP5", lastName: "Mehta" });
ok(r.body.eligibility.disruption === "LONG_DELAY", "classified LONG_DELAY");
ok(r.body.eligibility.compensation.eligible === false, "no compensation (weather)");

console.log("8. Unaccompanied minor -> escalation (SJ2MN1 / Gupta)");
r = await post("/api/lookup", { pnr: "SJ2MN1", lastName: "Gupta" });
ok(r.body.escalation.escalate === true, "escalate=true: " + r.body.escalation.reasons.join("; "));
r = await post("/api/escalate", { ref: "SJ2MN1", lastName: "Gupta" });
ok((r.body.handoff?.context?.length || 0) >= 2, "warm handoff w/ context (" + r.body.handoff?.context?.length + " lines)");
const caseRef = r.body.handoff?.reference;
r = await post("/api/escalate", { ref: "SJ2MN1", lastName: "Gupta" });
ok(r.body.handoff?.reference === caseRef, "second escalate joins the same case (" + caseRef + ")");

console.log("9. Negative: wrong last name on lookup");
r = await post("/api/lookup", { pnr: "SJ7QK2", lastName: "Wrong" });
ok(r.status === 404, "404 not found");

console.log("\nstats:", JSON.stringify(await get("/api/stats")));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
