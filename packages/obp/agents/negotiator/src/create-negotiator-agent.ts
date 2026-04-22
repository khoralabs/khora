import {
  evaluateRegisteredAgentAffordances,
  type RegisteredAgentIdentity,
  type ToolPipelineHooks,
} from "@cfd/agent-identity";
import { toolMapToAiTools } from "@cfd/agent-identity-adapters";
import {
  buildObpToolkitContext,
  buildObpToolRuntimeContext,
  type ObpToolkitEnv,
} from "@cfd/obp-tools";
import { type LanguageModel, stepCountIs, type Tool, ToolLoopAgent } from "ai";

export type ObpNegotiatorToolSet = Record<string, Tool<unknown, unknown>>;

export type ObpNegotiatorAgent = ToolLoopAgent<never, ObpNegotiatorToolSet, never>;

export type ObpNegotiatorGeneration = Awaited<ReturnType<ObpNegotiatorAgent["generate"]>>;

/**
 * Builds a {@link ToolLoopAgent} with OBP tools from evaluated affordances.
 */
export async function createObpNegotiatorAgent<Env extends ObpToolkitEnv>(args: {
  model: LanguageModel;
  identity: RegisteredAgentIdentity;
  env: Env;
  systemInstructions: string;
  maxSteps?: number;
  toolPipelineHooks?: ToolPipelineHooks;
}): Promise<ObpNegotiatorAgent> {
  const { model, identity, env, systemInstructions, maxSteps = 8, toolPipelineHooks } = args;

  const toolkitCtx = buildObpToolkitContext({
    env,
    agentId: identity.agentId,
    agentName: identity.name,
    ...(toolPipelineHooks !== undefined ? { pipelineHooks: toolPipelineHooks } : {}),
  });
  const runtime = buildObpToolRuntimeContext({
    env,
    agentId: identity.agentId,
    agentName: identity.name,
  });

  const affordances = await evaluateRegisteredAgentAffordances(identity, toolkitCtx);
  const tools: ObpNegotiatorToolSet = toolMapToAiTools(affordances.tools, runtime);
  const instructions = [systemInstructions, affordances.instructions].filter(Boolean).join("\n\n");

  return new ToolLoopAgent<never, ObpNegotiatorToolSet, never>({
    id: identity.agentId,
    model,
    tools,
    ...(instructions.trim() !== "" ? { instructions } : {}),
    stopWhen: stepCountIs(maxSteps),
  });
}
