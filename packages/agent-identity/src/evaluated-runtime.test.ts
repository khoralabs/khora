import { describe, expect, test } from "bun:test";
import {
  collectToolStaticHashes,
  computeRuntimeHash,
  computeRuntimeIdentityFromEvaluation,
} from "./runtime-hashes.js";
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

describe("computeRuntimeIdentityFromEvaluation", () => {
  test("matches collectToolStaticHashes + computeRuntimeHash for same evaluation", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const ctx = { env: {} };
    const { runtimeHash, toolRefs, evaluatedTools } =
      await computeRuntimeIdentityFromEvaluation(graph, ctx);

    const nameToStaticHash = await collectToolStaticHashes(graph);
    const evaluated = await evaluateComposable(graph, ctx);
    expect(Object.keys(evaluated.tools).sort()).toEqual(
      Object.keys(evaluatedTools).sort(),
    );

    const expectedHash = await computeRuntimeHash(
      Object.keys(evaluated.tools),
      nameToStaticHash,
      evaluated.tools,
    );
    expect(runtimeHash).toBe(expectedHash);
    expect(toolRefs.length).toBe(Object.keys(evaluated.tools).length);
  });
});
