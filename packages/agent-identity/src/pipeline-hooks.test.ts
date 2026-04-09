import { expect, test } from "bun:test";
import { z } from "zod";
import { policy } from "./policy/policy.js";
import { tool } from "./tool/tool.js";
import { toolkit } from "./toolkit/toolkit.js";

test("when member policies are resolved at toolkit, hooks run toolkit then runtime (tool hooks apply on tool phase only if policy not pre-resolved)", async () => {
  const order: string[] = [];
  const p = policy("p1", async () => true);
  const t = tool({
    name: "leaf",
    inputSchema: z.object({ x: z.number() }),
    policies: [p],
    hooks: {
      onPolicyEvaluated: async () => {
        order.push("tool");
      },
    },
    handler: async () => ({ ok: true }),
  });
  const root = toolkit([t], {
    name: "root",
    hooks: {
      onPolicyEvaluated: async () => {
        order.push("toolkit");
      },
    },
  });
  const { tools } = await root.evaluate({
    env: {},
    pipelineHooks: {
      onPolicyEvaluated: async () => {
        order.push("runtime");
      },
    },
  });
  expect(tools.leaf).toBeDefined();
  await tools.leaf?.handler({ env: {} }, { x: 1 });
  expect(order).toEqual(["toolkit", "runtime"]);
});

test("standalone tool: onPolicyEvaluated merge order tool hooks then runtime", async () => {
  const order: string[] = [];
  const p = policy("p2", async () => true);
  const t = tool({
    name: "solo",
    inputSchema: z.object({}),
    policies: [p],
    hooks: {
      onPolicyEvaluated: async () => {
        order.push("tool");
      },
    },
    handler: async () => ({}),
  });
  await t.evaluate({
    env: {},
    pipelineHooks: {
      onPolicyEvaluated: async () => {
        order.push("runtime");
      },
    },
  });
  expect(order).toEqual(["tool", "runtime"]);
});

test("onToolExecuted receives ok false and error when handler throws", async () => {
  const events: { ok: boolean; error?: string }[] = [];
  const t = tool({
    name: "boom",
    inputSchema: z.object({}),
    hooks: {
      onToolExecuted: async (e) => {
        events.push({ ok: e.ok, error: e.error });
      },
    },
    handler: async () => {
      throw new Error("nope");
    },
  });
  const { tools } = await t.evaluate({ env: {} });
  const spec = tools.boom;
  await expect(spec.handler({ env: {} }, {})).rejects.toThrow("nope");
  expect(events).toEqual([{ ok: false, error: "nope" }]);
});

test("onToolExecuted receives ok true with output when handler succeeds", async () => {
  const events: { ok: boolean; output?: unknown }[] = [];
  const t = tool({
    name: "ok",
    inputSchema: z.object({}),
    hooks: {
      onToolExecuted: async (e) => {
        events.push({ ok: e.ok, output: e.output });
      },
    },
    handler: async () => ({ done: true }),
  });
  const { tools } = await t.evaluate({ env: {} });
  const out = await tools.ok.handler({ env: {} }, {});
  expect(out).toEqual({ done: true });
  expect(events).toEqual([{ ok: true, output: { done: true } }]);
});
