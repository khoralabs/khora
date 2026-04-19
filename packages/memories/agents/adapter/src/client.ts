import type { AgentRegistry } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type z from "zod";
import type { MemoryAdapterSessionInput, MemoryAdapterSessionOutput } from "./adapter-session.js";
import { registerMemoryAdapterAgent } from "./declaration.js";
import { buildMemoryAdapterAgentId } from "./identity.js";
import type { AdapterIngestContext } from "./types.js";

export type MemoryAdapterClientOptions = {
  /** Merged into {@link defineMemoryAdapterIdentity} static context. */
  identityContext?: Record<string, unknown>;
};

/**
 * Host-facing adapter client: injectable identity context + expand session.
 */
export class MemoryAdapterClient {
  readonly identityContext: Record<string, unknown> | undefined;

  constructor(options?: MemoryAdapterClientOptions) {
    this.identityContext = options?.identityContext;
  }

  async expand<
    TNode extends Record<string, z.ZodType>,
    TEdge extends Record<string, z.ZodType>,
    TDomain = unknown,
  >(args: {
    registry: AgentRegistry;
    namespace: string;
    model: LanguageModel;
    client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
    embeddingModel: EmbeddingModel;
    ingest: AdapterIngestContext;
    domainPayload: TDomain;
    maxSteps?: number;
  }): Promise<MemoryAdapterSessionOutput> {
    const {
      registry,
      namespace,
      model,
      client,
      embeddingModel,
      ingest,
      domainPayload,
      maxSteps = 12,
    } = args;

    const { identity } = await registerMemoryAdapterAgent(registry, namespace, {
      identityContext: this.identityContext,
    });

    const session = registry.createSession(identity.agentId, {
      ctx: {
        model,
        client,
        embeddingModel,
        namespace,
      },
    });

    const input: MemoryAdapterSessionInput<TDomain> = { ingest, domainPayload, maxSteps };
    return session.start<MemoryAdapterSessionInput<TDomain>, MemoryAdapterSessionOutput>(input);
  }

  /** Resolved agent id for the adapter in a namespace (after registration). */
  static adapterAgentId(namespace: string): string {
    return buildMemoryAdapterAgentId(namespace);
  }
}
