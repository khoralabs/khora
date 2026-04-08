/**
 * Bottom-up identity: static hash from the composable tree, runtime hash from enabled tools.
 */
import {
  collectToolStaticHashes,
  computeRuntimeHash,
  defineAgentIdentity,
} from "../src/index.js";
import type { StandardSchemaV1 } from "../src/standard-schema.js";
import { tool } from "../src/tool.js";
import { evaluateComposable, toolkit } from "../src/toolkit.js";

const schema: StandardSchemaV1<{ n: number }> = {
  "~standard": {
    version: 1,
    vendor: "example",
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

const t = tool({
  name: "echo",
  inputSchema: schema,
  handler: async (_c, i) => i.n,
});

const graph = toolkit([t], { name: "demo" });

const staticHash = await graph.computeStaticHash();
const agent = defineAgentIdentity({
  agentId: "demo-agent",
  name: "Demo",
  staticHash,
});

const evaluated = await evaluateComposable(graph, { env: {} });
const nameToStaticHash = await collectToolStaticHashes(graph);
const runtimeHash = await computeRuntimeHash(
  Object.keys(evaluated.tools),
  nameToStaticHash,
  evaluated.tools,
);

console.log({ agentId: agent.agentId, staticHash, runtimeHash });
