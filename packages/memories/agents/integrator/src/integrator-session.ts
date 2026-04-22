import {
  evaluateRegisteredAgentAffordances,
  type RegisterAgentOptions,
  type SessionContext,
  type SessionRunner,
  type ToolkitContext,
  type ToolRuntimeContext,
} from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import {
  buildMemorySearchToolkitContext,
  buildMemorySearchToolRuntimeContext,
  type EmbeddingModel,
  type MemorySearchEnv,
} from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type z from "zod";
import type { IntegratorPipelineGeneration } from "./create-integrator-agent.js";
import { createMemoryIntegratorAgent } from "./create-integrator-agent.js";
import { type IntegratorPlanWire, parseIntegratorPlanWire } from "./integrator-output.js";
import { buildMemoryIntegratorUserMessage } from "./messages.js";

export type MemoryIntegratorSessionContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SessionContext & {
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embeddingModel: EmbeddingModel;
  namespace: string;
  agentId?: string;
  agentName?: string;
  /** When set, caps {@code memory_search} calls per session run (fresh counter each {@code onAfterContext}). */
  memorySearchBudgetMax?: number;
  toolkitCtx?: ToolkitContext<MemorySearchEnv>;
  runtime?: ToolRuntimeContext<MemorySearchEnv>;
};

export type MemoryIntegratorSessionInput = {
  content: string;
  maxSteps: number;
};

export type MemoryIntegratorSessionOutput = {
  generation: IntegratorPipelineGeneration;
  plan: IntegratorPlanWire;
};

export function createMemoryIntegratorSessionRunner<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): SessionRunner<
  MemoryIntegratorSessionInput,
  MemoryIntegratorSessionOutput,
  MemoryIntegratorSessionContext<TNode, TEdge>
> {
  return async ({ agent, input, context }) => {
    const { model, client } = context;
    const { content, maxSteps } = input;

    if (!context.toolkitCtx || !context.runtime) {
      throw new Error(
        "memory integrator session context missing toolkit/runtime (onAfterContext hook)",
      );
    }

    const affordances = await evaluateRegisteredAgentAffordances(agent, context.toolkitCtx);

    const integratorAgent = createMemoryIntegratorAgent({
      model,
      identity: agent,
      affordances,
      runtime: context.runtime,
      maxSteps,
      ontology: client.ontology,
    });

    const messages = [buildMemoryIntegratorUserMessage({ content })];
    const generation = await integratorAgent.generate({ messages });

    const raw = generation.output as unknown;
    const plan = parseIntegratorPlanWire(client.ontology, raw);

    return { generation, plan };
  };
}

export function memoryIntegratorRegistryRegistration<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): RegisterAgentOptions<
  MemoryIntegratorSessionInput,
  MemoryIntegratorSessionOutput,
  MemoryIntegratorSessionContext<TNode, TEdge>
> {
  return {
    run: createMemoryIntegratorSessionRunner<TNode, TEdge>(),
    hooks: {
      async onAfterContext(args) {
        const { context: ctx } = args;
        ctx.toolkitCtx = buildMemorySearchToolkitContext({
          client: ctx.client,
          namespace: ctx.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
          ...(ctx.memorySearchBudgetMax !== undefined
            ? { memorySearchBudgetMax: ctx.memorySearchBudgetMax }
            : {}),
        });
        ctx.runtime = buildMemorySearchToolRuntimeContext({
          client: ctx.client,
          namespace: ctx.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
          ...(ctx.memorySearchBudgetMax !== undefined
            ? { memorySearchBudgetMax: ctx.memorySearchBudgetMax }
            : {}),
        });
      },
    },
  };
}
