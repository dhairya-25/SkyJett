import { ragConfig } from "@/lib/rag/config";
import { indexPolicies } from "@/lib/rag/rag";

// One-shot (re)indexing of the policy corpus into Pinecone: embeds every
// clause with Gemini and upserts by stable id, so re-running is idempotent.
// Ops story: update policies.ts → hit this endpoint → the assistant answers
// from the new policy, no redeploy of a model or prompt required.

export async function POST(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Reindexing is disabled (ADMIN_TOKEN not set)." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cfg = ragConfig();
  if (!cfg) {
    return Response.json(
      { error: "RAG is not configured (GEMINI_API_KEY / PINECONE_API_KEY missing)." },
      { status: 503 }
    );
  }

  try {
    const indexed = await indexPolicies(cfg);
    return Response.json({ ok: true, indexed, index: cfg.indexName });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Indexing failed." },
      { status: 502 }
    );
  }
}
