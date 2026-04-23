import {
  MemoriesClient,
  type ResolvedSource,
  searchAsync,
  wrapSyncMemoriesPersistenceAsAsync,
} from "@cfd/memories-core";
import { embedTextChunks } from "@cfd/memories-core/helpers";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import { JsonlStore } from "@cfd/memories-stores";
import { elapsedMs, logger } from "../logger.js";
import { getCliEmbeddingModel, getMemoriesBundle } from "../shared.js";
import type { ParsedSearch } from "./parse-args.js";

const SEARCH_RESOLVE_SOURCE_MAPS_LIMIT = 5;
const SEARCH_MAX_NEIGHBORS = 5;

export async function cmdSearch(args: ParsedSearch): Promise<void> {
  const tPipeline = performance.now();
  const { persistence } = getMemoriesBundle(args.db);
  const store = new JsonlStore(args.store);
  const client = new MemoriesClient(persistence, canonicalOntology, { store });
  const embeddingModel = getCliEmbeddingModel(args.db, args.resolution);
  const tEmbed = performance.now();
  const embeddings = await embedTextChunks(embeddingModel, [args.query ?? ""]);
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
          sources: await client.resolveSourcesForMemory(
            args.namespace,
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
