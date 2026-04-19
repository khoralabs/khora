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
import { type ExpandedMemoryWire, zExpandedMemoryWireFromOntology } from "./adapter-output.js";
import type { AdapterPipelineGeneration } from "./create-adapter-agent.js";
import { createMemoryAdapterAgent } from "./create-adapter-agent.js";
import { buildMemoryAdapterUserMessage } from "./messages.js";
import type { AdapterIngestContext, ExpandedMemoryDraft } from "./types.js";

export type MemoryAdapterSessionContext<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SessionContext & {
  model: LanguageModel;
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  embeddingModel: EmbeddingModel;
  namespace: string;
  agentId?: string;
  agentName?: string;
  toolkitCtx?: ToolkitContext<MemorySearchEnv>;
  runtime?: ToolRuntimeContext<MemorySearchEnv>;
};

/** Domain payload is app-defined; validate at the host before calling the adapter. */
export type MemoryAdapterSessionInput<TDomain = unknown> = {
  ingest: AdapterIngestContext;
  domainPayload: TDomain;
  maxSteps: number;
};

export type MemoryAdapterSessionOutput = {
  generation: AdapterPipelineGeneration;
  draft: ExpandedMemoryDraft;
};

export function createMemoryAdapterSessionRunner<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): SessionRunner<
  MemoryAdapterSessionInput<unknown>,
  MemoryAdapterSessionOutput,
  MemoryAdapterSessionContext<TNode, TEdge>
> {
  return async ({ agent, input, context }) => {
    const { model } = context;
    const { ingest, domainPayload, maxSteps } = input;

    if (!context.toolkitCtx || !context.runtime) {
      throw new Error(
        "memory adapter session context missing toolkit/runtime (onAfterContext hook)",
      );
    }

    const affordances = await evaluateRegisteredAgentAffordances(agent, context.toolkitCtx);

    const adapterAgent = createMemoryAdapterAgent({
      model,
      identity: agent,
      affordances,
      runtime: context.runtime,
      ontology: context.client.ontology,
      maxSteps,
    });

    const messages = [buildMemoryAdapterUserMessage({ ingest, domainPayload })];
    const generation = await adapterAgent.generate({ messages });

    const wire = zExpandedMemoryWireFromOntology(context.client.ontology);
    const out = wire.safeParse(generation.output);
    if (!out.success) {
      throw new Error(
        `Memory adapter structured output failed validation (steps=${generation.steps.length}, finishReason=${String(generation.finishReason)}): ${out.error.message}`,
      );
    }
    const v = out.data as ExpandedMemoryWire;
    if (!v.plaintext?.trim()) {
      throw new Error(
        `Memory adapter did not produce usable plaintext (steps=${generation.steps.length}, finishReason=${String(generation.finishReason)})`,
      );
    }

    const draft: ExpandedMemoryDraft = {
      plaintext: v.plaintext.trim(),
      memoryKeySuggestion: v.memoryKeySuggestion?.trim(),
      nodeLabelHints: v.nodeLabelHints,
      edgeLabelHints: v.edgeLabelHints,
    };

    return { generation, draft };
  };
}

export function memoryAdapterRegistryRegistration<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): RegisterAgentOptions<
  MemoryAdapterSessionInput<unknown>,
  MemoryAdapterSessionOutput,
  MemoryAdapterSessionContext<TNode, TEdge>
> {
  return {
    run: createMemoryAdapterSessionRunner<TNode, TEdge>(),
    hooks: {
      async onAfterContext(args) {
        const { context: ctx, input } = args;
        ctx.toolkitCtx = buildMemorySearchToolkitContext({
          client: ctx.client,
          namespace: ctx.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
        });
        ctx.runtime = buildMemorySearchToolRuntimeContext({
          client: ctx.client,
          namespace: ctx.namespace,
          embeddingModel: ctx.embeddingModel,
          agentId: ctx.agentId,
          agentName: ctx.agentName,
        });
        void input;
      },
    },
  };
}
