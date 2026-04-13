import z from "zod";
import { ids } from "../models/ids";
import { MEMORY_SEARCH_META_SOURCE_KEY } from "../models/memory-search-meta";
import { zVectorPayload } from "../persistence/row-schemas.ts";
import { type MemoriesPersistence, resolveMemoriesBackendCapabilities } from "../persistence/types";
import type {
  EdgeLabelInstance,
  LabelSchemaMap,
  NodeLabelInstance,
  OntologyDefinition,
} from "./ontology";
import { zodPropsSchemaToJson } from "./ontology";

export {
  buildCanonicalMemorySearchMetaTextForMerge,
  MEMORY_SEARCH_META_SOURCE_KEY,
} from "../models/memory-search-meta";
export { buildCanonicalMemorySearchMetaText, upsertMemorySearchMetaVector } from "../persistence/facade";

export interface MutationCtx {
  persistence: MemoriesPersistence;
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

export interface MergeMemoryParams<
  TNode extends LabelSchemaMap = LabelSchemaMap,
  TEdge extends LabelSchemaMap = LabelSchemaMap,
> {
  key: string;
  namespace: string;
  content: MergeMemoryContentItem[];
  labels: NodeLabelInstance<TNode>[];
  properties?: Record<string, unknown>;
  edges?: Array<{
    memory_key: string;
    direction: "in" | "out";
    label: EdgeLabelInstance<TEdge>;
    properties?: Record<string, unknown>;
  }>;
  /**
   * Optional in-transaction vector for the **primary** memory’s search-meta row only (same dim as content).
   * Neighbors touched in the same merge do not get a vector here; use {@link upsertMemorySearchMetaVector}
   * after merge (see librarian batch) so every meta chunk participates in hybrid search.
   */
  searchMetaVector?: number[];
  /**
   * When set, catalog rows for kinds in this merge receive JSON Schema derived from Zod (`zodPropsSchemaToJson`).
   */
  ontology?: OntologyDefinition<TNode, TEdge>;
}

/**
 * Edge JSON stored on merge: keeps caller `edge.properties` and sets `directed: true` so graph
 * export can treat only merge-created directed links as directed (viz dash animation, etc.).
 */
export function withDirectedEdgeProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base =
    properties && typeof properties === "object" && !Array.isArray(properties) ? properties : {};
  return { ...base, directed: true };
}

export function catalogSchemaJsonForNodeKind(
  ontology: OntologyDefinition | undefined,
  kind: string,
): string {
  if (!ontology) return "";
  const sch = ontology.nodeLabels[kind];
  if (!sch) throw new RangeError(`Unknown node label kind in ontology: ${kind}`);
  return JSON.stringify(zodPropsSchemaToJson(sch));
}

export function catalogSchemaJsonForEdgeKind(
  ontology: OntologyDefinition | undefined,
  kind: string,
): string {
  if (!ontology) return "";
  const sch = ontology.edgeLabels[kind];
  if (!sch) throw new RangeError(`Unknown edge label kind in ontology: ${kind}`);
  return JSON.stringify(zodPropsSchemaToJson(sch));
}

/**
 * Orchestrates a memory merge: validates API input, then delegates storage to the persistence backend.
 * @returns Memory keys whose search-meta lexical row was rebuilt (primary, former neighbors, new edge targets).
 */
export function mergeMemory(ctx: MutationCtx, params: MergeMemoryParams): string[] {
  const { persistence } = ctx;
  const caps = resolveMemoriesBackendCapabilities(persistence);
  const now = Date.now();
  const op = { now };

  const memoryId = ids.memory(params.namespace, params.key);
  const nodeId = ids.node(params.namespace, params.key);

  for (const item of params.content) {
    zMergeMemoryContentItem.parse(item);
    if (item.vector !== undefined) {
      if (!caps.vectorSearch) {
        throw new Error(
          "mergeMemory: content item includes vector but persistence.capabilities.vectorSearch is false",
        );
      }
      zVectorPayload.parse(item.vector);
    }
  }

  if (
    params.searchMetaVector !== undefined &&
    params.searchMetaVector.length > 0
  ) {
    if (!caps.vectorSearch) {
      throw new Error(
        "mergeMemory: searchMetaVector set but persistence.capabilities.vectorSearch is false",
      );
    }
    zVectorPayload.parse(params.searchMetaVector);
  }

  let metaSyncedMemoryKeys: string[] = [];

  persistence.withTransaction(() => {
    const oldNeighborKeys = persistence.listNeighborMemoryKeysForNode(op, params.namespace, nodeId);
    persistence.clearMemorySubtree(op, memoryId, nodeId);
    persistence.upsertMemory(op, { namespace: params.namespace, key: params.key });
    persistence.upsertNodeForMemoryKey(op, {
      namespace: params.namespace,
      memoryKey: params.key,
      properties: params.properties,
    });

    for (const raw of params.content) {
      const item = zMergeMemoryContentItem.parse(raw);
      const { sourceMapId } = persistence.insertSourceMap(op, { memoryId, sourceKey: item.key });
      if (item.text !== undefined) {
        persistence.insertLexicalFeature(op, { memoryId, sourceMapId, text: item.text });
      }
      if (item.vector !== undefined) {
        persistence.insertVectorFeature(op, {
          memoryId,
          sourceMapId,
          vector: new Float32Array(item.vector),
        });
      }
    }

    const labelByKind = new Map<string, { kind: string; props: Record<string, unknown> }>();
    for (const l of params.labels) {
      labelByKind.set(l.kind, { kind: l.kind, props: l.props as Record<string, unknown> });
    }
    for (const l of labelByKind.values()) {
      const labelId = persistence.ensureNodeLabel(op, {
        kind: l.kind,
        description: "",
        schemaJson: catalogSchemaJsonForNodeKind(params.ontology, l.kind),
      });
      persistence.insertNodeLabelAssignment(op, { nodeId, labelId, props: l.props });
    }

    for (const edge of params.edges ?? []) {
      if (persistence.findMemoryIdByKey(params.namespace, edge.memory_key) === undefined) {
        throw new Error(
          `mergeMemory: unknown edge target memory_key=${edge.memory_key} in namespace=${params.namespace}`,
        );
      }
      const otherNodeId = ids.node(params.namespace, edge.memory_key);
      if (!persistence.nodeExists(otherNodeId)) {
        throw new Error(`mergeMemory: target node missing for memory_key=${edge.memory_key}`);
      }

      const fromNodeId = edge.direction === "out" ? nodeId : otherNodeId;
      const toNodeId = edge.direction === "out" ? otherNodeId : nodeId;
      const { edgeId } = persistence.insertEdge(op, {
        fromNodeId,
        toNodeId,
        properties: withDirectedEdgeProperties(edge.properties),
        idParts: {
          label: edge.label.kind,
          selfMemoryKey: params.key,
          otherMemoryKey: edge.memory_key,
        },
      });
      const edgeLabelId = persistence.ensureEdgeLabel(op, {
        kind: edge.label.kind,
        description: "",
        schemaJson: catalogSchemaJsonForEdgeKind(params.ontology, edge.label.kind),
      });
      persistence.insertEdgeLabelAssignment(op, {
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
      persistence.syncMemorySearchMeta(op, {
        namespace: params.namespace,
        memoryKey: k,
        metaVector: k === params.key ? primaryMetaVec : undefined,
      });
      persistence.syncLabelPropsSearchFeatures?.(op, {
        namespace: params.namespace,
        memoryKey: k,
      });
    }
    metaSyncedMemoryKeys = Array.from(syncKeys).sort((a, b) => a.localeCompare(b));
  });

  return metaSyncedMemoryKeys;
}
