import type { Database } from "bun:sqlite";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Librarian, listSourceMapsForMemory } from "@cfd/librarian";
import {
  MemoriesClient,
  type ResolvedSource,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@cfd/memories-core";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-core-persistence/sqlite";
import { JsonlStore } from "@cfd/stores";
import { canonicalOntology } from "@cfd/memories-core-ontologies";
import { elapsedMs, logger } from "../logger.js";
import { ensureParentDirForDb, resolveGeminiApiKey } from "../shared.js";
import type { Parsed } from "./parse-args.js";

const SEARCH_RESOLVE_SOURCE_MAPS_LIMIT = 5;
const SEARCH_MAX_NEIGHBORS = 5;

async function resolveSourcesForMemory(
  db: Database,
  store: JsonlStore,
  memoryId: string,
  limit: number,
): Promise<Array<{ sourceKey: string; content: ResolvedSource | null }>> {
  const maps = listSourceMapsForMemory(db, memoryId, limit);
  const out: Array<{ sourceKey: string; content: ResolvedSource | null }> = [];
  for (const sm of maps) {
    let content: ResolvedSource | null = null;
    try {
      content = await store.resolve(sm);
    } catch {
      content = null;
    }
    out.push({ sourceKey: sm.source_key, content });
  }
  return out;
}

export async function cmdSearch(args: Parsed): Promise<void> {
  const tPipeline = performance.now();
  ensureParentDirForDb(args.db);
  const db = openMemoriesDatabase(args.db);
  const persistence = createMemoriesPersistence(db);
  const store = new JsonlStore(args.store);
  const apiKey = resolveGeminiApiKey();
  const google = createGoogleGenerativeAI({ apiKey });
  const client = new MemoriesClient(persistence, canonicalOntology);
  const librarian = new Librarian({
    client,
    embedding: {
      model: google.embedding("gemini-embedding-2-preview"),
      resolution: args.resolution,
    },
    multimodal: false,
  });
  const tEmbed = performance.now();
  const embeddings = await librarian.embedTextChunks([args.query ?? ""]);
  logger.info({
    phase: "cli.search.embedQuery",
    durationMs: elapsedMs(tEmbed),
    resolution: args.resolution,
  });

  const tSearch = performance.now();
  const hits = await searchAsync(
    { persistence: wrapSyncMemoriesPersistenceAsAsync(persistence) },
    {
      namespace: args.namespace,
      content: { text: args.query ?? "", vector: embeddings[0] },
      options: {
        topK: 10,
        arms: { lexical: 1, vector: 1 },
        neighbors: true,
        maxNeighbors: SEARCH_MAX_NEIGHBORS,
      },
    },
  );
  logger.info({
    phase: "cli.search.searchAsync",
    durationMs: elapsedMs(tSearch),
    hitCount: hits.length,
  });

  const tEnrich = performance.now();
  for (const h of hits) {
    let content: ResolvedSource | null = null;
    try {
      content = await store.resolve(h);
    } catch {
      content = null;
    }

    const neighbors =
      h.neighbors &&
      (await Promise.all(
        h.neighbors.map(async (n) => ({
          memoryKey: n.key,
          labels: n.labels,
          sources: await resolveSourcesForMemory(
            db,
            store,
            n._id,
            SEARCH_RESOLVE_SOURCE_MAPS_LIMIT,
          ),
        })),
      ));

    console.log(
      JSON.stringify({
        score: h.score,
        memoryKey: h.memory.key,
        sourceKey: h.source_key,
        labels: h.labels,
        content,
        neighbors,
      }),
    );
  }
  logger.info({
    phase: "cli.search.enrichHits",
    durationMs: elapsedMs(tEnrich),
    hitCount: hits.length,
  });
  logger.info({
    phase: "cli.search",
    durationMs: elapsedMs(tPipeline),
    namespace: args.namespace,
  });
}
