import {
  catalogSchemaJsonForEdgeKind,
  catalogSchemaJsonForNodeKind,
  ids,
  type MergeMemoryParamsEdge,
  type MergeMemoryParamsNode,
  withDirectedEdgeProperties,
  zMergeMemoryContentItem,
  zNamespacePath,
} from "@cfd/memories-core";
import { zVectorPayload } from "@cfd/memories-core/persistence";
import { computeSourceMapContentHash } from "@cfd/memories-core/provenance";
import type { MutationCtx } from "../_generated/server.js";
import { listNeighborMemoryKeysForNode } from "./helpers.js";
import { syncLabelPropsSearchFeaturesImpl } from "./labelPropsSearch.js";
import {
  clearMemorySubtreeImpl,
  ensureEdgeLabelImpl,
  ensureNodeLabelImpl,
  findMemoryIdByKey,
  insertEdgeImpl,
  insertEdgeLabelAssignmentImpl,
  insertLexicalFeatureImpl,
  insertNodeLabelAssignmentImpl,
  insertSourceMapImpl,
  insertVectorFeatureImpl,
  nodeExists,
  syncMemorySearchMetaImpl,
  upsertMemoryImpl,
  upsertNodeForMemoryKeyImpl,
} from "./mergeWrites.js";
import { appendProvenanceEventImpl, updateSourceMapContentHashImpl } from "./provenanceConvex.js";

export type MergeMemoryAtomicInput =
  | (MergeMemoryParamsNode & { now: number })
  | (MergeMemoryParamsEdge & { now: number });

/**
 * Single-transaction merge matching {@link mergeMemoryAsync} order for node merges; edge merges
 * clear edge-attached subtree → insert/replace edge → upsert memory → content → edge labels → meta sync.
 */
export async function runMergeMemoryAtomic(
  ctx: MutationCtx,
  raw: MergeMemoryAtomicInput,
): Promise<string[]> {
  const namespace = zNamespacePath.parse(raw.namespace);
  const now = raw.now;

  for (const item of raw.content) {
    zMergeMemoryContentItem.parse(item);
    if (item.vector !== undefined) zVectorPayload.parse(item.vector);
  }
  if (raw.searchMetaVector !== undefined && raw.searchMetaVector.length > 0) {
    zVectorPayload.parse(raw.searchMetaVector);
  }

  if (raw.kind === "edge") {
    return runMergeMemoryAtomicEdge(ctx, raw, namespace, now);
  }
  return runMergeMemoryAtomicNode(ctx, raw, namespace, now);
}

async function runMergeMemoryAtomicNode(
  ctx: MutationCtx,
  raw: MergeMemoryParamsNode & { now: number },
  namespace: string,
  now: number,
): Promise<string[]> {
  const params = raw;
  const memoryId = ids.memory(namespace, params.key);
  const nodeId = ids.node(namespace, params.key);

  const oldNeighborKeys = await listNeighborMemoryKeysForNode(ctx, namespace, nodeId);
  await clearMemorySubtreeImpl(ctx, { memoryKind: "node", memoryId, nodeId });
  await upsertMemoryImpl(ctx, {
    namespace,
    key: params.key,
    now,
    kind: "node",
    edgeId: null,
  });
  await upsertNodeForMemoryKeyImpl(ctx, {
    namespace,
    memoryKey: params.key,
    properties: params.properties,
    now,
  });

  const contentHashes: Record<string, string> = {};
  for (const rawItem of params.content) {
    const item = zMergeMemoryContentItem.parse(rawItem);
    const { sourceMapId } = await insertSourceMapImpl(ctx, {
      memoryId,
      sourceKey: item.key,
      now,
    });
    const vec = item.vector !== undefined ? new Float32Array(item.vector) : undefined;
    if (item.text !== undefined) {
      await insertLexicalFeatureImpl(ctx, {
        memoryId,
        sourceMapId,
        text: item.text,
        now,
      });
    }
    if (item.vector !== undefined) {
      await insertVectorFeatureImpl(ctx, {
        memoryId,
        sourceMapId,
        vector: item.vector,
        now,
      });
    }
    const hash = computeSourceMapContentHash({
      text: item.text,
      vector: vec,
    });
    await updateSourceMapContentHashImpl(ctx, { sourceMapId, contentHash: hash });
    contentHashes[item.key] = hash;
  }

  const labelByKind = new Map(params.labels.map((l) => [l.kind, l] as const));
  for (const l of labelByKind.values()) {
    const labelId = await ensureNodeLabelImpl(ctx, {
      kind: l.kind,
      description: "",
      schemaJson: catalogSchemaJsonForNodeKind(params.ontology, l.kind) || null,
      now,
    });
    await insertNodeLabelAssignmentImpl(ctx, {
      nodeId,
      labelId,
      props: l.props as Record<string, unknown>,
      now,
    });
  }

  for (const edge of params.edges ?? []) {
    if ((await findMemoryIdByKey(ctx, namespace, edge.memory_key)) === undefined) {
      throw new Error(
        `mergeMemoryAtomic: unknown edge target memory_key=${edge.memory_key} in namespace=${namespace}`,
      );
    }
    const otherNodeId = ids.node(namespace, edge.memory_key);
    if (!(await nodeExists(ctx, otherNodeId))) {
      throw new Error(`mergeMemoryAtomic: target node missing for memory_key=${edge.memory_key}`);
    }
    const fromNodeId = edge.direction === "out" ? nodeId : otherNodeId;
    const toNodeId = edge.direction === "out" ? otherNodeId : nodeId;
    const { edgeId } = await insertEdgeImpl(ctx, {
      fromNodeId,
      toNodeId,
      properties: withDirectedEdgeProperties(edge.properties),
      idParts: {
        label: edge.label.kind,
        selfMemoryKey: params.key,
        otherMemoryKey: edge.memory_key,
      },
      now,
    });
    const edgeLabelId = await ensureEdgeLabelImpl(ctx, {
      kind: edge.label.kind,
      description: "",
      schemaJson: catalogSchemaJsonForEdgeKind(params.ontology, edge.label.kind) || null,
      now,
    });
    await insertEdgeLabelAssignmentImpl(ctx, {
      edgeId,
      labelId: edgeLabelId,
      props: edge.label.props as Record<string, unknown>,
      now,
    });
  }

  const newNeighborKeys = (params.edges ?? []).map((e) => e.memory_key);
  const syncKeys = new Set([params.key, ...oldNeighborKeys, ...newNeighborKeys]);
  const primaryMeta =
    params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
      ? params.searchMetaVector
      : undefined;
  for (const k of syncKeys) {
    await syncMemorySearchMetaImpl(ctx, {
      namespace,
      memoryKey: k,
      now,
      metaVector: k === params.key ? primaryMeta : undefined,
    });
    await syncLabelPropsSearchFeaturesImpl(ctx, { namespace, memoryKey: k, now });
  }

  const sourceKeysSorted = params.content
    .map((rawItem) => zMergeMemoryContentItem.parse(rawItem).key)
    .sort((a, b) => a.localeCompare(b));
  const sortedHashes =
    Object.keys(contentHashes).length > 0
      ? Object.fromEntries(
          Object.keys(contentHashes)
            .sort((a, b) => a.localeCompare(b))
            .map((k) => [k, contentHashes[k]!]),
        )
      : undefined;
  await appendProvenanceEventImpl(ctx, {
    now,
    event: {
      v: 1,
      kind: "MERGE_MEMORY",
      namespace,
      memory_key: params.key,
      memory_id: memoryId,
      source_keys: sourceKeysSorted,
      ...(sortedHashes !== undefined ? { content_hashes: sortedHashes } : {}),
    },
  });

  return Array.from(syncKeys).sort((a, b) => a.localeCompare(b));
}

async function runMergeMemoryAtomicEdge(
  ctx: MutationCtx,
  raw: Extract<MergeMemoryAtomicInput, { kind: "edge" }>,
  namespace: string,
  now: number,
): Promise<string[]> {
  const params = raw;
  const memoryId = ids.memory(namespace, params.key);
  const { from_key: fromKey, to_key: toKey } = params.edge;
  const fromNodeId = ids.node(namespace, fromKey);
  const toNodeId = ids.node(namespace, toKey);
  if (!(await nodeExists(ctx, fromNodeId))) {
    throw new Error(`mergeMemoryAtomic: node missing for edge.from_key=${fromKey}`);
  }
  if (!(await nodeExists(ctx, toNodeId))) {
    throw new Error(`mergeMemoryAtomic: node missing for edge.to_key=${toKey}`);
  }

  const edgeId = ids.edge(fromNodeId, toNodeId, params.edge.label.kind, fromKey, toKey);

  await clearMemorySubtreeImpl(ctx, { memoryKind: "edge", memoryId, edgeId });

  const { edgeId: persistedEdgeId } = await insertEdgeImpl(ctx, {
    fromNodeId,
    toNodeId,
    properties: withDirectedEdgeProperties(params.edge.properties),
    idParts: {
      label: params.edge.label.kind,
      selfMemoryKey: fromKey,
      otherMemoryKey: toKey,
    },
    now,
  });
  if (persistedEdgeId !== edgeId) {
    throw new Error("mergeMemoryAtomic: edge id mismatch between preview and insertEdge");
  }

  await upsertMemoryImpl(ctx, {
    namespace,
    key: params.key,
    now,
    kind: "edge",
    edgeId,
  });

  const contentHashes: Record<string, string> = {};
  for (const rawItem of params.content) {
    const item = zMergeMemoryContentItem.parse(rawItem);
    const { sourceMapId } = await insertSourceMapImpl(ctx, {
      memoryId,
      sourceKey: item.key,
      now,
    });
    const vec = item.vector !== undefined ? new Float32Array(item.vector) : undefined;
    if (item.text !== undefined) {
      await insertLexicalFeatureImpl(ctx, {
        memoryId,
        sourceMapId,
        text: item.text,
        now,
      });
    }
    if (item.vector !== undefined) {
      await insertVectorFeatureImpl(ctx, {
        memoryId,
        sourceMapId,
        vector: item.vector,
        now,
      });
    }
    const hash = computeSourceMapContentHash({
      text: item.text,
      vector: vec,
    });
    await updateSourceMapContentHashImpl(ctx, { sourceMapId, contentHash: hash });
    contentHashes[item.key] = hash;
  }

  const edgeLabelId = await ensureEdgeLabelImpl(ctx, {
    kind: params.edge.label.kind,
    description: "",
    schemaJson: catalogSchemaJsonForEdgeKind(params.ontology, params.edge.label.kind) || null,
    now,
  });
  await insertEdgeLabelAssignmentImpl(ctx, {
    edgeId,
    labelId: edgeLabelId,
    props: params.edge.label.props as Record<string, unknown>,
    now,
  });

  const syncKeys = new Set([params.key, fromKey, toKey]);
  const primaryMeta =
    params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
      ? params.searchMetaVector
      : undefined;
  for (const k of syncKeys) {
    await syncMemorySearchMetaImpl(ctx, {
      namespace,
      memoryKey: k,
      now,
      metaVector: k === params.key ? primaryMeta : undefined,
    });
    await syncLabelPropsSearchFeaturesImpl(ctx, { namespace, memoryKey: k, now });
  }

  const sourceKeysSorted = params.content
    .map((rawItem) => zMergeMemoryContentItem.parse(rawItem).key)
    .sort((a, b) => a.localeCompare(b));
  const sortedHashes =
    Object.keys(contentHashes).length > 0
      ? Object.fromEntries(
          Object.keys(contentHashes)
            .sort((a, b) => a.localeCompare(b))
            .map((k) => [k, contentHashes[k]!]),
        )
      : undefined;
  await appendProvenanceEventImpl(ctx, {
    now,
    event: {
      v: 1,
      kind: "MERGE_MEMORY",
      namespace,
      memory_key: params.key,
      memory_id: memoryId,
      source_keys: sourceKeysSorted,
      ...(sortedHashes !== undefined ? { content_hashes: sortedHashes } : {}),
    },
  });

  return Array.from(syncKeys).sort((a, b) => a.localeCompare(b));
}
