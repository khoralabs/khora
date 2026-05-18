import { describe, expect, test } from "bun:test";
import { mergeVellumAppConfigLayers } from "./merge.ts";

describe("mergeVellumAppConfigLayers", () => {
  test("last wins on overlapping keys", () => {
    const merged = mergeVellumAppConfigLayers([
      { baseUrl: "http://a", dataDir: "/x" },
      { baseUrl: "http://b" },
    ]);
    expect(merged.baseUrl).toBe("http://b");
    expect(merged.dataDir).toBe("/x");
  });

  test("skips non-objects", () => {
    expect(mergeVellumAppConfigLayers([null, "x", { a: 1 }])).toEqual({ a: 1 });
  });
});
