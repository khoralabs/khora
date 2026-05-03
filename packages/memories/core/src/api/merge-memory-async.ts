import { ids } from "../models/ids";
import { zNamespacePath } from "../models/namespace-path";
import type { MemoriesPersistenceAsync } from "../persistence/async-types";
import { zVectorPayload } from "../persistence/row-schemas";
import { resolveMemoriesBackendCapabilities } from "../persistence/types";
import { computeSourceMapContentHash } from "../provenance/index.ts";
import {
  catalogSchemaJsonForEdgeKind,
  catalogSchemaJsonForNodeKind,
  type MergeMemoryParams,
  type MergeMemoryParamsEdge,
  type MergeMemoryParamsNode,
  withDirectedEdgeProperties,
  zMergeMemoryContentItem,
} from "./merge-memory";

export interface MutationCtxAsync {
  persistence: MemoriesPersistenceAsync;
}

/**
 * Same contract as {@link mergeMemory} for {@link MemoriesPersistenceAsync} (awaiting each store call).
 */
export async function mergeMemoryAsync(
  ctx: MutationCtxAsync,
  params: MergeMemoryParams,
): Promise<string[]> {
  const { persistence } = ctx;
  const caps = resolveMemoriesBackendCapabilities(persistence);
  const now = Date.now();
  const op = { now };

  const namespace = zNamespacePath.parse(params.namespace);

  for (const item of params.content) {
    zMergeMemoryContentItem.parse(item);
    if (item.vector !== undefined) {
      if (!caps.vectorSearch) {
        throw new Error(
          "mergeMemoryAsync: content item includes vector but persistence.capabilities.vectorSearch is false",
        );
      }
      zVectorPayload.parse(item.vector);
    }
  }

  if (params.searchMetaVector !== undefined && params.searchMetaVector.length > 0) {
    if (!caps.vectorSearch) {
      throw new Error(
        "mergeMemoryAsync: searchMetaVector set but persistence.capabilities.vectorSearch is false",
      );
    }
    zVectorPayload.parse(params.searchMetaVector);
  }

  if (params.kind === "edge") {
    return mergeMemoryAsyncEdge(ctx, params, namespace, op);
  }
  return mergeMemoryAsyncNode(ctx, params, namespace, op);
}

async function mergeMemoryAsyncNode(
  ctx: MutationCtxAsync,
  params: MergeMemoryParamsNode,
  namespace: ReturnType<typeof zNamespacePath.parse>,
  op: { now: number },
): Promise<string[]> {
  const { persistence } = ctx;
  const memoryId = ids.memory(namespace, params.key);
  const nodeId = ids.node(namespace, params.key);

  let metaSyncedMemoryKeys: string[] = [];

  await persistence.withTransaction(async () => {
    const oldNeighborKeys = await persistence.listNeighborMemoryKeysForNode(op, namespace, nodeId);
    await persistence.clearMemorySubtree(op, { memoryKind: "node", memoryId, nodeId });
    await persistence.upsertMemory(op, { namespace, key: params.key, kind: "node", edgeId: null });
    await persistence.upsertNodeForMemoryKey(op, {
      namespace,
      memoryKey: params.key,
      properties: params.properties,
    });

    const contentHashes: Record<string, string> = {};
    for (const raw of params.content) {
      const item = zMergeMemoryContentItem.parse(raw);
      const { sourceMapId } = await persistence.insertSourceMap(op, {
        memoryId,
        sourceKey: item.key,
      });
      const vec = item.vector !== undefined ? new Float32Array(item.vector) : undefined;
      if (item.text !== undefined) {
        await persistence.insertLexicalFeature(op, {
          memoryId,
          sourceMapId,
          text: item.text,
        });
      }
      if (item.vector !== undefined) {
        await persistence.insertVectorFeature(op, {
          memoryId,
          sourceMapId,
          vector: vec!,
        });
      }
      await persistence.updateSourceMapContentHash(op, {
        sourceMapId,
        text: item.text,
        vector: vec,
      });
      contentHashes[item.key] = computeSourceMapContentHash({
        text: item.text,
        vector: vec,
      });
    }

    const labelByKind = new Map(params.labels.map((l) => [l.kind, l] as const));
    for (const l of labelByKind.values()) {
      const labelId = await persistence.ensureNodeLabel(op, {
        kind: l.kind,
        description: "",
        schemaJson: catalogSchemaJsonForNodeKind(params.ontology, l.kind),
      });
      await persistence.insertNodeLabelAssignment(op, {
        nodeId,
        labelId,
        props: l.props as Record<string, unknown>,
      });
    }

    for (const edge of params.edges ?? []) {
      if ((await persistence.findMemoryIdByKey(namespace, edge.memory_key)) === undefined) {
        throw new Error(
          `mergeMemoryAsync: unknown edge target memory_key=${edge.memory_key} in namespace=${namespace}`,
        );
      }
      const otherNodeId = ids.node(namespace, edge.memory_key);
      if (!(await persistence.nodeExists(otherNodeId))) {
        throw new Error(`mergeMemoryAsync: target node missing for memory_key=${edge.memory_key}`);
      }

      const fromNodeId = edge.direction === "out" ? nodeId : otherNodeId;
      const toNodeId = edge.direction === "out" ? otherNodeId : nodeId;
      const { edgeId } = await persistence.insertEdge(op, {
        fromNodeId,
        toNodeId,
        properties: withDirectedEdgeProperties(edge.properties),
        idParts: {
          label: edge.label.kind,
          selfMemoryKey: params.key,
          otherMemoryKey: edge.memory_key,
        },
      });
      const edgeLabelId = await persistence.ensureEdgeLabel(op, {
        kind: edge.label.kind,
        description: "",
        schemaJson: catalogSchemaJsonForEdgeKind(params.ontology, edge.label.kind),
      });
      await persistence.insertEdgeLabelAssignment(op, {
        edgeId,
        labelId: edgeLabelId,
        props: edge.label.props as Record<string, unknown>,
      });
    }

    const newNeighborKeys = (params.edges ?? []).map((e) => e.memory_key);
    const syncKeys = new Set([params.key, ...oldNeighborKeys, ...newNeighborKeys]);
    const primaryMetaVec =
      params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
        ? new Float32Array(params.searchMetaVector)
        : undefined;
    for (const k of syncKeys) {
      await persistence.syncMemorySearchMeta(op, {
        namespace,
        memoryKey: k,
        metaVector: k === params.key ? primaryMetaVec : undefined,
      });
      const syncLabelProps = persistence.syncLabelPropsSearchFeatures;
      if (syncLabelProps !== undefined) {
        await syncLabelProps(op, {
          namespace,
          memoryKey: k,
        });
      }
    }
    metaSyncedMemoryKeys = Array.from(syncKeys).sort((a, b) => a.localeCompare(b));

    const sourceKeysSorted = params.content
      .map((raw) => zMergeMemoryContentItem.parse(raw).key)
      .sort((a, b) => a.localeCompare(b));
    const sortedHashes =
      Object.keys(contentHashes).length > 0
        ? Object.fromEntries(
            Object.keys(contentHashes)
              .sort((a, b) => a.localeCompare(b))
              .map((k) => [k, contentHashes[k]!]),
          )
        : undefined;
    await persistence.appendProvenanceEvent(op, {
      v: 1,
      kind: "MERGE_MEMORY",
      namespace,
      memory_key: params.key,
      memory_id: memoryId,
      source_keys: sourceKeysSorted,
      ...(sortedHashes !== undefined ? { content_hashes: sortedHashes } : {}),
    });
  });

  return metaSyncedMemoryKeys;
}

async function mergeMemoryAsyncEdge(
  ctx: MutationCtxAsync,
  params: MergeMemoryParamsEdge,
  namespace: ReturnType<typeof zNamespacePath.parse>,
  op: { now: number },
): Promise<string[]> {
  const { persistence } = ctx;
  const memoryId = ids.memory(namespace, params.key);
  const { from_key: fromKey, to_key: toKey } = params.edge;

  if ((await persistence.findMemoryIdByKey(namespace, fromKey)) === undefined) {
    throw new Error(`mergeMemoryAsync: unknown edge.from_key=${fromKey} in namespace=${namespace}`);
  }
  if ((await persistence.findMemoryIdByKey(namespace, toKey)) === undefined) {
    throw new Error(`mergeMemoryAsync: unknown edge.to_key=${toKey} in namespace=${namespace}`);
  }
  const fromNodeId = ids.node(namespace, fromKey);
  const toNodeId = ids.node(namespace, toKey);
  if (!(await persistence.nodeExists(fromNodeId))) {
    throw new Error(`mergeMemoryAsync: node missing for edge.from_key=${fromKey}`);
  }
  if (!(await persistence.nodeExists(toNodeId))) {
    throw new Error(`mergeMemoryAsync: node missing for edge.to_key=${toKey}`);
  }

  const edgeId = ids.edge(
    fromNodeId,
    toNodeId,
    params.edge.label.kind,
    fromKey,
    toKey,
  );

  let metaSyncedMemoryKeys: string[] = [];

  await persistence.withTransaction(async () => {
    await persistence.clearMemorySubtree(op, { memoryKind: "edge", memoryId, edgeId });

    const { edgeId: persistedEdgeId } = await persistence.insertEdge(op, {
      fromNodeId,
      toNodeId,
      properties: withDirectedEdgeProperties(params.edge.properties),
      idParts: {
        label: params.edge.label.kind,
        selfMemoryKey: fromKey,
        otherMemoryKey: toKey,
      },
    });
    if (persistedEdgeId !== edgeId) {
      throw new Error("mergeMemoryAsync: edge id mismatch between preview and insertEdge");
    }

    await persistence.upsertMemory(op, {
      namespace,
      key: params.key,
      kind: "edge",
      edgeId,
    });

    const contentHashes: Record<string, string> = {};
    for (const raw of params.content) {
      const item = zMergeMemoryContentItem.parse(raw);
      const { sourceMapId } = await persistence.insertSourceMap(op, {
        memoryId,
        sourceKey: item.key,
      });
      const vec = item.vector !== undefined ? new Float32Array(item.vector) : undefined;
      if (item.text !== undefined) {
        await persistence.insertLexicalFeature(op, {
          memoryId,
          sourceMapId,
          text: item.text,
        });
      }
      if (item.vector !== undefined) {
        await persistence.insertVectorFeature(op, {
          memoryId,
          sourceMapId,
          vector: vec!,
        });
      }
      await persistence.updateSourceMapContentHash(op, {
        sourceMapId,
        text: item.text,
        vector: vec,
      });
      contentHashes[item.key] = computeSourceMapContentHash({
        text: item.text,
        vector: vec,
      });
    }

    const edgeLabelId = await persistence.ensureEdgeLabel(op, {
      kind: params.edge.label.kind,
      description: "",
      schemaJson: catalogSchemaJsonForEdgeKind(params.ontology, params.edge.label.kind),
    });
    await persistence.insertEdgeLabelAssignment(op, {
      edgeId,
      labelId: edgeLabelId,
      props: params.edge.label.props as Record<string, unknown>,
    });

    const syncKeys = new Set([params.key, fromKey, toKey]);
    const primaryMetaVec =
      params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
        ? new Float32Array(params.searchMetaVector)
        : undefined;
    for (const k of syncKeys) {
      await persistence.syncMemorySearchMeta(op, {
        namespace,
        memoryKey: k,
        metaVector: k === params.key ? primaryMetaVec : undefined,
      });
      const syncLabelProps = persistence.syncLabelPropsSearchFeatures;
      if (syncLabelProps !== undefined) {
        await syncLabelProps(op, {
          namespace,
          memoryKey: k,
        });
      }
    }
    metaSyncedMemoryKeys = Array.from(syncKeys).sort((a, b) => a.localeCompare(b));

    const sourceKeysSorted = params.content
      .map((raw) => zMergeMemoryContentItem.parse(raw).key)
      .sort((a, b) => a.localeCompare(b));
    const sortedHashes =
      Object.keys(contentHashes).length > 0
        ? Object.fromEntries(
            Object.keys(contentHashes)
              .sort((a, b) => a.localeCompare(b))
              .map((k) => [k, contentHashes[k]!]),
          )
        : undefined;
    await persistence.appendProvenanceEvent(op, {
      v: 1,
      kind: "MERGE_MEMORY",
      namespace,
      memory_key: params.key,
      memory_id: memoryId,
      source_keys: sourceKeysSorted,
      ...(sortedHashes !== undefined ? { content_hashes: sortedHashes } : {}),
    });
  });

  return metaSyncedMemoryKeys;
}

export type { MergeMemoryContentItem, MergeMemoryParams } from "./merge-memory";
export { zMergeMemoryContentItem, zUserSourceKey } from "./merge-memory";
