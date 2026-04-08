import { describe, expect, test } from "bun:test";
import { defineAgentIdentity } from "./identity.js";
import { createIdentityLink } from "./identity-link.js";
import {
  collectToolStaticHashes,
  computeRuntimeHash,
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

describe("createIdentityLink", () => {
  test("links static and runtime hashes for same evaluation", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const staticHash = await graph.computeStaticHash();
    const agent = defineAgentIdentity({
      agentId: "a",
      name: "Agent",
      staticHash,
    });
    const evaluated = await evaluateComposable(graph, { env: {} });
    const nameToStaticHash = await collectToolStaticHashes(graph);
    const enabled = Object.keys(evaluated.tools);
    const runtimeHash = await computeRuntimeHash(
      enabled,
      nameToStaticHash,
      evaluated.tools,
    );
    const link = await createIdentityLink({
      agent,
      enabledToolNames: enabled,
      nameToStaticHash,
      tools: evaluated.tools,
    });

    expect(link.agentId).toBe("a");
    expect(link.agentName).toBe("Agent");
    expect(link.staticHash).toMatch(/^[a-f0-9]{64}$/);
    expect(link.runtimeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(link.runtimeHash).toBe(runtimeHash);
  });

  test("runtime hash differs for empty vs non-empty enabled tools", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const nameToStaticHash = await collectToolStaticHashes(graph);
    const evaluated = await evaluateComposable(graph, { env: {} });
    const hWithTools = await computeRuntimeHash(
      Object.keys(evaluated.tools),
      nameToStaticHash,
      evaluated.tools,
    );
    const hEmpty = await computeRuntimeHash([], nameToStaticHash, {});
    expect(hWithTools).not.toBe(hEmpty);
  });
});
