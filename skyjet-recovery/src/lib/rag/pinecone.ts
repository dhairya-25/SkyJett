import { RAG_TIMEOUT_MS, type RagConfig } from "./config";

// Thin REST client for Pinecone (serverless) — native fetch, no SDK dependency.

const CONTROL = "https://api.pinecone.io";
const API_VERSION = "2025-01";

function headers(cfg: RagConfig): Record<string, string> {
  return {
    "content-type": "application/json",
    "Api-Key": cfg.pineconeKey,
    "X-Pinecone-API-Version": API_VERSION,
  };
}

// The data-plane host is stable per index — resolve once per warm process.
let cachedHost: string | null = null;

export async function indexHost(cfg: RagConfig): Promise<string> {
  if (cfg.indexHost) return cfg.indexHost;
  if (cachedHost) return cachedHost;
  const res = await fetch(`${CONTROL}/indexes/${cfg.indexName}`, {
    headers: headers(cfg),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Pinecone describe-index failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { host: string };
  cachedHost = data.host;
  return cachedHost;
}

/** Create the serverless index if it doesn't exist yet (idempotent). */
export async function ensureIndex(cfg: RagConfig): Promise<void> {
  const res = await fetch(`${CONTROL}/indexes`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      name: cfg.indexName,
      dimension: cfg.dimension,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: process.env.PINECONE_CLOUD || "aws",
          region: process.env.PINECONE_REGION || "us-east-1",
        },
      },
    }),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });
  // 201 created · 409 already exists — both fine.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Pinecone create-index failed: ${res.status} ${await res.text()}`);
  }
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: Record<string, string>;
}

export async function upsert(cfg: RagConfig, vectors: VectorRecord[]): Promise<void> {
  const host = await indexHost(cfg);
  const res = await fetch(`https://${host}/vectors/upsert`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ vectors }),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Pinecone upsert failed: ${res.status} ${await res.text()}`);
  }
}

export interface QueryMatch {
  id: string;
  score: number;
}

export async function query(
  cfg: RagConfig,
  vector: number[],
  topK: number
): Promise<QueryMatch[]> {
  const host = await indexHost(cfg);
  const res = await fetch(`https://${host}/query`, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ vector, topK, includeMetadata: false }),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Pinecone query failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { matches?: { id: string; score: number }[] };
  return data.matches ?? [];
}
