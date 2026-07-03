import { policies, type Policy, type PolicyCategory } from "./policies";

// ─────────────────────────────────────────────────────────────────────────────
// Grounded "Disruption Assistant" — lightweight retrieval over the curated
// policy corpus. No external LLM/vector DB: tokenise → synonym-expand → score →
// rerank by coverage. Answers are EXTRACTIVE (the cited clause), so the
// assistant cannot hallucinate. Pure + deterministic → unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

const STOP = new Set([
  "the", "a", "an", "is", "are", "am", "i", "my", "me", "to", "for", "of", "on",
  "in", "do", "does", "can", "could", "will", "would", "and", "or", "if", "it",
  "this", "that", "get", "how", "what", "when", "was", "were", "be", "been",
  "you", "your", "we", "with", "about", "any", "there", "here",
]);

// Query synonyms → improves recall without embeddings.
const SYNONYMS: Record<string, string[]> = {
  refund: ["money", "back", "reimburse", "reimbursement"],
  rebook: ["change", "reschedule", "another", "next", "move", "switch", "rebooking"],
  hotel: ["accommodation", "overnight", "stay", "room", "night", "sleep"],
  meal: ["food", "refreshment", "eat", "hungry", "meals"],
  compensation: ["compensate", "cash", "payout", "claim", "owed"],
  weather: ["storm", "fog", "rain", "monsoon", "cyclone"],
  baggage: ["bag", "bags", "luggage", "checked", "suitcase"],
  minor: ["child", "kid", "son", "daughter", "unaccompanied"],
  cancel: ["cancelled", "cancellation"],
  delay: ["delayed", "late"],
  connection: ["connecting", "transfer", "layover", "missed"],
  pet: ["dog", "cat", "animal"],
};

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function expand(tokens: string[]): Set<string> {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const [canon, vars] of Object.entries(SYNONYMS)) {
      if (t === canon || vars.includes(t)) {
        out.add(canon);
        vars.forEach((v) => out.add(v));
      }
    }
  }
  return out;
}

export interface Retrieved {
  policy: Policy;
  score: number;
  matched: string[];
}

export function retrieve(query: string, k = 3): Retrieved[] {
  const q = expand(tokenize(query));
  const scored = policies.map((p) => {
    const kw = new Set(p.keywords);
    const title = new Set(tokenize(p.title));
    const body = new Set(tokenize(p.text));
    const matched = new Set<string>();
    let base = 0;
    for (const t of q) {
      if (kw.has(t)) { base += 3; matched.add(t); }
      else if (title.has(t)) { base += 2; matched.add(t); }
      else if (body.has(t)) { base += 1; matched.add(t); }
    }
    // Rerank: reward breadth of distinct matched terms, not just repetition.
    const score = base + matched.size * 2;
    return { policy: p, score, matched: [...matched] };
  });
  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export interface Citation {
  title: string;
  ruleRef: string;
  snippet: string;
}

export interface AssistResult {
  matched: boolean;
  intent: PolicyCategory | "unknown";
  answer: string;
  citations: Citation[];
}

const FALLBACK =
  'I can help with rebooking, refunds, compensation, meals, hotels, baggage and more. Try asking, for example, "Am I owed a hotel tonight?" — or connect to an agent any time.';

export function ask(query: string): AssistResult {
  const hits = retrieve(query, 3);
  if (!hits.length) {
    return { matched: false, intent: "unknown", answer: FALLBACK, citations: [] };
  }
  const top = hits[0];
  return {
    matched: true,
    intent: top.policy.category,
    answer: top.policy.text,
    citations: hits.slice(0, 2).map((h) => ({
      title: h.policy.title,
      ruleRef: h.policy.ruleRef,
      snippet: h.policy.text,
    })),
  };
}
