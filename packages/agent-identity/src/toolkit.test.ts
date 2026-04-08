import { describe, expect, test } from "bun:test";
import { policy } from "./policy.js";
import type { StandardSchemaV1 } from "./standard-schema.js";
import { tool } from "./tool.js";
import { evaluateComposable, toolkit } from "./toolkit.js";

const schema: StandardSchemaV1<{ n: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    types: { input: {} as { n: number }, output: {} as { n: number } },
    validate: (v) =>
      typeof v === "object" &&
      v !== null &&
      "n" in v &&
      typeof (v as { n: unknown }).n === "number"
        ? { value: v as { n: number } }
        : { issues: [{ message: "bad" }] },
  },
};

describe("toolkit evaluation", () => {
  test("dedupes policy evaluation across members", async () => {
    let calls = 0;
    const p = policy("p1", async () => {
      calls += 1;
      return true;
    });

    const a = tool({
      name: "a",
      inputSchema: schema,
      policies: [p],
      handler: async (_c, i) => i.n,
    });
    const b = tool({
      name: "b",
      inputSchema: schema,
      policies: [p],
      handler: async (_c, i) => i.n + 1,
    });

    const tk = toolkit([a, b], { name: "t" });
    await evaluateComposable(tk, { env: {} });
    expect(calls).toBe(1);
  });

  test("toolkit instructions empty when all tools blocked", async () => {
    const p = policy("block", async () => false);
    const t = tool({
      name: "a",
      inputSchema: schema,
      policies: [p],
      handler: async () => 0,
    });
    const tk = toolkit([t], { name: "t", instructions: ["x"] });
    const r = await evaluateComposable(tk, { env: {} });
    expect(r.instructions).toBe("");
    expect(Object.keys(r.tools)).toHaveLength(0);
  });
});
