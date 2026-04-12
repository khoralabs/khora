import { describe, expect, test } from "bun:test";
import { labelPropertySyntheticEmbedding } from "./label-property-features";

describe("labelPropertySyntheticEmbedding", () => {
  test("empty inputs yield zero vector after normalization convention", () => {
    const v = labelPropertySyntheticEmbedding([], null, 8);
    expect(v.length).toBe(8);
    expect(v.every((x) => x === 0)).toBe(true);
  });

  test("deterministic for same labels and properties", () => {
    const a = labelPropertySyntheticEmbedding(["fact"], { x: 1 }, 16);
    const b = labelPropertySyntheticEmbedding(["fact"], { x: 1 }, 16);
    expect(a).toEqual(b);
  });

  test("different labels change the sketch", () => {
    const a = labelPropertySyntheticEmbedding(["a"], {}, 16);
    const b = labelPropertySyntheticEmbedding(["b"], {}, 16);
    expect(a).not.toEqual(b);
  });

  test("L2 norm is 1 when non-zero", () => {
    const v = labelPropertySyntheticEmbedding(["event"], { k: "v" }, 24);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });
});
