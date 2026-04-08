import { describe, expect, test } from "bun:test";
import { createAgentRegistry } from "./agent-registry.js";
import { defineAgentIdentity } from "./identity.js";
import { policy } from "./policy.js";
import type { StandardSchemaV1 } from "./standard-schema.js";
import { tool } from "./tool.js";
import { hashToolComposableStatic } from "./tool-identity.js";
import { createToolRegistry } from "./tool-registry.js";
import { toolkit } from "./toolkit.js";

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

describe("createToolRegistry", () => {
  test("get and getByHash after register", async () => {
    const reg = createToolRegistry();
    const t = tool({
      name: "add",
      inputSchema: schema,
      handler: async () => 0,
    });
    const hash = await reg.register("add", t);
    expect(reg.get("add")?.hash).toBe(hash);
    expect(reg.getByHash(hash)?.key).toBe("add");
    expect(reg.has("add")).toBe(true);
    expect(reg.listKeys()).toContain("add");
  });

  test("last register wins for same key", async () => {
    const reg = createToolRegistry();
    const t1 = tool({
      name: "t",
      inputSchema: schema,
      handler: async () => 0,
    });
    await reg.register("t", t1);
    const t2 = tool({
      name: "t",
      description: "v2",
      inputSchema: schema,
      handler: async () => 0,
    });
    await reg.register("t", t2);
    expect(await reg.get("t")?.composable.computeStaticHash()).toBe(
      await t2.computeStaticHash(),
    );
  });

  test("getByHash last write wins for same hash", async () => {
    const reg = createToolRegistry();
    const t = tool({
      name: "x",
      inputSchema: schema,
      handler: async () => 0,
    });
    const hash = await reg.register("a", t);
    await reg.register("b", t);
    expect(reg.getByHash(hash)?.key).toBe("b");
  });
});

describe("createAgentRegistry", () => {
  test("round-trip and staticHash", async () => {
    const reg = createAgentRegistry();
    const graph = tool({
      name: "n",
      inputSchema: schema,
      handler: async () => 0,
    });
    const staticHash = await graph.computeStaticHash();
    const agent = defineAgentIdentity({
      agentId: "a1",
      name: "Agent",
      staticHash,
    });
    const { staticHash: got } = reg.register(agent);
    const entry = reg.get("a1");
    expect(got).toBe(staticHash);
    expect(entry?.staticHash).toBe(staticHash);
    expect(entry?.agent.agentId).toBe("a1");
  });

  test("last register wins for same agentId", async () => {
    const reg = createAgentRegistry();
    const g1 = tool({ name: "a", inputSchema: schema, handler: async () => 0 });
    const g2 = tool({ name: "b", inputSchema: schema, handler: async () => 0 });
    await reg.register(
      defineAgentIdentity({
        agentId: "same",
        name: "One",
        staticHash: await g1.computeStaticHash(),
      }),
    );
    await reg.register(
      defineAgentIdentity({
        agentId: "same",
        name: "Two",
        staticHash: await g2.computeStaticHash(),
      }),
    );
    expect(reg.get("same")?.agent.name).toBe("Two");
  });
});

describe("hashToolComposableStatic", () => {
  test("hashes tool composable; throws for toolkit", async () => {
    const t = tool({
      name: "x",
      inputSchema: schema,
      handler: async () => 0,
    });
    const tk = toolkit([t], { name: "root" });
    await expect(hashToolComposableStatic(t)).resolves.toBeDefined();
    await expect(hashToolComposableStatic(tk as never)).rejects.toThrow(
      'expected composable with kind "tool"',
    );
  });
});
