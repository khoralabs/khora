import type { ToolSpec } from "../tool/types.js";
import { assembleToolkitAgentInstructions } from "../toolkit/assemble-toolkit-instructions.js";
import { evaluateComposable } from "../toolkit/toolkit.js";
import type { Composable, ToolkitContext } from "../toolkit/types.js";
import type { RegisteredAgentIdentity } from "./types.js";

export type RegisteredAgentAffordances = {
  tools: Record<string, ToolSpec>;
  instructions: string;
};

/**
 * Evaluates the identity’s root composable and merges instructions with
 * {@link RegisteredAgentIdentity.staticInstructions}.
 */
export async function evaluateRegisteredAgentAffordances<Env>(
  identity: RegisteredAgentIdentity,
  ctx: ToolkitContext<Env>,
): Promise<RegisteredAgentAffordances> {
  const root = identity.rootComposable as Composable<
    { kind: string; name: string },
    Record<string, ToolSpec>,
    Env
  >;
  const evaluated = await evaluateComposable(root, ctx);
  const toolkitBlock = assembleToolkitAgentInstructions(evaluated);
  const agentBlock = identity.staticInstructions
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
  const instructions = [agentBlock, toolkitBlock].filter(Boolean).join("\n\n");
  return {
    tools: evaluated.tools,
    instructions,
  };
}
