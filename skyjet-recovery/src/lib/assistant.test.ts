import { describe, expect, it } from "vitest";
import { ask, retrieve, tokenize } from "./assistant";

describe("tokenize", () => {
  it("lowercases, splits, and drops stopwords", () => {
    expect(tokenize("Can I get my money back?")).toEqual(["money", "back"]);
  });
});

describe("retrieve (semantic-ish, synonym-expanded)", () => {
  it("finds the hotel policy from a natural question", () => {
    const top = retrieve("where do I sleep tonight if stuck overnight")[0];
    expect(top.policy.id).toBe("hotel");
  });
  it("maps 'money back' to the refund policy via synonyms", () => {
    const top = retrieve("how do I get my money back")[0];
    expect(top.policy.category).toBe("refund");
  });
  it("maps 'am I owed anything' to compensation", () => {
    const top = retrieve("am I owed any cash compensation")[0];
    expect(top.policy.category).toBe("compensation");
  });
  it("returns nothing for an unrelated query", () => {
    expect(retrieve("what is the meaning of life")).toHaveLength(0);
  });
});

describe("ask", () => {
  it("returns a grounded answer with citations", () => {
    const r = ask("can I take a different flight");
    expect(r.matched).toBe(true);
    expect(r.intent).toBe("rebooking");
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].ruleRef).toBeTruthy();
  });
  it("falls back gracefully when nothing matches", () => {
    const r = ask("qwerty zxcvb");
    expect(r.matched).toBe(false);
    expect(r.citations).toHaveLength(0);
    expect(r.answer).toContain("rebooking");
  });
});
