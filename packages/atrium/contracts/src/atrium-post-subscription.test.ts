import { describe, expect, test } from "bun:test";
import { atriumSubscriptionLexicalText, zAtriumPost, zAtriumPostCreate } from "./atrium-post.ts";

const SIG = "dGVzdC1zaWduYXR1cmU";

describe("subscription posts", () => {
  test("valid subscription create", () => {
    const v = zAtriumPostCreate.parse({
      kind: "subscription",
      title: "Beta intros",
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
      zAtriumPostCreate.parse({
        body: "hello",
        search: { content: { text: "x" } },
        authorSignature: SIG,
      }),
    ).toThrow();
  });

  test("rejects subscription without title", () => {
    expect(() =>
      zAtriumPostCreate.parse({
        kind: "subscription",
        body: "body",
        search: { content: { text: "x" } },
        authorSignature: SIG,
      }),
    ).toThrow();
  });

  test("atriumSubscriptionLexicalText includes search text", () => {
    const sub = zAtriumPost.parse({
      id: "sub-1",
      kind: "subscription",
      title: "Beta intros",
      body: "Looking for partners",
      topics: ["platform"],
      authorProfileId: "p1",
      authorSignature: SIG,
      search: {
        content: { text: "platform pilots" },
      },
    });
    const text = atriumSubscriptionLexicalText(sub);
    expect(text).toContain("Beta intros");
    expect(text).toContain("#platform");
    expect(text).toContain("platform pilots");
  });

  test("filter-only subscription with labels", () => {
    const v = zAtriumPostCreate.parse({
      kind: "subscription",
      title: "Follow climate-tech",
      body: "Notify me",
      search: {
        content: {},
        options: { labels: { some: ["atrium_topic:climate-tech"] } },
      },
      authorSignature: SIG,
    });
    expect(v.search?.options?.labels?.some).toEqual(["atrium_topic:climate-tech"]);
  });
});
