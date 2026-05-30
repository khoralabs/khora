import { describe, expect, test } from "bun:test";
import { mergeAsyncIterators } from "./index";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* source(
  label: string,
  values: number[],
  delay: number,
  onReturn?: () => void,
): AsyncGenerator<string> {
  try {
    for (const v of values) {
      await sleep(delay);
      yield `${label}${v}`;
    }
  } finally {
    onReturn?.();
  }
}

describe("mergeAsyncIterators", () => {
  test("yields values in arrival order", async () => {
    const out: string[] = [];
    for await (const v of mergeAsyncIterators([
      source("a", [1, 2, 3], 10),
      source("b", [1, 2, 3], 15),
    ])) {
      out.push(v);
    }
    // fast iterator should interleave ahead of slow one
    expect(out).toContain("a1");
    expect(out).toContain("b3");
    expect(out.length).toBe(6);
    expect(out.indexOf("a1")).toBeLessThan(out.indexOf("b1"));
  });

  test("empty input completes immediately", async () => {
    const out: string[] = [];
    for await (const v of mergeAsyncIterators<string>([])) out.push(v);
    expect(out).toEqual([]);
  });

  test("closes inner iterators when consumer breaks", async () => {
    let aClosed = false;
    let bClosed = false;
    const merged = mergeAsyncIterators([
      source("a", [1, 2, 3, 4], 5, () => {
        aClosed = true;
      }),
      source("b", [1, 2, 3, 4], 5, () => {
        bClosed = true;
      }),
    ]);
    const out: string[] = [];
    for await (const v of merged) {
      out.push(v);
      if (out.length === 2) break;
    }
    await sleep(30);
    expect(aClosed).toBe(true);
    expect(bClosed).toBe(true);
  });

  test("propagates errors and still cleans up", async () => {
    let bClosed = false;
    async function* boom(): AsyncGenerator<string> {
      const never: boolean = false;
      if (never) yield "";
      await sleep(5);
      throw new Error("boom");
    }
    const merged = mergeAsyncIterators([
      boom(),
      source("b", [1, 2, 3], 2, () => {
        bClosed = true;
      }),
    ]);
    let error: unknown;
    try {
      for await (const _ of merged) {
        // drain
      }
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");
    expect(bClosed).toBe(true);
  });
});
