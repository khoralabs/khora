import { describe, expect, test } from "bun:test";
import {
  mergeAuthorSubscriptionsSnapshot,
  parseStandingQuerySubscriptionTargets,
} from "./khora-author-subscriptions";
import {
  authorSubscriptionSearch,
  authorTopicSubscriptionSearch,
  topicSubscriptionSearch,
} from "./khora-subscription-searches";

describe("parseStandingQuerySubscriptionTargets", () => {
  test("global topic subscription", () => {
    expect(parseStandingQuerySubscriptionTargets(topicSubscriptionSearch("khoralabs"))).toEqual({
      authorTopicSlugs: [],
      topicSlugs: ["khoralabs"],
      semanticSearchText: undefined,
    });
  });

  test("author subscription", () => {
    const search = authorSubscriptionSearch("prof-1", "global");
    expect(parseStandingQuerySubscriptionTargets(search)).toEqual({
      authorProfileId: "prof-1",
      authorTopicSlugs: [],
      topicSlugs: [],
      semanticSearchText: undefined,
    });
  });

  test("author-topic subscription", () => {
    const search = authorTopicSubscriptionSearch("prof-1", "rust", "global");
    expect(parseStandingQuerySubscriptionTargets(search)).toEqual({
      authorProfileId: "prof-1",
      authorTopicSlugs: ["rust"],
      topicSlugs: [],
      semanticSearchText: undefined,
    });
  });

  test("semantic subscription", () => {
    expect(
      parseStandingQuerySubscriptionTargets({
        content: { text: "platform partners" },
        options: { minScore: 0.3 },
      }),
    ).toEqual({
      authorTopicSlugs: [],
      topicSlugs: [],
      semanticSearchText: "platform partners",
    });
  });
});

describe("mergeAuthorSubscriptionsSnapshot", () => {
  test("merges topic and author rows", () => {
    const snap = mergeAuthorSubscriptionsSnapshot(
      [
        parseStandingQuerySubscriptionTargets(topicSubscriptionSearch("khora")),
        parseStandingQuerySubscriptionTargets(authorSubscriptionSearch("p1", "global")),
      ],
      (profileId) => (profileId === "p1" ? "did:key:bob" : undefined),
    );
    expect(snap.topicSlugs).toEqual(["khora"]);
    expect(snap.authorDids).toEqual(["did:key:bob"]);
  });
});
