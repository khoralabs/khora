import { describe, expect, test } from "bun:test";
import {
  listAuthorSubscriptionsSnapshot,
  standingSearchToPredicate,
} from "./khora-author-subscriptions";
import {
  authorTopicSubscriptionSearch,
  buildSubscriptionSearch,
  topicSubscriptionSearch,
} from "./khora-subscription-searches";

const resolve = (profileId: string) => (profileId === "p1" ? "did:key:bob" : undefined);

describe("standingSearchToPredicate", () => {
  test("topic only", () => {
    expect(standingSearchToPredicate(topicSubscriptionSearch("khoralabs"), resolve)).toEqual({
      topicSlug: "khoralabs",
    });
  });

  test("author-topic and query compound", () => {
    const search = buildSubscriptionSearch({
      authorProfileId: "p1",
      topicSlug: "rust",
      queryText: "platform partners",
      namespaceRoot: "global",
    });
    expect(standingSearchToPredicate(search, resolve)).toEqual({
      authorDid: "did:key:bob",
      topicSlug: "rust",
      query: "platform partners",
    });
  });

  test("semantic only", () => {
    expect(
      standingSearchToPredicate(buildSubscriptionSearch({ queryText: "beta intros" }), resolve),
    ).toEqual({ query: "beta intros" });
  });
});

describe("listAuthorSubscriptionsSnapshot", () => {
  test("one predicate per standing query", () => {
    const snap = listAuthorSubscriptionsSnapshot(
      [topicSubscriptionSearch("khora"), authorTopicSubscriptionSearch("p1", "rust", "global")],
      resolve,
    );
    expect(snap.predicates).toHaveLength(2);
    expect(snap.predicates[0]).toEqual({ topicSlug: "khora" });
    expect(snap.predicates[1]).toEqual({
      authorDid: "did:key:bob",
      topicSlug: "rust",
    });
  });
});
