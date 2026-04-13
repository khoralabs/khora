import { createAgentRegistry } from "@cfd/agent-identity";
import {
  decomposeLogicalMemoryToContent,
  type EmbeddingResolutionPreset,
  type LogicalMemoryInput,
  mergeLogicalMemoryWithMergeSlice,
  type ProcessedLogicalMemory,
} from "@cfd/memories-core/helpers";
import {
  type IntegratorPipelineGeneration,
  type IntegratorPlanWire,
  integratorWireToMergeSlice,
  MemoryIntegratorClient,
} from "@cfd/memories-integrator";
import { getCliChatModel, getCliEmbeddingModel, type MemoriesCliBundle } from "./shared.js";

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

const CLI_MULTIMODAL = false;

/**
 * Decompose → {@link MemoryIntegratorClient} (search + structured plan) → merge + search-meta vectors.
 */
export async function processLogicalMemoryWithIntegrator(args: {
  bundle: MemoriesCliBundle;
  dbPath: string;
  resolution: EmbeddingResolutionPreset;
  logicalMemory: LogicalMemoryInput;
  maxSteps?: number;
}): Promise<{
  processedLogicalMemory: ProcessedLogicalMemory;
  plan: IntegratorPlanWire;
  generation: IntegratorPipelineGeneration;
}> {
  const { bundle, dbPath, resolution, logicalMemory, maxSteps = 6 } = args;
  const embeddingModel = getCliEmbeddingModel(dbPath, resolution);
  const processedContent = await decomposeLogicalMemoryToContent({
    ...logicalMemory,
    embedding: { embeddingModel, multimodal: CLI_MULTIMODAL },
  });
  const processedLogicalMemory: ProcessedLogicalMemory = {
    ...logicalMemory,
    content: processedContent,
  };

  const content = buildIntegratorContent(processedLogicalMemory);
  const registry = createAgentRegistry();
  const model = getCliChatModel();
  const integratorClient = new MemoryIntegratorClient({
    identityContext: { app: "cfd-cli" },
  });

  const { plan, generation } = await integratorClient.integrate({
    registry,
    namespace: logicalMemory.namespace,
    model,
    client: bundle.client,
    embeddingModel,
    content,
    maxSteps,
  });

  const slice = integratorWireToMergeSlice(bundle.client.ontology, plan);
  await mergeLogicalMemoryWithMergeSlice(
    bundle.client,
    processedLogicalMemory,
    slice,
    embeddingModel,
  );

  return { processedLogicalMemory, plan, generation };
}
