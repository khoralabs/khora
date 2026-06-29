import { describe, expect, test } from "bun:test";
import {
  mergeTopicLists,
  parseTopicsFromBody,
  topicsCreatePromptLine,
  topicsUpdatePromptLine,
} from "./post-topics";

describe("parseTopicsFromBody", () => {
  test("extracts normalized hashtags and keeps body text untouched", () => {
    const body = "Hello #Climate-Tech and #rust folks";
    expect(parseTopicsFromBody(body)).toEqual(["climate-tech", "rust"]);
    expect(body).toBe("Hello #Climate-Tech and #rust folks");
  });

  test("deduplicates repeated hashtags", () => {
    expect(parseTopicsFromBody("#rust is great #Rust")).toEqual(["rust"]);
  });

  test("skips invalid hashtags", () => {
    expect(parseTopicsFromBody("bad #-tag ok #good_one")).toEqual(["good_one"]);
  });
});

describe("mergeTopicLists", () => {
  test("merges body tags with explicit topics", () => {
    expect(mergeTopicLists(["rust"], ["ai", "rust"])).toEqual(["rust", "ai"]);
  });

  test("returns undefined when empty", () => {
    expect(mergeTopicLists(undefined, [])).toBeUndefined();
  });
});

describe("topics prompts", () => {
  test("create prompt mentions existing tags", () => {
    expect(topicsCreatePromptLine(["rust"])).toContain("Existing tags: rust");
  });

  test("update prompt mentions existing tags", () => {
    expect(topicsUpdatePromptLine(["ai"])).toContain("Existing tags: ai");
  });
});
