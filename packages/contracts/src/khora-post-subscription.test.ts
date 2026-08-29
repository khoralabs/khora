import { describe, expect, test } from "bun:test";
import {
  khoraPostIndexableFeatures,
  khoraPostIndexableLexicalText,
  zKhoraPost,
  zKhoraPostCreate,
} from "./khora-post";

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
});

describe("khoraPostIndexableFeatures", () => {
  test("filter-only topic subscription returns no features", () => {
    const sub = zKhoraPost.parse({
      id: "sub-filter",
      kind: "subscription",
      topics: ["climate-tech"],
      authorProfileId: "p1",
      authorSignature: SIG,
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:climate-tech"] } },
      },
    });
    expect(khoraPostIndexableFeatures(sub)).toEqual([]);
    expect(khoraPostIndexableLexicalText(sub)).toBe("");
  });

  test("body only", () => {
    const sub = zKhoraPost.parse({
      id: "sub-body",
      kind: "subscription",
      body: "Looking for partners",
      authorProfileId: "p1",
      authorSignature: SIG,
      search: {
        content: {},
        options: { labels: { some: ["khora_topic:platform"] } },
      },
    });
    expect(khoraPostIndexableFeatures(sub)).toEqual([
      { key: "body", text: "Looking for partners" },
    ]);
  });

  test("query only", () => {
    const sub = zKhoraPost.parse({
      id: "sub-query",
      kind: "subscription",
      authorProfileId: "p1",
      authorSignature: SIG,
      search: { content: { text: "platform pilots" } },
    });
    expect(khoraPostIndexableFeatures(sub)).toEqual([{ key: "query", text: "platform pilots" }]);
  });

  test("body and query", () => {
    const sub = zKhoraPost.parse({
      id: "sub-both",
      kind: "subscription",
      body: "Looking for partners",
      authorProfileId: "p1",
      authorSignature: SIG,
      search: { content: { text: "platform pilots" } },
    });
    expect(khoraPostIndexableFeatures(sub)).toEqual([
      { key: "body", text: "Looking for partners" },
      { key: "query", text: "platform pilots" },
    ]);
    expect(khoraPostIndexableLexicalText(sub)).toBe("Looking for partners\n\nplatform pilots");
  });

  test("regular post indexes body only, not title or topics", () => {
    const post = zKhoraPost.parse({
      id: "post-1",
      kind: "post",
      title: "Headline",
      topics: ["platform"],
      body: "Hello world",
      authorProfileId: "p1",
      authorSignature: SIG,
    });
    expect(khoraPostIndexableFeatures(post)).toEqual([{ key: "body", text: "Hello world" }]);
    expect(khoraPostIndexableLexicalText(post)).toBe("Hello world");
  });
});
