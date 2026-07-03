import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { policies } from "../policies";
import { ragAsk } from "./rag";

// Hermetic tests: Gemini + Pinecone are mocked at the fetch boundary. What we
// verify is our logic — config gating, the fallback chain, grounding of the
// prompt, and citation mapping — not the vendors.

const HOST = "unit-test-host.pinecone.io";

type FetchPlan = {
  embed?: () => Response;
  query?: () => Response;
  generate?: () => Response;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let lastGeneratePrompt = "";

function stubFetch(plan: FetchPlan) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes(":batchEmbedContents")) {
        return (plan.embed ?? (() => json({ embeddings: [{ values: [3, 4] }] })))();
      }
      if (u.includes(`${HOST}/query`)) {
        return (plan.query ?? (() => json({ matches: [] })))();
      }
      if (u.includes(":generateContent")) {
        const body = JSON.parse(String(init?.body)) as {
          contents: { parts: { text: string }[] }[];
        };
        lastGeneratePrompt = body.contents[0].parts[0].text;
        return (plan.generate ??
          (() => json({ candidates: [{ content: { parts: [{ text: "GENERATED" }] } }] })))();
      }
      throw new Error(`Unexpected fetch in test: ${u}`);
    })
  );
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("PINECONE_API_KEY", "test-pinecone-key");
  vi.stubEnv("PINECONE_INDEX_HOST", HOST);
  lastGeneratePrompt = "";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ragAsk", () => {
  it("returns null when not configured (keyword fallback takes over)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await ragAsk("am I owed a hotel?")).toBeNull();
  });

  it("answers with citations mapped back to the canonical corpus", async () => {
    stubFetch({
      query: () => json({ matches: [{ id: "hotel", score: 0.86 }, { id: "meals", score: 0.71 }] }),
    });
    const r = await ragAsk("am I owed a hotel tonight?");
    expect(r).not.toBeNull();
    expect(r!.engine).toBe("rag");
    expect(r!.answer).toBe("GENERATED");
    expect(r!.citations[0].title).toBe("Hotel for overnight delays");
    expect(r!.citations[0].ruleRef).toMatch(/duty of care/);
  });

  it("grounds the prompt: clauses, verified context, history, question", async () => {
    stubFetch({
      query: () => json({ matches: [{ id: "hotel", score: 0.9 }] }),
    });
    await ragAsk("and what about a hotel?", {
      contextLines: ["Refund: full refund of ₹18,500 available."],
      history: [{ role: "user", text: "my flight got cancelled" }],
    });
    expect(lastGeneratePrompt).toContain("POLICY CLAUSES:");
    expect(lastGeneratePrompt).toContain("Hotel for overnight delays");
    expect(lastGeneratePrompt).toContain("PASSENGER CONTEXT");
    expect(lastGeneratePrompt).toContain("₹18,500");
    expect(lastGeneratePrompt).toContain("Passenger: my flight got cancelled");
    expect(lastGeneratePrompt).toContain("PASSENGER QUESTION: and what about a hotel?");
    expect(lastGeneratePrompt).toContain("Answer ONLY from the policy clauses");
  });

  it("degrades to the extractive clause when generation fails (still grounded)", async () => {
    stubFetch({
      query: () => json({ matches: [{ id: "hotel", score: 0.9 }] }),
      generate: () => json({ error: "boom" }, 500),
    });
    const r = await ragAsk("hotel?");
    const hotel = policies.find((p) => p.id === "hotel")!;
    expect(r!.answer).toBe(hotel.text); // exact clause — cannot hallucinate
    expect(r!.citations[0].title).toBe(hotel.title);
  });

  it("returns null when retrieval is down (keyword fallback takes over)", async () => {
    stubFetch({ query: () => json({ error: "unavailable" }, 500) });
    expect(await ragAsk("hotel?")).toBeNull();
  });

  it("returns null when nothing scores above the relevance floor", async () => {
    stubFetch({
      query: () => json({ matches: [{ id: "hotel", score: 0.12 }] }),
    });
    expect(await ragAsk("what's the meaning of life?")).toBeNull();
  });
});
