import { describe, expect, test } from "bun:test";
import {
  authorDidFromSubscriptionSubject,
  authorSubscriptionSubject,
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
});
