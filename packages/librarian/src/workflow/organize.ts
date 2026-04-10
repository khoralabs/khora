import {
  buildCanonicalMemorySearchMetaText,
  type DbCtx,
  type MemoriesClient,
  type MergeMemoryContentItem,
  type SearchContent,
  type TypedSearchHit,
  upsertMemorySearchMetaVector,
  validateEdgeLabel,
  validateNodeLabel,
} from "@cfd/memories";
import type z from "zod";
import { type EmbeddingModel, embedTextChunks } from "../adapters/embedding-model";
import type { ProcessedLogicalMemory } from "./logical-memory";
import { type LibrarianMergePlanWire, parseLibrarianMergePlan } from "./plan";

/** Strip merge `key` and narrow optional fields to {@link SearchContent}. */
export function mergeMemoryItemToSearchContent(item: MergeMemoryContentItem): SearchContent {
  const { text, vector } = item;
  if (text !== undefined && vector !== undefined) {
    return { text, vector };
  }
  if (text !== undefined) {
    return { text };
  }
  if (vector !== undefined) {
    return { vector };
  }
  throw new Error("MergeMemoryContentItem must include text and/or vector");
}

export function prefetchRelatedMemories<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  client: MemoriesClient<TNode, TEdge>,
  namespace: string,
  contentItems: MergeMemoryContentItem[],
): TypedSearchHit<TNode, TEdge>[] {
  const contentSearchHits = [];
  const seenHits = new Set<string>();
  for (const item of contentItems) {
    const hits = client.search({
      namespace,
      content: mergeMemoryItemToSearchContent(item),
      options: {
        topK: 10,
        minScore: 0.5,
      },
    });
    for (const hit of hits) {
      if (seenHits.has(hit.memory._id)) continue;
      seenHits.add(hit.memory._id);
      contentSearchHits.push(hit);
    }
  }

  return contentSearchHits;
}

/**
 * After the librarian produces labels/edges (wire JSON), run the embedding pipeline and merge.
 * Order: **plan** (labels/edges) is applied together with **content** from {@link decomposeLogicalMemoryToContent}.
 */
export async function mergeLogicalMemoryWithPlan<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(
  client: MemoriesClient<TNode, TEdge>,
  processedLogicalMemory: ProcessedLogicalMemory,
  plan: LibrarianMergePlanWire,
  embeddingModel: EmbeddingModel,
): Promise<void> {
  const slice = parseLibrarianMergePlan(client.ontology, plan);

  const metaSyncedKeys = client.mergeMemory({
    key: processedLogicalMemory.key,
    namespace: processedLogicalMemory.namespace,
    content: processedLogicalMemory.content,
    labels: slice.labels,
    edges: slice.edges,
    properties: slice.properties,
  });

  const namespace = processedLogicalMemory.namespace;
  const readCtx: DbCtx = { db: client.db, now: Date.now() };
  const pairs = metaSyncedKeys
    .map((memoryKey) => ({
      memoryKey,
      text: buildCanonicalMemorySearchMetaText(readCtx, namespace, memoryKey),
    }))
    .filter((p) => p.text.length > 0);

  if (pairs.length === 0) return;

  const embeddings = await embedTextChunks(
    embeddingModel,
    pairs.map((p) => p.text),
  );
  if (embeddings.length !== pairs.length) {
    throw new Error(
      `mergeLogicalMemoryWithPlan: expected ${pairs.length} search-meta embeddings, got ${embeddings.length}`,
    );
  }

  client.db.transaction(() => {
    const d: DbCtx = { db: client.db, now: Date.now() };
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const vec = embeddings[i];
      if (pair === undefined || vec === undefined || vec.length === 0) {
        throw new Error("mergeLogicalMemoryWithPlan: missing embedding for search-meta batch");
      }
      upsertMemorySearchMetaVector(d, {
        namespace,
        memoryKey: pair.memoryKey,
        vector: new Float32Array(vec),
      });
    }
  });
}
