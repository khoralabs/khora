import {
  catalogSchemaJsonForEdgeKind,
  catalogSchemaJsonForNodeKind,
  ids,
  type MergeMemoryParamsEdge,
  type MergeMemoryParamsNode,
  type NamespacePath,
  withDirectedEdgeProperties,
  zMergeMemoryContentItem,
  zNamespacePath,
} from "@cfd/memories-core";
import { zVectorPayload } from "@cfd/memories-core/persistence";
import { computeSourceMapContentHash } from "@cfd/memories-core/provenance";
import type { MutationCtx } from "../_generated/server.js";
import { listNeighborMemoriesForNode } from "./helpers.js";
import { syncLabelPropsSearchFeaturesImpl } from "./labelPropsSearch.js";
import {
  clearMemorySubtreeImpl,
  ensureEdgeLabelImpl,
  ensureNodeLabelImpl,
  insertEdgeImpl,
  insertEdgeLabelAssignmentImpl,
  insertLexicalFeatureImpl,
  insertNodeLabelAssignmentImpl,
  insertSourceMapImpl,
  insertVectorFeatureImpl,
  loadMemoryNamespaceKeyImpl,
  nodeExists,
  syncMemorySearchMetaImpl,
  upsertMemoryImpl,
  upsertNodeForMemoryKeyImpl,
} from "./mergeWrites.js";
import { appendProvenanceEventImpl, updateSourceMapContentHashImpl } from "./provenanceConvex.js";
import { replaceMemoryScopesImpl } from "./scopesConvex.js";

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

  const oldNeighbors = await listNeighborMemoriesForNode(ctx, namespace, nodeId);
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
    memoryId,
    properties: params.properties,
    now,
  });

  const scopeIds = [...new Set([namespace, ...(params.attachScopes ?? [])])];
  await replaceMemoryScopesImpl(ctx, { memoryId, scopeIds, now });

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
    const peer = await loadMemoryNamespaceKeyImpl(ctx, edge.peer_memory_id);
    if (peer === undefined) {
      throw new Error(`mergeMemoryAtomic: unknown peer_memory_id=${edge.peer_memory_id}`);
    }
    const otherNodeId = ids.node(peer.namespace, peer.key);
    if (!(await nodeExists(ctx, otherNodeId))) {
      throw new Error(`mergeMemoryAtomic: target node missing for peer_memory_id=${edge.peer_memory_id}`);
    }

    const fromNodeId = edge.direction === "out" ? nodeId : otherNodeId;
    const toNodeId = edge.direction === "out" ? otherNodeId : nodeId;
    const fromMemoryId = edge.direction === "out" ? memoryId : edge.peer_memory_id;
    const toMemoryId = edge.direction === "out" ? edge.peer_memory_id : memoryId;

    const { edgeId } = await insertEdgeImpl(ctx, {
      fromNodeId,
      toNodeId,
      properties: withDirectedEdgeProperties(edge.properties),
      idParts: {
        label: edge.label.kind,
        fromMemoryId,
        toMemoryId,
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

  const syncByMid = new Map<string, { namespace: NamespacePath; key: string }>();
  syncByMid.set(memoryId, { namespace: namespace as NamespacePath, key: params.key });
  for (const n of oldNeighbors) {
    syncByMid.set(ids.memory(n.namespace, n.key), {
      namespace: n.namespace as NamespacePath,
      key: n.key,
    });
  }
  for (const e of params.edges ?? []) {
    const peer = await loadMemoryNamespaceKeyImpl(ctx, e.peer_memory_id);
    if (peer !== undefined) {
      syncByMid.set(e.peer_memory_id, {
        namespace: peer.namespace as NamespacePath,
        key: peer.key,
      });
    }
  }

  const syncRefs = [...syncByMid.values()].sort((a, b) =>
    a.namespace !== b.namespace
      ? (a.namespace as string).localeCompare(b.namespace as string)
      : a.key.localeCompare(b.key),
  );
  const primaryMeta =
    params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
      ? params.searchMetaVector
      : undefined;
  for (const ref of syncRefs) {
    const refMemoryId = ids.memory(ref.namespace, ref.key);
    await syncMemorySearchMetaImpl(ctx, {
      namespace: ref.namespace,
      memoryKey: ref.key,
      now,
      metaVector: refMemoryId === memoryId ? primaryMeta : undefined,
    });
    await syncLabelPropsSearchFeaturesImpl(ctx, { namespace: ref.namespace, memoryKey: ref.key, now });
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

  return [...syncByMid.keys()].sort((a, b) => a.localeCompare(b));
}

async function runMergeMemoryAtomicEdge(
  ctx: MutationCtx,
  raw: Extract<MergeMemoryAtomicInput, { kind: "edge" }>,
  namespace: string,
  now: number,
): Promise<string[]> {
  const params = raw;
  const memoryId = ids.memory(namespace, params.key);

  const fromRef = await loadMemoryNamespaceKeyImpl(ctx, params.edge.from_memory_id);
  const toRef = await loadMemoryNamespaceKeyImpl(ctx, params.edge.to_memory_id);
  if (fromRef === undefined) {
    throw new Error(`mergeMemoryAtomic: unknown edge.from_memory_id=${params.edge.from_memory_id}`);
  }
  if (toRef === undefined) {
    throw new Error(`mergeMemoryAtomic: unknown edge.to_memory_id=${params.edge.to_memory_id}`);
  }
  const fromNodeId = ids.node(fromRef.namespace, fromRef.key);
  const toNodeId = ids.node(toRef.namespace, toRef.key);
  if (!(await nodeExists(ctx, fromNodeId))) {
    throw new Error(`mergeMemoryAtomic: node missing for edge.from_memory_id=${params.edge.from_memory_id}`);
  }
  if (!(await nodeExists(ctx, toNodeId))) {
    throw new Error(`mergeMemoryAtomic: node missing for edge.to_memory_id=${params.edge.to_memory_id}`);
  }

  const edgeId = ids.edge(
    fromNodeId,
    toNodeId,
    params.edge.label.kind,
    params.edge.from_memory_id,
    params.edge.to_memory_id,
  );

  await clearMemorySubtreeImpl(ctx, { memoryKind: "edge", memoryId, edgeId });

  const { edgeId: persistedEdgeId } = await insertEdgeImpl(ctx, {
    fromNodeId,
    toNodeId,
    properties: withDirectedEdgeProperties(params.edge.properties),
    idParts: {
      label: params.edge.label.kind,
      fromMemoryId: params.edge.from_memory_id,
      toMemoryId: params.edge.to_memory_id,
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

  const scopeIds = [...new Set([namespace, ...(params.attachScopes ?? [])])];
  await replaceMemoryScopesImpl(ctx, { memoryId, scopeIds, now });

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

  const syncByMid = new Map<string, { namespace: NamespacePath; key: string }>();
  syncByMid.set(memoryId, { namespace: namespace as NamespacePath, key: params.key });
  syncByMid.set(params.edge.from_memory_id, {
    namespace: fromRef.namespace as NamespacePath,
    key: fromRef.key,
  });
  syncByMid.set(params.edge.to_memory_id, {
    namespace: toRef.namespace as NamespacePath,
    key: toRef.key,
  });

  const primaryMeta =
    params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
      ? params.searchMetaVector
      : undefined;
  for (const ref of [...syncByMid.values()].sort((a, b) =>
    a.namespace !== b.namespace
      ? (a.namespace as string).localeCompare(b.namespace as string)
      : a.key.localeCompare(b.key),
  )) {
    const refMid = ids.memory(ref.namespace, ref.key);
    await syncMemorySearchMetaImpl(ctx, {
      namespace: ref.namespace,
      memoryKey: ref.key,
      now,
      metaVector: refMid === memoryId ? primaryMeta : undefined,
    });
    await syncLabelPropsSearchFeaturesImpl(ctx, { namespace: ref.namespace, memoryKey: ref.key, now });
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

  return [...syncByMid.keys()].sort((a, b) => a.localeCompare(b));
}
