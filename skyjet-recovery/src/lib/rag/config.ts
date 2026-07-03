// Configuration for the optional RAG chatbot (Gemini embeddings + Pinecone).
// Everything degrades gracefully: when keys are absent, /api/assist serves the
// deterministic keyword retrieval instead — the demo can never dead-air.

export interface RagConfig {
  geminiKey: string;
  pineconeKey: string;
  /** Pinecone index name (serverless, cosine). */
  indexName: string;
  /** Data-plane host override — skips the control-plane lookup when set. */
  indexHost?: string;
  embedModel: string;
  chatModel: string;
  /** gemini-embedding-001 supports 768/1536/3072; 768 is plenty for this corpus. */
  dimension: number;
}

export function ragConfig(): RagConfig | null {
  const geminiKey = process.env.GEMINI_API_KEY;
  const pineconeKey = process.env.PINECONE_API_KEY;
  if (!geminiKey || !pineconeKey) return null;
  return {
    geminiKey,
    pineconeKey,
    indexName: process.env.PINECONE_INDEX || "skyjet-policies",
    indexHost: process.env.PINECONE_INDEX_HOST,
    embedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
    chatModel: process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash",
    dimension: 768,
  };
}

/** Hard ceiling on any external call so the UI falls back instead of hanging. */
export const RAG_TIMEOUT_MS = 8_000;
