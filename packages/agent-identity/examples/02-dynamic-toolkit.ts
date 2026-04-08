/**
 * dynamicToolkit: members chosen at runtime from context.
 * Run: bun run examples/02-dynamic-toolkit.ts
 */
import {
  dynamicToolkit,
  evaluateComposable,
  policy,
  tool,
} from "../src/index.ts";
import { numberInputSchema } from "./standard-schema-helpers.ts";
import { toolMapToAiTools } from "./toAiSdk.ts";

const gate = policy("feature-add", async (env: { features: string[] }) =>
  Promise.resolve(env.features.includes("add")),
);

const add = tool({
  name: "add",
  description: "Add one to a number",
  inputSchema: numberInputSchema(),
  policies: [gate],
  handler: async (_ctx, n) => n + 1,
});

const root = dynamicToolkit({
  name: "dynamic-demo",
  instructions: ["Dynamic members."],
  create: async (ctx) => {
    const env = ctx.env as { features: string[] };
    if (env.features.includes("add")) return [add];
    return [];
  },
});

const result = await evaluateComposable(root, {
  env: { features: ["add"] },
});
console.log("tools:", Object.keys(result.tools));
console.log(
  await result.tools.add?.handler(
    { env: { features: ["add"] } },
    41,
    undefined,
  ),
);

const aiTools = toolMapToAiTools(result.tools, { env: { features: ["add"] } });
console.log("ai tools:", Object.keys(aiTools));
