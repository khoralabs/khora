import { describe, expect, test } from "bun:test";
import { evaluateRegisteredAgentAffordances } from "./evaluate-registered-agent-affordances.js";
import { createRegisteredAgentIdentity } from "./registered-agent.js";
import type { StandardSchemaV1 } from "./standard-schema.js";
import { tool } from "./tool.js";
import { toolkit } from "./toolkit.js";

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

describe("evaluateRegisteredAgentAffordances", () => {
  test("merges static instructions before toolkit assembly", async () => {
    const t = tool({
      name: "t",
      inputSchema: schema,
      instructions: ["tool line"],
      handler: async () => 0,
    });
    const graph = toolkit([t], {
      name: "root",
      instructions: ["tk line"],
    });
    const { identity } = await createRegisteredAgentIdentity({
      agentId: "a",
      name: "A",
      instructions: ["agent static"],
      rootComposable: graph,
    });
    const out = await evaluateRegisteredAgentAffordances(identity, { env: {} });
    expect(Object.keys(out.tools)).toContain("t");
    expect(out.instructions).toContain("agent static");
    expect(out.instructions.indexOf("agent static")).toBeLessThan(
      out.instructions.indexOf("tk line"),
    );
  });
});
