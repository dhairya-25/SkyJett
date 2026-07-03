import type { AssistResult } from "../assistant";
import { policies } from "../policies";
import { ragConfig, type RagConfig } from "./config";
import { embedTexts, generateAnswer } from "./gemini";
import { ensureIndex, query, upsert } from "./pinecone";

// ─────────────────────────────────────────────────────────────────────────────
// RAG pipeline: Gemini embeddings → Pinecone → Gemini Flash, grounded-only.
//
// Layered so the demo can never dead-air:
//   1. semantic retrieval + generated answer   (needs GEMINI_API_KEY + PINECONE_API_KEY)
//   2. semantic retrieval + extractive answer  (if generation fails)
//   3. keyword retrieval (assistant.ts)        (if retrieval/config unavailable — caller falls back)
//
// Pinecone stores only vector ids; the canonical clause text stays in
// policies.ts, so answers can never drift from the audited corpus.
// ─────────────────────────────────────────────────────────────────────────────

/** Below this cosine score a match is noise, not policy. */
const MIN_SCORE = 0.45;
const TOP_K = 4;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Embed the whole policy corpus and upsert it (idempotent by id). */
export async function indexPolicies(cfg: RagConfig): Promise<number> {
  await ensureIndex(cfg);
  const vectors = await embedTexts(
    cfg,
    policies.map((p) => `${p.title}\n${p.text}`),
    "RETRIEVAL_DOCUMENT"
  );
  await upsert(
    cfg,
    policies.map((p, i) => ({
      id: p.id,
      values: vectors[i],
      metadata: { title: p.title, category: p.category },
    }))
  );
  return policies.length;
}

function buildPrompt(
  question: string,
  clauses: typeof policies,
  contextLines: string[],
  history: ChatTurn[],
  recommendation?: string
): string {
  const parts = recommendation
    ? [
        "You are SkyJet Airways' Disruption Assistant, helping a passenger whose flight was disrupted.",
        "The passenger is asking you to help them decide between options (e.g. refund vs. rebooking).",
        "Rules:",
        "- A SUGGESTED RECOMMENDATION is provided below, derived from this passenger's own booking. Convey that recommendation as your advice, in a warm, natural way.",
        "- Ground every fact (amounts, timings, thresholds) in the SUGGESTED RECOMMENDATION, the POLICY CLAUSES, and the PASSENGER CONTEXT. Never invent amounts, policies, or promises.",
        "- Be brief (2–4 sentences). Make clear it's the passenger's choice; you can recommend but not act on their behalf.",
        "",
        "SUGGESTED RECOMMENDATION (convey this):",
        recommendation,
        "",
        "POLICY CLAUSES:",
        ...clauses.map((c, i) => `[${i + 1}] ${c.title} (${c.ruleRef}): ${c.text}`),
      ]
    : [
        "You are SkyJet Airways' Disruption Assistant, helping a passenger whose flight was disrupted.",
        "Rules:",
        "- Answer ONLY from the policy clauses below. If they don't cover the question, say you can't help with that and offer to connect the passenger to an agent.",
        "- Be brief (2–4 sentences), warm, and concrete — use the exact amounts and thresholds from the clauses.",
        "- Never invent policies, amounts, or promises. You cannot take actions — only explain.",
        "",
        "POLICY CLAUSES:",
        ...clauses.map((c, i) => `[${i + 1}] ${c.title} (${c.ruleRef}): ${c.text}`),
      ];
  if (contextLines.length) {
    parts.push("", "PASSENGER CONTEXT (verified by the booking system):");
    parts.push(...contextLines.map((l) => `- ${l}`));
  }
  if (history.length) {
    parts.push("", "CONVERSATION SO FAR:");
    parts.push(
      ...history.map((h) => `${h.role === "user" ? "Passenger" : "Assistant"}: ${h.text}`)
    );
  }
  parts.push("", `PASSENGER QUESTION: ${question}`);
  return parts.join("\n");
}

export interface RagAskOptions {
  /** Verified, PII-free eligibility facts used to personalise the answer. */
  contextLines?: string[];
  history?: ChatTurn[];
  /** Advice mode: a deterministic recommendation for the model to convey. */
  recommendation?: string;
}

/**
 * Semantic ask. Returns null when RAG is not configured or retrieval found
 * nothing relevant — the caller then falls back to keyword retrieval.
 * Throws only never: internal failures degrade instead.
 */
export async function ragAsk(
  question: string,
  opts: RagAskOptions = {}
): Promise<(AssistResult & { engine: "rag" }) | null> {
  const cfg = ragConfig();
  if (!cfg) return null;

  let hits: typeof policies;
  try {
    const [vector] = await embedTexts(cfg, [question], "RETRIEVAL_QUERY");
    const matches = (await query(cfg, vector, TOP_K)).filter((m) => m.score >= MIN_SCORE);
    hits = matches
      .map((m) => policies.find((p) => p.id === m.id))
      .filter((p): p is (typeof policies)[number] => !!p);
  } catch {
    return null; // retrieval unavailable → keyword fallback
  }
  if (!hits.length) return null; // nothing relevant → keyword fallback

  const top = hits[0];
  let answer: string;
  try {
    answer = await generateAnswer(
      cfg,
      buildPrompt(
        question,
        hits.slice(0, 3),
        opts.contextLines ?? [],
        opts.history ?? [],
        opts.recommendation
      )
    );
  } catch {
    answer = top.text; // generation down → extractive answer, still grounded + cited
  }

  return {
    matched: true,
    intent: top.category,
    answer,
    citations: hits.slice(0, 2).map((h) => ({
      title: h.title,
      ruleRef: h.ruleRef,
      snippet: h.text,
    })),
    engine: "rag",
  };
}
