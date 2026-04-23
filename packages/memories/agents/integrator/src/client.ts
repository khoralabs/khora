import type { AgentRegistry } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import type { EmbeddingModel } from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type z from "zod";
import {
  ensureMemoryIntegratorAgentRegistered,
  type MemoryIntegratorSessionInput,
  type MemoryIntegratorSessionOutput,
} from "./integrator-session.js";
import { buildMemoryIntegratorAgentId, type DefineMemoryIntegratorIdentityOptions } from "./identity.js";
import type { IntegratorPlanWire } from "./integrator-output.js";
import type { IntegratorPipelineGeneration } from "./create-integrator-agent.js";

export type MemoryIntegratorClientOptions<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = DefineMemoryIntegratorIdentityOptions & {
  /** Omitted if every {@link MemoryIntegratorClient.integrate} supplies {@code overrides.registry} (e.g. fresh registry per run). */
  registry?: AgentRegistry;
  namespace: string;
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embeddingModel: EmbeddingModel;
};

export type MemoryIntegratorIntegrateOverrides<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = {
  maxSteps?: number;
  memorySearchBudgetMax?: number;
  namespace?: string;
  model?: LanguageModel;
  client?: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embeddingModel?: EmbeddingModel;
  registry?: AgentRegistry;
};

/**
 * Host-facing integrator: durable registry/model/client/namespace wiring + {@link integrate} for each run.
 */
export class MemoryIntegratorClient<
  TNode extends Record<string, z.ZodType> = Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType> = Record<string, z.ZodType>,
> {
  readonly registry: AgentRegistry | undefined;
  readonly namespace: string;
  readonly model: LanguageModel;
  readonly client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  readonly embeddingModel: EmbeddingModel;
  readonly identityContext: Record<string, unknown> | undefined;

  constructor(options: MemoryIntegratorClientOptions<TNode, TEdge>) {
    this.registry = options.registry;
    this.namespace = options.namespace;
    this.model = options.model;
    this.client = options.client;
    this.embeddingModel = options.embeddingModel;
    this.identityContext = options.identityContext;
  }

  async integrate(args: {
    content: string;
    maxSteps?: number;
    memorySearchBudgetMax?: number;
    /** Per-call override of any constructor field (e.g. different registry/namespace in a loop). */
    overrides?: MemoryIntegratorIntegrateOverrides<TNode, TEdge>;
  }): Promise<{
    plan: IntegratorPlanWire;
    generation: IntegratorPipelineGeneration;
  }> {
    const o = args.overrides ?? {};
    const maxSteps = o.maxSteps ?? args.maxSteps ?? 12;
    const memorySearchBudgetMax = o.memorySearchBudgetMax ?? args.memorySearchBudgetMax;
    const registry = o.registry ?? this.registry;
    if (registry === undefined) {
      throw new Error(
        "MemoryIntegratorClient: pass registry in the constructor or in integrate({ overrides: { registry } })",
      );
    }
    const namespace = o.namespace ?? this.namespace;
    const model = o.model ?? this.model;
    const client = o.client ?? this.client;
    const embeddingModel = o.embeddingModel ?? this.embeddingModel;

    const { identity } = await ensureMemoryIntegratorAgentRegistered(registry, namespace, {
      ...(this.identityContext !== undefined ? { identityContext: this.identityContext } : {}),
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

    return session.start<MemoryIntegratorSessionInput, MemoryIntegratorSessionOutput>({
      content: args.content,
      maxSteps,
    });
  }

  static integratorAgentId(namespace: string): string {
    return buildMemoryIntegratorAgentId(namespace);
  }
}
