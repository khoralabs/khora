import {
  evaluateRegisteredAgentAffordances,
  type RegisteredAgentIdentity,
} from "@cfd/agent-identity";
import { toolMapToAiTools } from "@cfd/agent-identity-adapters";
import {
  buildObpToolkitContext,
  buildObpToolRuntimeContext,
  type ObpToolkitEnv,
} from "@cfd/obp-tools";
import { type LanguageModel, stepCountIs, type Tool, ToolLoopAgent } from "ai";

export type ObpNegotiationToolSet = Record<string, Tool<unknown, unknown>>;

export type ObpNegotiationToolLoopAgent = ToolLoopAgent<never, ObpNegotiationToolSet, never>;

export type ObpNegotiationGeneration = Awaited<ReturnType<ObpNegotiationToolLoopAgent["generate"]>>;

/**
 * Builds a {@link ToolLoopAgent} with OBP tools from evaluated affordances (adapter pattern).
 */
export async function createObpNegotiationToolLoopAgent(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  env: ObpToolkitEnv;
  systemInstructions: string;
  maxSteps?: number;
}): Promise<ObpNegotiationToolLoopAgent> {
  const { model, identity, env, systemInstructions, maxSteps = 8 } = args;

  const toolkitCtx = buildObpToolkitContext({
    env,
    agentId: identity.agentId,
    agentName: identity.name,
  });
  const runtime = buildObpToolRuntimeContext({
    env,
    agentId: identity.agentId,
    agentName: identity.name,
  });

  const affordances = await evaluateRegisteredAgentAffordances(identity, toolkitCtx);
  const tools: ObpNegotiationToolSet = toolMapToAiTools(affordances.tools, runtime);
  const instructions = [systemInstructions, affordances.instructions].filter(Boolean).join("\n\n");

  return new ToolLoopAgent<never, ObpNegotiationToolSet, never>({
    id: identity.agentId,
    model,
    tools,
    ...(instructions.trim() !== "" ? { instructions } : {}),
    stopWhen: stepCountIs(maxSteps),
  });
}
