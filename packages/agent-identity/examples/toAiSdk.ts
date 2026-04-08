/**
 * Adapter: map evaluated @very-coffee/agent-identity `ToolSpec` into Vercel AI SDK `tool()`.
 * Keeps the core package free of `ai`; this file is example-only.
 */
import { type Tool, tool } from "ai";
import type { ToolRuntimeContext, ToolSpec } from "../src/index.ts";

export function toolSpecToAiTool(
  spec: ToolSpec,
  runtime: ToolRuntimeContext,
): Tool<unknown, unknown> {
  return tool({
    description: spec.description,
    inputSchema: spec.inputSchema as Tool<unknown, unknown>["inputSchema"],
    execute: async (input: unknown, options) =>
      spec.handler(runtime, input, options),
  });
}

export function toolMapToAiTools(
  tools: Record<string, ToolSpec>,
  runtime: ToolRuntimeContext,
): Record<string, Tool<unknown, unknown>> {
  const out: Record<string, Tool<unknown, unknown>> = {};
  for (const [key, spec] of Object.entries(tools)) {
    out[key] = toolSpecToAiTool(spec, runtime);
  }
  return out;
}
