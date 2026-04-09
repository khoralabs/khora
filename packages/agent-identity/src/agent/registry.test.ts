import { describe, expect, test } from "bun:test";
import { createAgentRegistry } from "./agent-registry.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import { tool } from "../tool/tool.js";
import { hashToolComposableStatic } from "../tool/tool-identity.js";
import { createToolRegistry } from "../tool/tool-registry.js";
import { toolkit } from "../toolkit/toolkit.js";
import { createRegisteredAgentIdentity } from "./registered-agent.js";

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
    expect(await reg.get("t")?.composable.computeStaticHash()).toBe(await t2.computeStaticHash());
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
    const { staticHash, identity } = await createRegisteredAgentIdentity({
      agentId: "a1",
      name: "Agent",
      instructions: ["static line"],
      rootComposable: graph,
    });
    const { staticHash: got } = reg.register(identity);
    const entry = reg.get("a1");
    expect(got).toBe(staticHash);
    expect(entry?.agent.staticHash).toBe(staticHash);
    expect(entry?.agent.agentId).toBe("a1");
    expect(entry?.agent.staticProps.kind).toBe("registered-agent");
    expect(entry?.agent.staticProps.instructions).toEqual(["static line"]);
    expect(entry?.agent.rootComposable).toBe(graph);
  });

  test("last register wins for same agentId", async () => {
    const reg = createAgentRegistry();
    const g1 = tool({ name: "a", inputSchema: schema, handler: async () => 0 });
    const g2 = tool({ name: "b", inputSchema: schema, handler: async () => 0 });
    await reg.register(
      (
        await createRegisteredAgentIdentity({
          agentId: "same",
          name: "One",
          instructions: [],
          rootComposable: g1,
        })
      ).identity,
    );
    await reg.register(
      (
        await createRegisteredAgentIdentity({
          agentId: "same",
          name: "Two",
          instructions: [],
          rootComposable: g2,
        })
      ).identity,
    );
    expect(reg.get("same")?.agent.name).toBe("Two");
  });

  test("createSession composes hooks in registry-session-builder order", async () => {
    const reg = createAgentRegistry();
    const graph = tool({ name: "n", inputSchema: schema, handler: async () => 0 });
    const { identity } = await createRegisteredAgentIdentity({
      agentId: "hooks",
      name: "Hooks",
      instructions: [],
      rootComposable: graph,
    });
    const seen: string[] = [];
    reg.register(identity, {
      hooks: {
        onStart: () => {
          seen.push("registry-start");
        },
      },
      run: async () => 7,
    });
    const session = reg.createSession("hooks", {
      hooks: {
        onStart: () => {
          seen.push("session-start");
        },
      },
    });
    session.onStart(() => {
      seen.push("builder-start");
    });
    const out = await session.start<void, number>(undefined);
    expect(out).toBe(7);
    expect(seen).toEqual(["registry-start", "session-start", "builder-start"]);
  });

  test("context precedence is session over registry over agent static", async () => {
    const reg = createAgentRegistry();
    const graph = tool({ name: "n", inputSchema: schema, handler: async () => 0 });
    const { identity } = await createRegisteredAgentIdentity({
      agentId: "ctx",
      name: "Ctx",
      instructions: [],
      context: { shared: "agent", onlyAgent: true },
      rootComposable: graph,
    });
    reg.register(identity, {
      ctx: { shared: "registry", onlyRegistry: true },
      run: async ({ context }) => context,
    });
    const out = await reg
      .createSession("ctx", { ctx: { shared: "session", onlySession: true } })
      .start<void, Record<string, unknown>>(undefined);
    expect(out).toEqual({
      shared: "session",
      onlyAgent: true,
      onlyRegistry: true,
      onlySession: true,
    });
  });

  test("context resolver runs at start with merged input", async () => {
    const reg = createAgentRegistry();
    const graph = tool({ name: "n", inputSchema: schema, handler: async () => 0 });
    const { identity } = await createRegisteredAgentIdentity({
      agentId: "resolver",
      name: "Resolver",
      instructions: [],
      rootComposable: graph,
    });
    reg.register(identity, {
      ctx: ({ input }) => ({ fromRegistryResolver: Number(input) + 1 }),
      run: async ({ context }) => context,
    });
    const out = await reg
      .createSession("resolver", {
        ctx: ({ context }) => ({ fromSessionResolver: Number(context.fromRegistryResolver) + 1 }),
      })
      .start<number, Record<string, unknown>>(1);
    expect(out).toEqual({
      fromRegistryResolver: 2,
      fromSessionResolver: 3,
    });
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
    expect(hashToolComposableStatic(t)).resolves.toBeDefined();
    expect(hashToolComposableStatic(tk as never)).rejects.toThrow(
      'expected composable with kind "tool"',
    );
  });
});
