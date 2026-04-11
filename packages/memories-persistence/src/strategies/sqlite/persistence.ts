import type { Database } from "bun:sqlite";
import type {
  MemoriesPersistence as IMemoriesPersistence,
  MemoriesBackendCapabilities,
  MemoryOpContext,
  NeighborFilter,
  SearchNamespaceScope,
} from "@cfd/memories-core";
import type { DbCtx } from "./models/context";
import { insertEdgeLabelAssignment } from "./models/edge-label-assignments";
import { ensureEdgeLabel } from "./models/edge-labels";
import { insertEdge } from "./models/edges";
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
import { insertTextFeatureWithFts } from "./models/text-features";
import { insertVectorFeatureWithVecIndex } from "./models/vector-features";

export class MemoriesPersistence implements IMemoriesPersistence {
  readonly capabilities: MemoriesBackendCapabilities = {
    lexicalSearch: true,
    vectorSearch: true,
    neighborIndex: true,
    multiNamespaceSearch: true,
    unscopedSearch: true,
  };

  constructor(private readonly db: Database) {}

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

  insertTextFeatureWithFts(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; text: string },
  ): { textFeatureId: string } {
    return insertTextFeatureWithFts(this.ctx(op), input);
  }

  insertVectorFeatureWithVecIndex(
    op: MemoryOpContext,
    input: { memoryId: string; sourceMapId: string; vector: Float32Array },
  ): { vectorFeatureId: string } {
    return insertVectorFeatureWithVecIndex(this.ctx(op), input);
  }

  ensureNodeLabel(op: MemoryOpContext, value: string): string {
    return ensureNodeLabel(this.ctx(op), value);
  }

  insertNodeLabelAssignment(op: MemoryOpContext, input: { nodeId: string; labelId: string }): void {
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

  ensureEdgeLabel(op: MemoryOpContext, value: string): string {
    return ensureEdgeLabel(this.ctx(op), value);
  }

  insertEdgeLabelAssignment(op: MemoryOpContext, input: { edgeId: string; labelId: string }): void {
    insertEdgeLabelAssignment(this.ctx(op), input);
  }

  syncMemorySearchMeta(
    op: MemoryOpContext,
    input: { namespace: string; memoryKey: string; metaVector?: Float32Array },
  ): void {
    syncMemorySearchMeta(this.ctx(op), input);
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
  }): string[] {
    return searchVectorSourceMapIds({ db: this.db, now: 0 }, input);
  }

  hydrateSourceMapHits<NODE_LABEL extends string = string>(sourceMapIds: readonly string[]) {
    return hydrateSourceMapHits<NODE_LABEL>({ db: this.db, now: 0 }, sourceMapIds);
  }

  listNeighborsForMemory<
    EDGE_LABEL extends string = string,
    NODE_LABEL extends string = string,
  >(input: {
    namespace: string;
    key: string;
    filters?: NeighborFilter<EDGE_LABEL, NODE_LABEL>;
  }): HydratedNeighbor<EDGE_LABEL, NODE_LABEL>[] {
    return listNeighborsForMemory<EDGE_LABEL, NODE_LABEL>({ db: this.db, now: 0 }, input);
  }
}

export function createMemoriesPersistence(db: Database): MemoriesPersistence {
  return new MemoriesPersistence(db);
}
