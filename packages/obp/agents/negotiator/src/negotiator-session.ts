import type {
  AgentRegistry,
  RegisterAgentOptions,
  RegisteredAgentIdentity,
  SessionContext,
  SessionRunner,
  ToolPipelineHooks,
} from "@cfd/agent-identity";
import type { ObpToolkitEnv } from "@cfd/obp-tools";
import type { LanguageModel } from "ai";
import {
  createObpNegotiatorAgent,
  type ObpNegotiatorGeneration,
} from "./create-negotiator-agent.ts";
import {
  buildObpNegotiatorAgentId,
  type DefineObpNegotiatorIdentityOptions,
  defineObpNegotiatorIdentity,
} from "./identity.ts";

/**
 * Per-turn OBP (+ optional host) toolkit env, built from session context and acting agent.
 */
export type ObpNegotiatorResolveEnv = (args: {
  agent: RegisteredAgentIdentity;
  context: SessionContext;
}) => Promise<ObpToolkitEnv>;

export type ObpNegotiatorSessionContext = SessionContext & {
  model: LanguageModel;
  toolPipelineHooks?: ToolPipelineHooks;
  /** Passed to {@link createObpNegotiatorAgent} (often empty; affordances add tool docs). */
  systemInstructions?: string;
  /** Default max tool steps for the loop agent (default 8). */
  defaultMaxSteps?: number;
  /**
   * Build the toolkit env for this turn (graph, memory slice, party id, etc.).
   * The session runner calls this on every {@link SessionRunner} invocation.
   */
  resolveEnv: ObpNegotiatorResolveEnv;
};

export type ObpNegotiatorSessionInput = {
  prompt: string;
};

export type ObpNegotiatorSessionOutput = {
  generation: ObpNegotiatorGeneration;
};

/**
 * One negotiation turn: {@code resolveEnv} then {@link createObpNegotiatorAgent} + {@code generate}.
 */
export function createObpNegotiatorSessionRunner(): SessionRunner<
  ObpNegotiatorSessionInput,
  ObpNegotiatorSessionOutput,
  ObpNegotiatorSessionContext
> {
  return async ({ agent, input, context }) => {
    const ctx = context as ObpNegotiatorSessionContext;
    if (ctx.resolveEnv === undefined) {
      throw new Error("obp negotiator session context missing resolveEnv");
    }
    const { prompt } = input;
    const env = await ctx.resolveEnv({ agent, context });
    const toolLoop = await createObpNegotiatorAgent({
      model: ctx.model,
      identity: agent,
      env,
      systemInstructions: ctx.systemInstructions ?? "",
      maxSteps: ctx.defaultMaxSteps ?? 8,
      toolPipelineHooks: ctx.toolPipelineHooks,
    });
    return { generation: await toolLoop.generate({ prompt }) };
  };
}

/**
 * Full static definition: identity (capabilities hash) + session registration for {@link AgentRegistry.register}.
 */
export async function getObpNegotiatorAgentDefinition(
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
  registerOptions: RegisterAgentOptions<
    ObpNegotiatorSessionInput,
    ObpNegotiatorSessionOutput,
    ObpNegotiatorSessionContext
  >;
}> {
  const { staticHash, identity } = await defineObpNegotiatorIdentity(namespace, options);
  return {
    staticHash,
    identity,
    registerOptions: { run: createObpNegotiatorSessionRunner() },
  };
}

/**
 * Registers the OBP negotiator on {@code registry} if not already present (same agent id for {@code namespace}).
 */
export async function ensureObpNegotiatorAgentRegistered(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  const id = buildObpNegotiatorAgentId(namespace);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (!entry) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity, registerOptions } = await getObpNegotiatorAgentDefinition(
    namespace,
    options,
  );
  registry.register(identity, registerOptions);
  return { staticHash, identity };
}

export const registerObpNegotiatorAgent = ensureObpNegotiatorAgentRegistered;
