import { describe, expect, test } from "bun:test";
import { khoraSubscriptionLexicalText, zKhoraPost, zKhoraPostCreate } from "./khora-post";

const SIG = "dGVzdC1zaWduYXR1cmU";

describe("subscription posts", () => {
  test("valid semantic subscription create", () => {
    const v = zKhoraPostCreate.parse({
      kind: "subscription",
      body: "Looking for platform partners",
      topics: ["platform"],
      search: {
        content: { text: "platform partners beta" },
        options: { minScore: 0.3 },
      },
      authorSignature: SIG,
    });
    expect(v.kind).toBe("subscription");
    expect(v.search?.content.text).toBe("platform partners beta");
  });

  test("rejects post with search", () => {
    expect(() =>
      zKhoraPostCreate.parse({
        body: "hello",
        search: { content: { text: "x" } },
        authorSignature: SIG,
      }),
    ).toThrow();
  });

  test("rejects subscription with title", () => {
    expect(() =>
      zKhoraPostCreate.parse({
        kind: "subscription",
        title: "Beta intros",
        search: { content: { text: "x" } },
        authorSignature: SIG,
      }),
    ).toThrow();
  });

  test("filter-only subscription without title or body", () => {
    const v = zKhoraPostCreate.parse({
      kind: "subscription",
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:climate-tech"] } },
      },
      authorSignature: SIG,
    });
    expect(v.search?.options?.labels?.some).toEqual(["khora_topic:climate-tech"]);
  });

  test("khoraSubscriptionLexicalText includes search text", () => {
    const sub = zKhoraPost.parse({
      id: "sub-1",
      kind: "subscription",
      body: "Looking for partners",
      topics: ["platform"],
      authorProfileId: "p1",
      authorSignature: SIG,
      search: {
        content: { text: "platform pilots" },
      },
    });
    const text = khoraSubscriptionLexicalText(sub);
    expect(text).toContain("#platform");
    expect(text).toContain("platform pilots");
    expect(text).not.toContain("Beta intros");
  });
});
