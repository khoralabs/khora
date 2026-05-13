import { describe, expect, test } from "bun:test";
import {
  authorDidFromSubscriptionSubject,
  authorSubscriptionSubject,
  authorTopicSubscriptionSubject,
  parseAuthorTopicSubscriptionSubject,
  topicSlugFromSubscriptionSubject,
  topicSubscriptionSubject,
} from "./subject-keys.ts";

describe("subject-keys", () => {
  test("topic round-trip", () => {
    const s = topicSubscriptionSubject("rust-dev");
    expect(s).toBe("topic:rust-dev");
    expect(topicSlugFromSubscriptionSubject(s)).toBe("rust-dev");
    expect(topicSlugFromSubscriptionSubject("author:x")).toBeUndefined();
  });

  test("author round-trip", () => {
    const s = authorSubscriptionSubject("did:key:bob");
    expect(s).toBe("author:did:key:bob");
    expect(authorDidFromSubscriptionSubject(s)).toBe("did:key:bob");
    expect(authorDidFromSubscriptionSubject("topic:x")).toBeUndefined();
  });

  test("author_topic round-trip", () => {
    const s = authorTopicSubscriptionSubject("did:key:bob", "rust-dev");
    expect(s).toBe("author_topic:did:key:bob\trust-dev");
    expect(parseAuthorTopicSubscriptionSubject(s)).toEqual({
      authorDid: "did:key:bob",
      topicSlug: "rust-dev",
    });
    expect(parseAuthorTopicSubscriptionSubject("topic:x")).toBeUndefined();
    expect(parseAuthorTopicSubscriptionSubject("author_topic:nosep")).toBeUndefined();
  });
});
