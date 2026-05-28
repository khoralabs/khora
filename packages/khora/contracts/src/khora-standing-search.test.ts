import { describe, expect, test } from "bun:test";
import { zKhoraStandingSearchRequest } from "./khora-standing-search.ts";

describe("zKhoraStandingSearchRequest", () => {
  test("accepts filter-only with labels", () => {
    const v = zKhoraStandingSearchRequest.parse({
      content: {},
      options: { labels: { some: ["khora_topic:climate-tech"] } },
    });
    expect(v.options?.labels?.some).toEqual(["khora_topic:climate-tech"]);
  });

  test("accepts semantic with text", () => {
    const v = zKhoraStandingSearchRequest.parse({
      content: { text: "platform partners" },
      options: { minScore: 0.3 },
    });
    expect(v.content.text).toBe("platform partners");
  });

  test("accepts namespace scope without content", () => {
    const v = zKhoraStandingSearchRequest.parse({
      namespace: "global/agents/p1/posts",
      content: {},
    });
    expect(v.namespace).toBe("global/agents/p1/posts");
  });
});
