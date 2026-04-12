import { ids } from "../models/ids";
import type { MemoriesPersistenceAsync } from "../persistence/async-types";
import { resolveMemoriesBackendCapabilities } from "../persistence/types";
import {
  type MergeMemoryParams,
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
  params: MergeMemoryParams<string, string>,
): Promise<string[]> {
  const { persistence } = ctx;
  const caps = resolveMemoriesBackendCapabilities(persistence);
  const now = Date.now();
  const op = { now };

  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  for (const item of params.content) {
    zMergeMemoryContentItem.parse(item);
    if (item.vector !== undefined && !caps.vectorSearch) {
      throw new Error(
        "mergeMemoryAsync: content item includes vector but persistence.capabilities.vectorSearch is false",
      );
    }
  }

  if (
    params.searchMetaVector !== undefined &&
    params.searchMetaVector.length > 0 &&
    !caps.vectorSearch
  ) {
    throw new Error(
      "mergeMemoryAsync: searchMetaVector set but persistence.capabilities.vectorSearch is false",
    );
  }

  let metaSyncedMemoryKeys: string[] = [];

  await persistence.withTransaction(async () => {
    const oldNeighborKeys = await persistence.listNeighborMemoryKeysForNode(
      op,
      params.namespace,
      nodeId,
    );
    await persistence.clearMemorySubtree(op, memoryId, nodeId);
    await persistence.upsertMemory(op, { namespace: params.namespace, key: params.key });
    await persistence.upsertNodeForMemoryKey(op, {
      namespace: params.namespace,
      memoryKey: params.key,
      properties: params.properties,
    });

    for (const raw of params.content) {
      const item = zMergeMemoryContentItem.parse(raw);
      const { sourceMapId } = await persistence.insertSourceMap(op, {
        memoryId,
        sourceKey: item.key,
      });
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
          vector: new Float32Array(item.vector),
        });
      }
    }

    for (const label of [...new Set(params.labels)]) {
      const labelId = await persistence.ensureNodeLabel(op, label);
      await persistence.insertNodeLabelAssignment(op, { nodeId, labelId });
    }

    for (const edge of params.edges ?? []) {
      if ((await persistence.findMemoryIdByKey(params.namespace, edge.memory_key)) === undefined) {
        throw new Error(
          `mergeMemoryAsync: unknown edge target memory_key=${edge.memory_key} in namespace=${params.namespace}`,
        );
      }
      const otherNodeId = ids.node(params.namespace, edge.memory_key);
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
          label: edge.label,
          selfMemoryKey: params.key,
          otherMemoryKey: edge.memory_key,
        },
      });
      const edgeLabelId = await persistence.ensureEdgeLabel(op, edge.label);
      await persistence.insertEdgeLabelAssignment(op, { edgeId, labelId: edgeLabelId });
    }

    const newNeighborKeys = (params.edges ?? []).map((e) => e.memory_key);
    const syncKeys = new Set([params.key, ...oldNeighborKeys, ...newNeighborKeys]);
    const primaryMetaVec =
      params.searchMetaVector !== undefined && params.searchMetaVector.length > 0
        ? new Float32Array(params.searchMetaVector)
        : undefined;
    for (const k of syncKeys) {
      await persistence.syncMemorySearchMeta(op, {
        namespace: params.namespace,
        memoryKey: k,
        metaVector: k === params.key ? primaryMetaVec : undefined,
      });
      const syncLabelProps = persistence.syncLabelPropsSearchFeatures;
      if (syncLabelProps !== undefined) {
        await syncLabelProps(op, {
          namespace: params.namespace,
          memoryKey: k,
        });
      }
    }
    metaSyncedMemoryKeys = Array.from(syncKeys).sort((a, b) => a.localeCompare(b));
  });

  return metaSyncedMemoryKeys;
}

export type { MergeMemoryContentItem, MergeMemoryParams } from "./merge-memory";
export { zMergeMemoryContentItem, zUserSourceKey } from "./merge-memory";
