import { describe, expect, test } from "bun:test";
import {
  runtimeIdentityCanonicalPayload,
  toolSpecCanonicalPayload,
} from "./canonical-payloads.js";
import { hashPlainObject } from "./hash.js";
import {
  collectToolStaticHashes,
  computeRuntimeHash,
  hashToolSpecIdentity,
  resolveRuntimeToolRefs,
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

describe("runtimeIdentityCanonicalPayload", () => {
  test("matches computeRuntimeHash for same refs", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const nameToStaticHash = await collectToolStaticHashes(graph);
    const evaluated = await evaluateComposable(graph, { env: {} });
    const refs = await resolveRuntimeToolRefs(
      Object.keys(evaluated.tools),
      nameToStaticHash,
      evaluated.tools,
    );
    const fromCanonical = await hashPlainObject(
      runtimeIdentityCanonicalPayload(refs),
    );
    const fromCompute = await computeRuntimeHash(
      Object.keys(evaluated.tools),
      nameToStaticHash,
      evaluated.tools,
    );
    expect(fromCanonical).toBe(fromCompute);
  });
});

describe("toolSpecCanonicalPayload", () => {
  test("matches hashToolSpecIdentity", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const evaluated = await evaluateComposable(graph, { env: {} });
    const spec = evaluated.tools.t;
    if (!spec) throw new Error("expected tool t");
    const fromPayload = await hashPlainObject(toolSpecCanonicalPayload(spec));
    const fromHash = await hashToolSpecIdentity(spec);
    expect(fromPayload).toBe(fromHash);
  });
});
