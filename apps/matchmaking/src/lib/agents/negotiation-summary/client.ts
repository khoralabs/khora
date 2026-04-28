import { type AgentRegistry, createAgentRegistry } from "@cfd/agent-identity";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import type { LanguageModel } from "ai";
import type { createMatchmakingMemoriesBundle } from "../../memories/create-memories-bundle.ts";
import type { DefineNegotiationSummaryIdentityOptions } from "./identity.ts";
import type { NegotiationSummaryOutput } from "./output.ts";
import {
  ensureNegotiationSummaryAgentRegistered,
  type NegotiationSummarySessionInput,
  type NegotiationSummarySessionOutput,
} from "./session.ts";

export type NegotiationSummaryClientOptions = DefineNegotiationSummaryIdentityOptions & {
  registry?: AgentRegistry;
  namespace: string;
  model: LanguageModel;
  client: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  embeddingModel: EmbeddingModel;
  defaultMaxSteps?: number;
};

export class NegotiationSummaryClient {
  readonly registry: AgentRegistry;
  readonly namespace: string;
  readonly model: LanguageModel;
  readonly client: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  readonly embeddingModel: EmbeddingModel;
  readonly identityContext: Record<string, unknown> | undefined;
  readonly instructions: string[] | undefined;
  readonly defaultMaxSteps: number;

  constructor(options: NegotiationSummaryClientOptions) {
    this.registry = options.registry ?? createAgentRegistry();
    this.namespace = options.namespace;
    this.model = options.model;
    this.client = options.client;
    this.embeddingModel = options.embeddingModel;
    this.identityContext = options.identityContext;
    this.instructions = options.instructions;
    this.defaultMaxSteps = options.defaultMaxSteps ?? 6;
  }

  async summarize(args: {
    transcript: string;
    partySlug: string;
    counterpartySlug: string;
    maxSteps?: number;
  }): Promise<NegotiationSummaryOutput> {
    const { identity } = await ensureNegotiationSummaryAgentRegistered(this.registry, this.namespace, {
      ...(this.identityContext !== undefined ? { identityContext: this.identityContext } : {}),
      ...(this.instructions !== undefined ? { instructions: this.instructions } : {}),
    });
    const session = this.registry.createSession(identity.agentId, {
      ctx: {
        model: this.model,
        client: this.client,
        namespace: this.namespace,
        embeddingModel: this.embeddingModel,
      },
    });
    const out = await session.start<NegotiationSummarySessionInput, NegotiationSummarySessionOutput>({
      transcript: args.transcript,
      partySlug: args.partySlug,
      counterpartySlug: args.counterpartySlug,
      maxSteps: args.maxSteps ?? this.defaultMaxSteps,
    });
    return out.output;
  }
}
