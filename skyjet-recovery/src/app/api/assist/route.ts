import { z } from "zod";
import { recommendAction, wantsAdvice } from "@/lib/advisor";
import { ask, retrieve } from "@/lib/assistant";
import { evaluateEligibility, type EligibilityResult } from "@/lib/eligibility";
import { ragAsk } from "@/lib/rag/rag";
import { evaluateEscalation, getRebookingOptions } from "@/lib/service";
import { store } from "@/lib/store";
import type { Booking, Flight } from "@/lib/types";

const schema = z.object({
  query: z.string().trim().min(1).max(300),
  ref: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().max(500),
      })
    )
    .max(8)
    .optional(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Please type a question." }, { status: 400 });
  }
  const { query, ref, lastName, history } = parsed.data;

  // Verified booking context (PNR + last name proof, same as every read) —
  // deliberately PII-free: flight + eligibility facts only, never name/PNR/email.
  let eligibility: EligibilityResult | undefined;
  let flight: Flight | undefined;
  let booking: Booking | undefined;
  if (ref && lastName) {
    booking = store.findBooking(ref, lastName);
    flight = booking ? store.getFlight(booking.flightId) : undefined;
    if (booking && flight) eligibility = evaluateEligibility(booking, flight);
  }

  // 0) Advice path: "should I refund or rebook?" — turn this passenger's own
  //    eligibility + rebooking options into a recommendation. Deterministic core;
  //    the LLM (when configured) rephrases it, otherwise it's served verbatim.
  if (booking && flight && eligibility && wantsAdvice(query)) {
    const rec = recommendAction({
      eligibility,
      options: getRebookingOptions(booking),
      flight,
      escalation: evaluateEscalation(booking),
    });
    const ragRec = await ragAsk(query, {
      contextLines: contextLines(eligibility, flight),
      history,
      recommendation: rec.answer,
    });
    if (ragRec) return Response.json({ ...ragRec, intent: "advice" });
    return Response.json({
      matched: true,
      intent: "advice",
      answer: rec.answer,
      citations: retrieve(query, 2).map((r) => ({
        title: r.policy.title,
        ruleRef: r.policy.ruleRef,
        snippet: r.policy.text,
      })),
      engine: "advisor",
    });
  }

  // 1) Semantic path: Gemini embeddings → Pinecone → grounded Gemini answer.
  //    Returns null when unconfigured/unavailable/irrelevant → keyword path.
  const rag = await ragAsk(query, {
    contextLines: eligibility && flight ? contextLines(eligibility, flight) : [],
    history,
  });
  if (rag) return Response.json(rag);

  // 2) Deterministic keyword path (always available).
  const base = ask(query);
  let answer = base.answer;
  if (base.matched && eligibility && flight) {
    const line = personalize(base.intent, eligibility, flight.flightNo);
    if (line) answer = line;
  }
  return Response.json({ ...base, answer, engine: "keyword" });
}

/** Facts handed to the model — grounded in the same rules engine as the UI. */
function contextLines(e: EligibilityResult, flight: Flight): string[] {
  const lines = [
    `Their flight ${flight.flightNo} (${flight.origin}→${flight.destination}) is ${
      flight.status === "CANCELLED" ? "cancelled" : `delayed by ${flight.delayMinutes} minutes`
    } — cause: ${e.causeLabel} (${e.causeCategory === "EXTRAORDINARY" ? "extraordinary circumstance" : "airline-controlled"}).`,
    `Refund: ${e.refund.reason}`,
    `Rebooking: ${e.rebook.reason}`,
    `Compensation: ${e.compensation.reason}`,
    `Care: ${e.dutyOfCare.reason}`,
  ];
  return lines;
}

function personalize(
  intent: string,
  e: EligibilityResult,
  flightNo: string
): string | null {
  const on = `Based on your flight ${flightNo}: `;
  switch (intent) {
    case "refund":
      return e.refund.eligible ? on + e.refund.reason : null;
    case "rebooking":
      return e.rebook.eligible ? on + e.rebook.reason : null;
    case "compensation":
    case "weather":
      return on + e.compensation.reason;
    case "meals":
    case "hotel":
      return e.dutyOfCare.meals || e.dutyOfCare.hotel
        ? on + e.dutyOfCare.reason + "."
        : null;
    default:
      return null;
  }
}
