import { describe, expect, test } from "bun:test";
import { normalizeTopicSlug } from "./topic-slug.ts";

describe("normalizeTopicSlug", () => {
  test("strips hash and lowercases", () => {
    expect(normalizeTopicSlug("#Rust-Dev")).toBe("rust-dev");
  });
  test("rejects empty", () => {
    expect(() => normalizeTopicSlug("")).toThrow(/empty/);
  });
});
