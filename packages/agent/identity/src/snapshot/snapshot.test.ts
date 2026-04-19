import { describe, expect, test } from "bun:test";
import { evaluateRegisteredAgentAffordances } from "../agent/evaluate-registered-agent-affordances.js";
import { createRegisteredAgentIdentity } from "../agent/registered-agent.js";
import { toolSpecCanonicalPayload } from "../hashing/canonical-payloads.js";
import { hashPlainObject } from "../hashing/hash.js";
import { hashToolSpecIdentity } from "../hashing/runtime-hashes.js";
import { policy } from "../policy/policy.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import { tool } from "../tool/tool.js";
import { evaluateComposable, toolkit } from "../toolkit/toolkit.js";
import { affordancesToWire, capturePolicyResults, hydrateAffordances } from "./capture-hydrate.js";
import { hashToolSpecWire, toolIdentityPayloadFromWire, toolSpecToWire } from "./tool-spec-wire.js";

const schema: StandardSchemaV1<{ n: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    types: { input: {} as { n: number }, output: {} as { n: number } },
    validate: (v) =>
      typeof v === "object" && v !== null && "n" in v && typeof (v as { n: unknown }).n === "number"
        ? { value: v as { n: number } }
        : { issues: [{ message: "bad" }] },
  },
};

describe("toolSpecToWire", () => {
  test("hash matches hashToolSpecIdentity", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const evaluated = await evaluateComposable(graph, { env: {} });
    const spec = evaluated.tools.t;
    if (!spec) throw new Error("expected t");
    const wire = toolSpecToWire(spec);
    const hWire = await hashToolSpecWire(wire);
    const hLive = await hashToolSpecIdentity(spec);
    expect(hWire).toBe(hLive);
  });

  test("toolIdentityPayloadFromWire matches toolSpecCanonicalPayload", async () => {
    const t = tool({
      name: "t",
      description: "d",
      inputSchema: schema,
      instructions: ["a", "b"],
      handler: async () => 0,
    });
    const graph = toolkit([t], { name: "root" });
    const evaluated = await evaluateComposable(graph, { env: {} });
    const spec = evaluated.tools.t;
    if (!spec) throw new Error("expected t");
    const wire = toolSpecToWire(spec);
    const fromWire = await hashPlainObject(toolIdentityPayloadFromWire(wire));
    const fromSpec = await hashPlainObject(toolSpecCanonicalPayload(spec));
    expect(fromWire).toBe(fromSpec);
  });
});

describe("capturePolicyResults", () => {
  test("serializes PolicyResultMap by policy id", () => {
    const p1 = policy("p1", async () => true);
    const p2 = policy("p2", async () => false);
    const map = new Map([
      [p1, true],
      [p2, false],
    ]);
    const snap = capturePolicyResults(map, "authoritative", { capturedAt: 1_700_000_000_000 });
    expect(snap.mode).toBe("authoritative");
    expect(snap.results.p1).toBe(true);
    expect(snap.results.p2).toBe(false);
    expect(snap.capturedAt).toBe(1_700_000_000_000);
    expect(Object.keys(snap.results).sort()).toEqual(["p1", "p2"]);
  });
});

describe("affordancesToWire and hydrateAffordances", () => {
  test("round-trip with bindTool restoring handlers", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 42,
    });
    const graph = toolkit([t], { name: "root" });
    const { identity: agent } = await createRegisteredAgentIdentity({
      agentId: "a",
      name: "A",
      instructions: [],
      rootComposable: graph,
    });
    const aff0 = await evaluateRegisteredAgentAffordances(agent, { env: {} });
    const wire = affordancesToWire(aff0);
    const originals = { ...aff0.tools };
    const aff1 = await hydrateAffordances({
      wire,
      bindTool: async ({ wire: w }) => {
        const orig = originals[w.name];
        if (!orig) throw new Error(`missing ${w.name}`);
        return orig;
      },
    });
    expect(Object.keys(aff1.tools)).toEqual(Object.keys(aff0.tools));
    expect(aff1.instructions).toBe(aff0.instructions);
    const out = await aff1.tools.t?.handler({ env: {} }, { n: 1 });
    expect(out).toBe(42);
  });
});
