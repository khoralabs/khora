import { describe, expect, test } from "bun:test";
import { zAtriumStandingSearchRequest } from "./atrium-standing-search.ts";

describe("zAtriumStandingSearchRequest", () => {
  test("accepts filter-only with labels", () => {
    const v = zAtriumStandingSearchRequest.parse({
      content: {},
      options: { labels: { some: ["atrium_topic:climate-tech"] } },
    });
    expect(v.options?.labels?.some).toEqual(["atrium_topic:climate-tech"]);
  });

  test("accepts semantic with text", () => {
    const v = zAtriumStandingSearchRequest.parse({
      content: { text: "platform partners" },
      options: { minScore: 0.3 },
    });
    expect(v.content.text).toBe("platform partners");
  });

  test("accepts namespace scope without content", () => {
    const v = zAtriumStandingSearchRequest.parse({
      namespace: "global/agents/p1/posts",
      content: {},
    });
    expect(v.namespace).toBe("global/agents/p1/posts");
  });
});
