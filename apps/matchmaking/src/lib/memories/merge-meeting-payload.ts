import { createAgentRegistry } from "@cfd/agent-identity";
import { expandedDraftToLogicalMemoryInput, MemoryAdapterClient } from "@cfd/memories-adapter";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { processLogicalMemoryWithIntegrator } from "@cfd/memories-integrator";
import type { LanguageModel } from "ai";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";
import {
  matchmakingAdapterInstructions,
  matchmakingIntegratorInstructions,
} from "./matchmaking-memories-instructions.ts";
import type { MeetingSeedPayload } from "./meeting-seed-payload.ts";

const MERGE_MEMORY_SEARCH_BUDGET_MAX = 1;

const MERGE_MAX_ADAPTER_STEPS = 12;
const MERGE_MAX_INTEGRATOR_STEPS = 6;

/**
 * One adapter → integrator pass for a structured meeting-domain payload.
 * Used by seeding, live session invite merge, and post-negotiation API merges.
 */
export async function mergeMeetingDomainPayloadIntoNamespace(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  namespace: string;
  memoryKey: string;
  domainPayload: MeetingSeedPayload;
  /** Correlates expand + integrator; keep stable for idempotent retries. */
  correlationId: string;
}): Promise<void> {
  const { bundle, chatModel, embeddingModel, namespace, memoryKey, domainPayload, correlationId } =
    args;
  const registry = createAgentRegistry();
  const adapterClient = new MemoryAdapterClient({
    identityContext: { app: "obp-demo", product: "matchmaking-seed" },
    instructions: [matchmakingAdapterInstructions],
    registry,
    namespace,
    model: chatModel,
    client: bundle.client,
    embeddingModel,
  });

  const { draft } = await adapterClient.expand({
    ingest: {
      sourceApp: "obp-demo-matchmaking",
      correlationId,
    },
    domainPayload,
    maxSteps: MERGE_MAX_ADAPTER_STEPS,
    memorySearchBudgetMax: MERGE_MEMORY_SEARCH_BUDGET_MAX,
  });

  const logicalMemory = {
    ...expandedDraftToLogicalMemoryInput(draft, namespace, memoryKey),
    key: memoryKey,
  };
  await processLogicalMemoryWithIntegrator({
    client: bundle.client,
    logicalMemory,
    chatModel,
    embeddingModel,
    registry,
    maxSteps: MERGE_MAX_INTEGRATOR_STEPS,
    memorySearchBudgetMax: MERGE_MEMORY_SEARCH_BUDGET_MAX,
    integratorClientOptions: {
      identityContext: { app: "obp-demo", product: "matchmaking-seed" },
      instructions: [matchmakingIntegratorInstructions],
    },
  });
}
