import { type AgentRegistry, createAgentRegistry } from "@cfd/agent-identity";
import type { MemoriesClient, MemoriesClientAsync } from "@cfd/memories-core";
import {
  decomposeLogicalMemoryToContent,
  type EmbeddingModel,
  type LogicalMemoryInput,
  mergeLogicalMemoryWithMergeSlice,
  type ProcessedLogicalMemory,
} from "@cfd/memories-core/helpers";
import { DEFAULT_MEMORY_TOOL_LOOP_MAX_STEPS } from "@cfd/memories-tools";
import type { LanguageModel } from "ai";
import type z from "zod";
import { MemoryIntegratorClient } from "./client.js";
import type { IntegratorPipelineGeneration } from "./create-integrator-agent.js";
import type { DefineMemoryIntegratorIdentityOptions } from "./identity.js";
import type { IntegratorPlanWire } from "./integrator-output.js";
import { integratorWireToMergeSlice } from "./to-merge-slice.js";

function buildIntegratorContent(processed: ProcessedLogicalMemory): string {
  if (processed.plaintext?.trim()) {
    return processed.plaintext.trim();
  }
  const parts = processed.content
    .map((c) => c.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  if (parts.length === 0) {
    throw new Error("integrator: no text in logical memory content to integrate");
  }
  return parts.join("\n\n");
}

const DEFAULT_MULTIMODAL = false;

/**
 * Decompose → {@link MemoryIntegratorClient} (search + structured plan) → merge + search-meta vectors.
 * Host supplies chat/embedding models (CLI wires Gemini; demos may reuse the same).
 */
export async function processLogicalMemoryWithIntegrator<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(args: {
  client: MemoriesClient<TNode, TEdge> | MemoriesClientAsync<TNode, TEdge>;
  logicalMemory: LogicalMemoryInput;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  maxSteps?: number;
  multimodal?: boolean;
  /** Defaults to `{ app: "cfd-cli" }` identity when omitted. */
  integratorClient?: MemoryIntegratorClient<TNode, TEdge>;
  integratorClientOptions?: DefineMemoryIntegratorIdentityOptions;
  /**
   * When {@link integratorClient} is built internally, use this registry (e.g. shared with adapter).
   */
  registry?: AgentRegistry;
  /** Caps {@code memory_search} per integrator run when set. */
  memorySearchBudgetMax?: number;
}): Promise<{
  processedLogicalMemory: ProcessedLogicalMemory;
  plan: IntegratorPlanWire;
  generation: IntegratorPipelineGeneration;
}> {
  const {
    client,
    logicalMemory,
    chatModel,
    embeddingModel,
    maxSteps = DEFAULT_MEMORY_TOOL_LOOP_MAX_STEPS,
    multimodal = DEFAULT_MULTIMODAL,
  } = args;

  const processedContent = await decomposeLogicalMemoryToContent({
    ...logicalMemory,
    embedding: { embeddingModel, multimodal },
  });
  const processedLogicalMemory: ProcessedLogicalMemory = {
    ...logicalMemory,
    content: processedContent,
  };

  const content = buildIntegratorContent(processedLogicalMemory);

  const integratorClient =
    args.integratorClient ??
    new MemoryIntegratorClient({
      ...args.integratorClientOptions,
      identityContext: args.integratorClientOptions?.identityContext ?? { app: "cfd-cli" },
      registry: args.registry ?? createAgentRegistry(),
      namespace: logicalMemory.namespace,
      model: chatModel,
      client,
      embeddingModel,
    });

  const { plan, generation } = await integratorClient.integrate({
    content,
    maxSteps,
    ...(args.memorySearchBudgetMax !== undefined
      ? { memorySearchBudgetMax: args.memorySearchBudgetMax }
      : {}),
  });

  const slice = integratorWireToMergeSlice(client.ontology, plan);
  await mergeLogicalMemoryWithMergeSlice(client, processedLogicalMemory, slice, embeddingModel);

  return { processedLogicalMemory, plan, generation };
}
