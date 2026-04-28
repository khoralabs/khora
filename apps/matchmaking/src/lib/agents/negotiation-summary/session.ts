import type {
  AgentRegistry,
  RegisterAgentOptions,
  RegisteredAgentIdentity,
  SessionContext,
  SessionRunner,
} from "@cfd/agent-identity";
import { evaluateRegisteredAgentAffordances } from "@cfd/agent-identity";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { buildMemorySearchToolkitContext } from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type { createMatchmakingMemoriesBundle } from "../../memories/create-memories-bundle.ts";
import { generateNegotiationSummary } from "./create-negotiation-summary-agent.ts";
import {
  buildNegotiationSummaryAgentId,
  type DefineNegotiationSummaryIdentityOptions,
  defineNegotiationSummaryIdentity,
} from "./identity.ts";
import { buildNegotiationSummaryMemoryContext } from "./memory-context-for-summary.ts";
import type { NegotiationSummaryOutput } from "./output.ts";

export type NegotiationSummarySessionContext = SessionContext & {
  model: LanguageModel;
  client: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  namespace: string;
  embeddingModel: EmbeddingModel;
};

export type NegotiationSummarySessionInput = {
  transcript: string;
  partySlug: string;
  counterpartySlug: string;
  maxSteps: number;
};

export type NegotiationSummarySessionOutput = {
  generation: unknown;
  output: NegotiationSummaryOutput;
};

export async function getNegotiationSummaryAgentDefinition(
  namespace: string,
  options?: DefineNegotiationSummaryIdentityOptions,
): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
  registerOptions: RegisterAgentOptions<
    NegotiationSummarySessionInput,
    NegotiationSummarySessionOutput,
    NegotiationSummarySessionContext
  >;
}> {
  const { staticHash, identity } = await defineNegotiationSummaryIdentity(namespace, options);
  return {
    staticHash,
    identity,
    registerOptions: {
      run: createNegotiationSummarySessionRunner(),
    },
  };
}

export async function ensureNegotiationSummaryAgentRegistered(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineNegotiationSummaryIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  const id = buildNegotiationSummaryAgentId(namespace);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (!entry) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity, registerOptions } = await getNegotiationSummaryAgentDefinition(
    namespace,
    options,
  );
  registry.register(identity, registerOptions);
  return { staticHash, identity };
}

export function createNegotiationSummarySessionRunner(): SessionRunner<
  NegotiationSummarySessionInput,
  NegotiationSummarySessionOutput,
  NegotiationSummarySessionContext
> {
  return async ({ agent, input, context }) => {
    const toolkitCtx = buildMemorySearchToolkitContext({
      client: context.client,
      namespace: context.namespace,
      embeddingModel: context.embeddingModel,
      agentId: agent.agentId,
      agentName: agent.name,
      memorySearchBudgetMax: 6,
    });
    const affordances = await evaluateRegisteredAgentAffordances(agent, toolkitCtx);
    const memoryContextBlock = await buildNegotiationSummaryMemoryContext({
      client: context.client,
      namespace: context.namespace,
      embeddingModel: context.embeddingModel,
      transcript: input.transcript,
      partySlug: input.partySlug,
      counterpartySlug: input.counterpartySlug,
    });
    return generateNegotiationSummary({
      model: context.model,
      systemInstructions: affordances.instructions,
      memoryContextBlock,
      transcript: input.transcript,
      partySlug: input.partySlug,
      counterpartySlug: input.counterpartySlug,
    });
  };
}
