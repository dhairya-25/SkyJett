import { RAG_TIMEOUT_MS, type RagConfig } from "./config";

// Thin REST client for the Gemini API — native fetch, no SDK dependency.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function gemini<T>(cfg: RagConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": cfg.geminiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(RAG_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** L2-normalise — required when using a reduced outputDimensionality. */
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(
  cfg: RagConfig,
  texts: string[],
  taskType: EmbedTask
): Promise<number[][]> {
  const data = await gemini<{ embeddings: { values: number[] }[] }>(
    cfg,
    `models/${cfg.embedModel}:batchEmbedContents`,
    {
      requests: texts.map((text) => ({
        model: `models/${cfg.embedModel}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: cfg.dimension,
      })),
    }
  );
  return data.embeddings.map((e) => normalize(e.values));
}

export async function generateAnswer(cfg: RagConfig, prompt: string): Promise<string> {
  const data = await gemini<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  }>(cfg, `models/${cfg.chatModel}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
      // Latency matters more than deep reasoning for policy Q&A.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty answer");
  return text;
}
