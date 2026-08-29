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
  test("one entry per standing query with id and predicate", () => {
    const snap = listAuthorSubscriptionsSnapshot(
      [
        { id: "sub-topic", search: topicSubscriptionSearch("khora") },
        {
          id: "sub-author-topic",
          search: authorTopicSubscriptionSearch("p1", "rust", "global"),
        },
      ],
      resolve,
    );
    expect(snap.subscriptions).toHaveLength(2);
    expect(snap.subscriptions[0]).toEqual({
      id: "sub-topic",
      predicate: { topicSlug: "khora" },
    });
    expect(snap.subscriptions[1]).toEqual({
      id: "sub-author-topic",
      predicate: {
        authorDid: "did:key:bob",
        topicSlug: "rust",
      },
    });
  });
});
