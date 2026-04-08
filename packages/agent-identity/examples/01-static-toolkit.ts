/**
 * Static toolkit + policies; adapt evaluated tools to Vercel AI SDK.
 * Run: bun run examples/01-static-toolkit.ts
 */
import { evaluateComposable, policy, tool, toolkit } from "../src/index.ts";
import { greetInputSchema } from "./standard-schema-helpers.ts";
import { toolMapToAiTools } from "./toAiSdk.ts";

const allowGreeting = policy(
  "allow-greeting",
  async (env: { allow: boolean }) => Promise.resolve(env.allow),
);

const greet = tool({
  name: "greet",
  description: "Say hello",
  inputSchema: greetInputSchema(),
  instructions: ["Use when the user wants a greeting."],
  policies: [allowGreeting],
  handler: async (_ctx, input) => `Hello, ${input.name}!`,
});

const root = toolkit([greet], {
  name: "demo-toolkit",
  instructions: ["Toolkit scope."],
});

const allowed = await evaluateComposable(root, {
  env: { allow: true },
  namespace: "example",
  agentId: "demo",
  agentName: "Demo",
});
console.log("instructions:\n", allowed.instructions);
console.log("tool names:", Object.keys(allowed.tools));

const aiTools = toolMapToAiTools(allowed.tools, {
  env: { allow: true },
  namespace: "example",
});
console.log("ai sdk tool keys:", Object.keys(aiTools));

const blocked = await evaluateComposable(root, {
  env: { allow: false },
});
console.log("blocked tools count:", Object.keys(blocked.tools).length);
