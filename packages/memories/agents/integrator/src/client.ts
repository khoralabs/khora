import type { AgentRegistry } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type z from "zod";
import type { IntegratorPipelineGeneration } from "./create-integrator-agent.js";
import { registerMemoryIntegratorAgent } from "./declaration.js";
import type { IntegratorPlanWire } from "./integrator-output.js";

export type MemoryIntegratorClientOptions = {
  identityContext?: Record<string, unknown>;
};

/**
 * Host-facing client: register integrator identity and run one session (content → plan).
 */
export class MemoryIntegratorClient {
  readonly identityContext: Record<string, unknown> | undefined;

  constructor(options?: MemoryIntegratorClientOptions) {
    this.identityContext = options?.identityContext;
  }

  async integrate<
    TNode extends Record<string, z.ZodType>,
    TEdge extends Record<string, z.ZodType>,
  >(args: {
    registry: AgentRegistry;
    namespace: string;
    model: LanguageModel;
    client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
    embeddingModel: EmbeddingModel;
    content: string;
    maxSteps?: number;
    memorySearchBudgetMax?: number;
  }): Promise<{
    plan: IntegratorPlanWire;
    generation: IntegratorPipelineGeneration;
  }> {
    const {
      registry,
      namespace,
      model,
      client,
      embeddingModel,
      content,
      maxSteps = 12,
      memorySearchBudgetMax,
    } = args;

    const { identity } = await registerMemoryIntegratorAgent(registry, namespace, {
      identityContext: this.identityContext,
    });

    const session = registry.createSession(identity.agentId, {
      ctx: {
        model,
        client,
        embeddingModel,
        namespace,
        ...(memorySearchBudgetMax !== undefined ? { memorySearchBudgetMax } : {}),
      },
    });

    return session.start({
      content,
      maxSteps,
    });
  }
}
