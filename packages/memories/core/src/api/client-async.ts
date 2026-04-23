import type z from "zod";
import type { DeleteMemoryParams } from "../models/delete-memory";
import { deleteMemoryAsync } from "../models/delete-memory-async";
import type { MemoriesPersistenceAsync } from "../persistence/async-types";
import {
  type MergeMemoryParams,
  type MutationCtxAsync,
  mergeMemoryAsync,
  zMergeMemoryContentItem,
} from "./merge-memory-async";
import type { MemoriesClientOptions } from "./client";
import type { OntologyDefinition } from "./ontology";
import { validateEdgeLabel, validateNodeLabel } from "./ontology";
import type { ResolvedSource, Store } from "./resolve-sourcemap.js";
import {
  type SearchHit,
  type SearchParams,
  searchAsync as searchHandlerAsync,
} from "./search-async";

type LabelKind<TLabels extends Record<string, z.ZodType>> = keyof TLabels & string;

export type TypedMergeParamsAsync<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = MergeMemoryParams<TNode, TEdge>;

export type TypedSearchParamsAsync<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchParams<LabelKind<TNode>, LabelKind<TEdge>>;

export type TypedSearchHitAsync<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchHit<LabelKind<TNode>, LabelKind<TEdge>>;

/**
 * Async variant of {@link MemoriesClient} for {@link MemoriesPersistenceAsync} backends.
 */
export class MemoriesClientAsync<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  readonly ontology: OntologyDefinition<TNode, TEdge>;
  readonly persistence: MemoriesPersistenceAsync;
  private readonly store?: Store;
  private readonly storeForNamespace?: (namespace: string) => Store | undefined;

  constructor(
    persistence: MemoriesPersistenceAsync,
    ontology: OntologyDefinition<TNode, TEdge>,
    options?: MemoriesClientOptions,
  ) {
    this.persistence = persistence;
    this.ontology = ontology;
    this.store = options?.store;
    this.storeForNamespace = options?.storeForNamespace;
  }

  private get mutationCtx(): MutationCtxAsync {
    return { persistence: this.persistence };
  }

  private storeForMergeNamespace(namespace: string): Store | undefined {
    return this.storeForNamespace?.(namespace) ?? this.store;
  }

  private async syncLexicalExportToStore(
    namespace: string,
    mergedMemoryKeys: string[],
  ): Promise<void> {
    const store = this.storeForMergeNamespace(namespace);
    const pushRows = store?.syncFromTextExportRows;
    if (pushRows === undefined) {
      return;
    }
    for (const memoryKey of mergedMemoryKeys) {
      const memoryId = await this.persistence.findMemoryIdByKey(namespace, memoryKey);
      if (memoryId === undefined) {
        continue;
      }
      const rows = await this.persistence.listTextFeatureExportRowsForMemory(memoryId);
      pushRows.call(store, rows);
    }
  }

  async mergeMemory(params: TypedMergeParamsAsync<TNode, TEdge>): Promise<string[]> {
    for (const item of params.content) {
      zMergeMemoryContentItem.parse(item);
    }

    const labelInstances = params.labels.map((l) => validateNodeLabel(this.ontology, l));

    const edgesMapped =
      params.edges?.map((e) => ({
        memory_key: e.memory_key,
        direction: e.direction,
        label: validateEdgeLabel(this.ontology, e.label),
        properties: e.properties,
      })) ?? [];

    const mergedKeys = await mergeMemoryAsync(this.mutationCtx, {
      key: params.key,
      namespace: params.namespace,
      content: params.content,
      labels: labelInstances,
      properties: params.properties,
      edges: edgesMapped,
      searchMetaVector: params.searchMetaVector,
      ontology: this.ontology,
    });
    await this.syncLexicalExportToStore(params.namespace, mergedKeys);
    return mergedKeys;
  }

  async deleteMemory(params: DeleteMemoryParams): Promise<void> {
    return deleteMemoryAsync(this.mutationCtx, params);
  }

  async search(
    params: TypedSearchParamsAsync<TNode, TEdge>,
  ): Promise<TypedSearchHitAsync<TNode, TEdge>[]> {
    return searchHandlerAsync(this.mutationCtx, params);
  }

  async resolveSourcesForMemory(
    namespace: string,
    memoryId: string,
    limit: number,
  ): Promise<Array<{ sourceKey: string; content: ResolvedSource | null }>> {
    const store = this.storeForMergeNamespace(namespace);
    if (store === undefined) {
      throw new Error(
        "MemoriesClientAsync: pass store or storeForNamespace in the constructor to use resolveSourcesForMemory",
      );
    }
    const maps = await this.persistence.listSourceMapsForMemory(memoryId, limit);
    const out: Array<{ sourceKey: string; content: ResolvedSource | null }> = [];
    for (const sm of maps) {
      let content: ResolvedSource | null = null;
      try {
        content = await store.resolve(sm);
      } catch {
        content = null;
      }
      out.push({ sourceKey: sm.source_key, content });
    }
    return out;
  }
}
