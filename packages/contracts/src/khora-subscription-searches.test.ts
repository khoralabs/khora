import { describe, expect, test } from "bun:test";
import {
  authorSubscriptionSearch,
  authorTopicSubscriptionSearch,
  buildSubscriptionSearch,
  topicSubscriptionSearch,
} from "./khora-subscription-searches";

describe("buildSubscriptionSearch", () => {
  test("topic only", () => {
    expect(buildSubscriptionSearch({ topicSlug: "rust" })).toEqual(topicSubscriptionSearch("rust"));
  });

  test("author only", () => {
    expect(buildSubscriptionSearch({ authorProfileId: "p1", namespaceRoot: "global" })).toEqual(
      authorSubscriptionSearch("p1", "global"),
    );
  });

  test("author and topic", () => {
    expect(
      buildSubscriptionSearch({
        authorProfileId: "p1",
        topicSlug: "rust",
        namespaceRoot: "global",
      }),
    ).toEqual(authorTopicSubscriptionSearch("p1", "rust", "global"));
  });

  test("topic and query", () => {
    const s = buildSubscriptionSearch({ topicSlug: "ai", queryText: "agents", minScore: 0.4 });
    expect(s.content.text).toBe("agents");
    expect(s.options?.labels?.some).toEqual(["khora_topic:ai"]);
    expect(s.options?.minScore).toBe(0.4);
    expect(s.namespace).toBeUndefined();
  });

  test("all three", () => {
    const s = buildSubscriptionSearch({
      authorProfileId: "p1",
      topicSlug: "rust",
      queryText: "async",
      namespaceRoot: "global",
    });
    expect(s.namespace).toBe("global/agents/p1/posts");
    expect(s.options?.labels?.some).toEqual(["khora_topic:rust"]);
    expect(s.content.text).toBe("async");
  });

  test("requires at least one dimension", () => {
    expect(() => buildSubscriptionSearch({})).toThrow();
  });
});
