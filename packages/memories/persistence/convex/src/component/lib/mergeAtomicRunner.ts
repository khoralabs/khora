import {
  catalogSchemaJsonForEdgeKind,
  catalogSchemaJsonForNodeKind,
  ids,
  type MergeMemoryParams,
  withDirectedEdgeProperties,
  zMergeMemoryContentItem,
  zNamespacePath,
} from "@cfd/memories-core";
import { zVectorPayload } from "@cfd/memories-core/persistence";
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

export type MergeMemoryAtomicInput = Omit<MergeMemoryParams, "namespace"> & {
  namespace: string;
  now: number;
};

/**
 * Single-transaction merge matching {@link mergeMemoryAsync} order: neighbors → clear → upsert →
 * content → labels → edges → search meta + label-props for each sync key.
 */
export async function runMergeMemoryAtomic(
  ctx: MutationCtx,
  raw: MergeMemoryAtomicInput,
): Promise<string[]> {
  const namespace = zNamespacePath.parse(raw.namespace);
  const now = raw.now;
  const params: MergeMemoryParams = {
    key: raw.key,
    namespace,
    content: raw.content,
    labels: raw.labels,
    properties: raw.properties,
    edges: raw.edges,
    searchMetaVector: raw.searchMetaVector,
  };

  for (const item of params.content) {
    zMergeMemoryContentItem.parse(item);
    if (item.vector !== undefined) zVectorPayload.parse(item.vector);
  }
  if (params.searchMetaVector !== undefined && params.searchMetaVector.length > 0) {
    zVectorPayload.parse(params.searchMetaVector);
  }

  const memoryId = ids.memory(namespace, params.key);
  const nodeId = ids.node(namespace, params.key);

  const oldNeighborKeys = await listNeighborMemoryKeysForNode(ctx, namespace, nodeId);
  await clearMemorySubtreeImpl(ctx, memoryId, nodeId);
  await upsertMemoryImpl(ctx, { namespace, key: params.key, now });
  await upsertNodeForMemoryKeyImpl(ctx, {
    namespace,
    memoryKey: params.key,
    properties: params.properties,
    now,
  });

  for (const rawItem of params.content) {
    const item = zMergeMemoryContentItem.parse(rawItem);
    const { sourceMapId } = await insertSourceMapImpl(ctx, {
      memoryId,
      sourceKey: item.key,
      now,
    });
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
  return Array.from(syncKeys).sort((a, b) => a.localeCompare(b));
}
