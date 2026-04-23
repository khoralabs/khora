import { createAgentRegistry } from "@cfd/agent-identity";
import { expandedDraftToLogicalMemoryInput, MemoryAdapterClient } from "@cfd/memories-adapter";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { processLogicalMemoryWithIntegrator } from "@cfd/memories-integrator";
import type { LanguageModel } from "ai";
import { matchmakingPersonas } from "../personas/index.ts";
import type { MatchmakingPersona } from "../personas/types.ts";
import type { MatchmakingMemoriesBundle } from "./create-memories-bundle.ts";
import type { MeetingSeedPayload } from "./meeting-seed-payload.ts";
import {
  jsonlStorePathForNamespace,
  resolveMemoriesRoot,
  rewriteNamespaceJsonlFromPersistence,
} from "./persisted-memories.ts";

const SEED_MEMORY_SEARCH_BUDGET_MAX = 3;

/** Adapter → integrator pipeline per seed (same as matchmaking session seed path). */
export async function seedPersonaMemoryNamespace(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  namespace: string;
  seeds: readonly MeetingSeedPayload[];
}): Promise<void> {
  const { bundle, chatModel, embeddingModel, namespace, seeds } = args;
  const adapterClient = new MemoryAdapterClient({
    identityContext: { app: "obp-demo", product: "matchmaking-seed" },
  });

  for (let index = 0; index < seeds.length; index++) {
    const payload = seeds[index];
    if (payload === undefined) {
      continue;
    }
    const registry = createAgentRegistry();
    const { draft } = await adapterClient.expand({
      registry,
      namespace,
      model: chatModel,
      client: bundle.client,
      embeddingModel,
      ingest: {
        sourceApp: "obp-demo-matchmaking",
        correlationId: `seed-${namespace}-${index}`,
      },
      domainPayload: payload,
      /** Empty KG → adapter often burns steps on memory_search before emitting structured output; keep headroom. */
      maxSteps: 12,
      memorySearchBudgetMax: SEED_MEMORY_SEARCH_BUDGET_MAX,
    });

    const key = `seed-${index}`;
    const logicalMemory = expandedDraftToLogicalMemoryInput(draft, namespace, key);
    await processLogicalMemoryWithIntegrator({
      client: bundle.client,
      logicalMemory,
      chatModel,
      embeddingModel,
      maxSteps: 6,
      memorySearchBudgetMax: SEED_MEMORY_SEARCH_BUDGET_MAX,
      integratorClientOptions: {
        identityContext: { app: "obp-demo", product: "matchmaking-seed" },
      },
    });
  }
}

/**
 * Seeds every registered persona in {@link matchmakingPersonas} into SQLite and rewrites each namespace JSONL from persistence.
 */
export async function seedAllMatchmakingPersonaMemories(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  personas?: readonly MatchmakingPersona[];
  memoriesRoot?: string;
}): Promise<void> {
  const personas = args.personas ?? (Object.values(matchmakingPersonas) as MatchmakingPersona[]);
  const memoriesRoot = args.memoriesRoot ?? resolveMemoriesRoot();
  const { bundle, chatModel, embeddingModel } = args;
  for (const p of personas) {
    await seedPersonaMemoryNamespace({
      bundle,
      chatModel,
      embeddingModel,
      namespace: p.memoryNamespace,
      seeds: p.memorySeeds,
    });
  }
  for (const p of personas) {
    rewriteNamespaceJsonlFromPersistence(
      bundle,
      p.memoryNamespace,
      jsonlStorePathForNamespace(memoriesRoot, p.memoryNamespace),
    );
  }
}

/**
 * Adapter → integrator pipeline per seed (same as CLI todo-add), in order: all requester memories, then requestee.
 */
export async function seedMatchmakingPersonas(args: {
  bundle: MatchmakingMemoriesBundle;
  chatModel: LanguageModel;
  embeddingModel: EmbeddingModel;
  partyMemoryNamespaces: readonly [string, string];
  personaSeeds: readonly [MeetingSeedPayload[], MeetingSeedPayload[]];
}): Promise<void> {
  const { bundle, chatModel, embeddingModel, partyMemoryNamespaces, personaSeeds } = args;
  const [nsA, nsB] = partyMemoryNamespaces;
  const [seedsA, seedsB] = personaSeeds;
  await seedPersonaMemoryNamespace({
    bundle,
    chatModel,
    embeddingModel,
    namespace: nsA,
    seeds: seedsA,
  });
  await seedPersonaMemoryNamespace({
    bundle,
    chatModel,
    embeddingModel,
    namespace: nsB,
    seeds: seedsB,
  });
}
