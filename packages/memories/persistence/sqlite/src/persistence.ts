import type { Database } from "bun:sqlite";
import type {
  GraphEdgeLink,
  GraphNode,
  MemoriesPersistence as IMemoriesPersistence,
  LabelPropsSearchFormatter,
  MemoriesBackendCapabilities,
  MemoryOpContext,
  NeighborFilter,
  SearchNamespaceScope,
} from "@cfd/memories-core";
import type { SourceMap, TextFeatureExportRow } from "@cfd/memories-core/persistence";
import type { DbCtx } from "./models/context";
import { insertEdgeLabelAssignment } from "./models/edge-label-assignments";
import { ensureEdgeLabel } from "./models/edge-labels";
import { insertEdge } from "./models/edges";
import { syncLabelPropsSearchFeatures as syncLabelPropsSearchFeaturesImpl } from "./models/label-props-search";
import { listSourceMapsForMemory as listSourceMapsForMemoryQuery } from "./models/list-source-maps-for-memory";
import { listTextFeatureExportRowsForMemory as listTextFeatureExportRowsForMemoryQuery } from "./models/list-text-feature-export-rows";
import { findMemoryIdByKey, upsertMemory } from "./models/memories";
import {
  buildCanonicalMemorySearchMetaText,
  listNeighborMemoryKeysForNode,
  syncMemorySearchMeta,
  upsertMemorySearchMetaVector,
} from "./models/memory-search-meta";
import { clearMemorySubtree } from "./models/memory-subtree";
import { insertNodeLabelAssignment } from "./models/node-label-assignments";
import { ensureNodeLabel } from "./models/node-labels";
import { nodeExists, upsertNodeForMemoryKey } from "./models/nodes";
import {
  type HydratedNeighbor,
  hydrateSourceMapHits,
  listNeighborsForMemory,
  searchLexicalSourceMapIds,
  searchVectorSourceMapIds,
} from "./models/search";
import { insertSourceMap } from "./models/source-maps";
import { insertLexicalFeature } from "./models/text-features";
import { insertVectorFeature } from "./models/vector-features";
import { listVectorEmbeddingIndexDimensions as listVectorEmbeddingIndexDimensionsQuery } from "./models/vector-index-dimensions";
import {
  listIncidentGraphEdgesForMemory as listIncidentGraphEdgesQuery,
  loadGraphEdge as loadGraphEdgeQuery,
  loadGraphEdgesForNamespace as loadGraphEdgesQuery,
  loadGraphNode as loadGraphNodeQuery,
  loadNodeLabelsForMemory as loadNodeLabelsForMemoryQuery,
  loadNodeLabelsForNamespace as loadNodeLabelsQuery,
  loadNodePropertiesForMemory as loadNodePropertiesForMemoryQuery,
  loadNodePropertiesForNamespace as loadNodePropertiesQuery,
} from "./visualization/projection";

export class MemoriesPersistence implements IMemoriesPersistence {
  readonly capabilities: MemoriesBackendCapabilities = {
    lexicalSearch: true,
    vectorSearch: true,
    neighborIndex: true,
    graphIndex: true,
    multiNamespaceSearch: true,
    unscopedSearch: true,
  };

  constructor(
    private readonly db: Database,
    private readonly labelPropsSearchFormatter?: LabelPropsSearchFormatter,
  ) {}

  private ctx(op: MemoryOpContext): DbCtx {
    return { db: this.db, now: op.now };
  }

  withTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  listNeighborMemoryKeysForNode(op: MemoryOpContext, namespace: string, nodeId: string): string[] {
    return listNeighborMemoryKeysForNode(this.ctx(op), namespace, nodeId);
  }

  clearMemorySubtree(op: MemoryOpContext, memoryId: string, nodeId: string): void {
    clearMemorySubtree(this.ctx(op), memoryId, nodeId);
  }

  upsertMemory(
    op: MemoryOpContext,
    input: { namespace: string; key: string },
  ): { memoryId: string; _ts_created: number } {
    return upsertMemory(this.ctx(op), input);
  }

  upsertNodeForMemoryKey(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; properties?: Record<string, unknown> },
  ): { nodeId: string } {
    return upsertNodeForMemoryKey(this.ctx(op), input);
  }

  insertSourceMap(
    op: MemoryOpContext,
    input: { memoryId: string; sourceKey: string },
  ): { sourceMapId: string } {
    return insertSourceMap(this.ctx(op), input);
  }

  insertLexicalFeature(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; text: string },
  ): { textFeatureId: string } {
    return insertLexicalFeature(this.ctx(op), input);
  }

  insertVectorFeature(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; vector: Float32Array },
  ): { vectorFeatureId: string } {
    return insertVectorFeature(this.ctx(op), input);
  }

  ensureNodeLabel(
    op: MemoryOpContext,
    input: { kind: string; description?: string; schemaJson?: string | null },
  ): string {
    return ensureNodeLabel(this.ctx(op), input);
  }

  insertNodeLabelAssignment(
    op: MemoryOpContext,
    input: { nodeId: string; labelId: string; props: Record<string, unknown> },
  ): void {
    insertNodeLabelAssignment(this.ctx(op), input);
  }

  findMemoryIdByKey(namespace: string, key: string): string | undefined {
    return findMemoryIdByKey({ db: this.db, now: 0 }, namespace, key);
  }

  nodeExists(nodeId: string): boolean {
    return nodeExists({ db: this.db, now: 0 }, nodeId);
  }

  insertEdge(
    op: MemoryOpContext,
    input: {
      fromNodeId: string;
      toNodeId: string;
      properties?: Record<string, unknown>;
      idParts: { selfMemoryKey: string; otherMemoryKey: string; label: string };
    },
  ): { edgeId: string } {
    return insertEdge(this.ctx(op), input);
  }

  ensureEdgeLabel(
    op: MemoryOpContext,
    input: { kind: string; description?: string; schemaJson?: string | null },
  ): string {
    return ensureEdgeLabel(this.ctx(op), input);
  }

  insertEdgeLabelAssignment(
    op: MemoryOpContext,
    input: { edgeId: string; labelId: string; props: Record<string, unknown> },
  ): void {
    insertEdgeLabelAssignment(this.ctx(op), input);
  }

  syncMemorySearchMeta(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; metaVector?: Float32Array },
  ): void {
    syncMemorySearchMeta(this.ctx(op), input);
  }

  syncLabelPropsSearchFeatures(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string },
  ): void {
    syncLabelPropsSearchFeaturesImpl(this.ctx(op), {
      ...input,
      formatLabelProps: this.labelPropsSearchFormatter,
    });
  }

  buildCanonicalMemorySearchMetaText(
    op: MemoryOpContext,
    namespace: string,
    memoryKey: string,
  ): string {
    return buildCanonicalMemorySearchMetaText(this.ctx(op), namespace, memoryKey);
  }

  upsertMemorySearchMetaVector(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; vector: Float32Array },
  ): void {
    upsertMemorySearchMetaVector(this.ctx(op), input);
  }

  deleteMemoryRootRows(memoryId: string, nodeId: string): void {
    this.db.run(`DELETE FROM memories WHERE _id = ?`, [memoryId]);
    this.db.run(`DELETE FROM nodes WHERE _id = ?`, [nodeId]);
  }

  searchLexicalSourceMapIds(input: {
    scope: SearchNamespaceScope;
    text: string;
    limit: number;
    memoryIds?: string[];
  }): string[] {
    return searchLexicalSourceMapIds({ db: this.db, now: 0 }, input);
  }

  searchVectorSourceMapIds(input: {
    scope: SearchNamespaceScope;
    vector: number[];
    limit: number;
    memoryIds?: string[];
    maxVectorDistance?: number;
  }): string[] {
    return searchVectorSourceMapIds({ db: this.db, now: 0 }, input);
  }

  hydrateSourceMapHits(sourceMapIds: readonly string[]) {
    return hydrateSourceMapHits({ db: this.db, now: 0 }, sourceMapIds);
  }

  listNeighborsForMemory<
    EDGE_LABEL extends string = string,
    NODE_LABEL extends string = string,
  >(input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  }): HydratedNeighbor[] {
    return listNeighborsForMemory<EDGE_LABEL, NODE_LABEL>({ db: this.db, now: 0 }, input);
  }

  listSourceMapsForMemory(memoryId: string, limit: number): SourceMap[] {
    return listSourceMapsForMemoryQuery({ db: this.db, now: 0 }, memoryId, limit);
  }

  listTextFeatureExportRowsForMemory(memoryId: string): TextFeatureExportRow[] {
    return listTextFeatureExportRowsForMemoryQuery({ db: this.db, now: 0 }, memoryId);
  }

  listVectorEmbeddingIndexDimensions(): number[] {
    return listVectorEmbeddingIndexDimensionsQuery(this.db);
  }

  loadGraphEdgesForNamespace(namespace: string): GraphEdgeLink[] {
    if (!this.capabilities.graphIndex) return [];
    return loadGraphEdgesQuery(this.db, namespace);
  }

  loadNodeLabelsForNamespace(namespace: string) {
    if (!this.capabilities.graphIndex) return new Map();
    return loadNodeLabelsQuery(this.db, namespace);
  }

  loadNodePropertiesForNamespace(namespace: string): Map<string, Record<string, unknown> | null> {
    if (!this.capabilities.graphIndex) return new Map();
    return loadNodePropertiesQuery(this.db, namespace);
  }

  listIncidentGraphEdges(namespace: string, memoryKey: string): GraphEdgeLink[] {
    if (!this.capabilities.graphIndex) return [];
    return listIncidentGraphEdgesQuery(this.db, namespace, memoryKey);
  }

  loadNodeLabelsForMemory(namespace: string, memoryKey: string) {
    if (!this.capabilities.graphIndex) return [];
    return loadNodeLabelsForMemoryQuery(this.db, namespace, memoryKey);
  }

  loadNodePropertiesForMemory(
    namespace: string,
    memoryKey: string,
  ): Record<string, unknown> | null {
    if (!this.capabilities.graphIndex) return null;
    return loadNodePropertiesForMemoryQuery(this.db, namespace, memoryKey);
  }

  loadGraphEdge(namespace: string, edgeId: string): GraphEdgeLink | null {
    if (!this.capabilities.graphIndex) return null;
    return loadGraphEdgeQuery(this.db, namespace, edgeId);
  }

  loadGraphNode(namespace: string, memoryKey: string): GraphNode | null {
    if (!this.capabilities.graphIndex) return null;
    return loadGraphNodeQuery(this.db, namespace, memoryKey);
  }
}

export function createMemoriesPersistence(
  db: Database,
  options?: { labelPropsSearchFormatter?: LabelPropsSearchFormatter },
): MemoriesPersistence {
  return new MemoriesPersistence(db, options?.labelPropsSearchFormatter);
}
