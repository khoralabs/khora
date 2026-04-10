import type { Database } from "bun:sqlite";
import z from "zod";
import {
  clearMemorySubtree,
  ensureEdgeLabel,
  ensureNodeLabel,
  findMemoryIdByKey,
  ids,
  insertEdge,
  insertEdgeLabelAssignment,
  insertNodeLabelAssignment,
  insertSourceMap,
  insertTextFeatureWithFts,
  insertVectorFeatureWithVecIndex,
  nodeExists,
  upsertMemory,
  upsertNodeForMemoryKey,
} from "../models";
import type { DbCtx } from "../models/context";
import {
  listNeighborMemoryKeysForNode,
  MEMORY_SEARCH_META_SOURCE_KEY,
  syncMemorySearchMeta,
} from "../models/memory-search-meta";

export {
  buildCanonicalMemorySearchMetaTextForMerge,
  MEMORY_SEARCH_META_SOURCE_KEY,
} from "../models/memory-search-meta";

export interface MutationCtx {
  db: Database;
}

/** Reject reserved / system `source_key` values (prefix `__` and the search-meta key). */
export const zUserSourceKey = z
  .string()
  .refine((k) => k !== MEMORY_SEARCH_META_SOURCE_KEY && !k.startsWith("__"), {
    message: "content key is reserved (system prefix __ or search meta key)",
  });

export type MergeMemoryContentItem = z.infer<typeof zMergeMemoryContentItem>;

/** Validates {@link MergeMemoryContentItem}; exported for callers that mirror merge validation. */
export const zMergeMemoryContentItem = z
  .object({
    key: zUserSourceKey,
    text: z.string().optional(),
    vector: z.array(z.number()).optional(),
  })
  .refine((v) => v.text !== undefined || v.vector !== undefined, {
    message: "content item must include text and/or vector",
  });

export interface MergeMemoryParams<NODE_LABEL = string, EDGE_LABEL = string> {
  key: string;
  namespace: string;
  content: MergeMemoryContentItem[];
  labels: NODE_LABEL[];
  properties?: Record<string, unknown>;
  edges?: Array<{
    memory_key: string;
    direction: "in" | "out";
    label: EDGE_LABEL;
    properties?: Record<string, unknown>;
  }>;
  /**
   * Optional embedding of canonical search-meta text (see `buildCanonicalMemorySearchMetaTextForMerge`)
   * for this memory only (same model/dim as content). Neighbor meta rows updated in the same txn stay
   * lexical-only until their own merge.
   */
  searchMetaVector?: number[];
}

/**
 * Orchestrates a memory merge: validates API input, then delegates storage to `models/*`.
 */
export function mergeMemory(ctx: MutationCtx, params: MergeMemoryParams<string, string>): void {
  const { db } = ctx;
  const now = Date.now();
  const d: DbCtx = { db, now };

  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  for (const item of params.content) {
    zMergeMemoryContentItem.parse(item);
  }

  const run = db.transaction(() => {
    const oldNeighborKeys = listNeighborMemoryKeysForNode(d, params.namespace, nodeId);
    clearMemorySubtree(d, memoryId, nodeId);
    upsertMemory(d, { namespace: params.namespace, key: params.key });
    upsertNodeForMemoryKey(d, {
      namespace: params.namespace,
      memoryKey: params.key,
      properties: params.properties,
    });

    for (const raw of params.content) {
      const item = zMergeMemoryContentItem.parse(raw);
      const { sourceMapId } = insertSourceMap(d, { memoryId, sourceKey: item.key });
      if (item.text !== undefined) {
        insertTextFeatureWithFts(d, { memoryId, sourceMapId, text: item.text });
      }
      if (item.vector !== undefined) {
        insertVectorFeatureWithVecIndex(d, {
          memoryId,
          sourceMapId,
          vector: new Float32Array(item.vector),
        });
      }
    }

    for (const label of [...new Set(params.labels)]) {
      const labelId = ensureNodeLabel(d, label);
      insertNodeLabelAssignment(d, { nodeId, labelId });
    }

    for (const edge of params.edges ?? []) {
      if (findMemoryIdByKey(d, params.namespace, edge.memory_key) === undefined) {
        throw new Error(
          `mergeMemory: unknown edge target memory_key=${edge.memory_key} in namespace=${params.namespace}`,
        );
      }
      const otherNodeId = ids.node(params.namespace, edge.memory_key);
      if (!nodeExists(d, otherNodeId)) {
        throw new Error(`mergeMemory: target node missing for memory_key=${edge.memory_key}`);
      }

      const fromNodeId = edge.direction === "out" ? nodeId : otherNodeId;
      const toNodeId = edge.direction === "out" ? otherNodeId : nodeId;
      const { edgeId } = insertEdge(d, {
        fromNodeId,
        toNodeId,
        properties: edge.properties,
        idParts: {
          label: edge.label,
          selfMemoryKey: params.key,
          otherMemoryKey: edge.memory_key,
        },
      });
      const edgeLabelId = ensureEdgeLabel(d, edge.label);
      insertEdgeLabelAssignment(d, { edgeId, labelId: edgeLabelId });
    }

    const newNeighborKeys = (params.edges ?? []).map((e) => e.memory_key);
    const syncKeys = new Set([params.key, ...oldNeighborKeys, ...newNeighborKeys]);
    const primaryMetaVec =
      params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
        ? new Float32Array(params.searchMetaVector)
        : undefined;
    for (const k of syncKeys) {
      syncMemorySearchMeta(d, {
        namespace: params.namespace,
        memoryKey: k,
        metaVector: k === params.key ? primaryMetaVec : undefined,
      });
    }
  });

  run();
}
