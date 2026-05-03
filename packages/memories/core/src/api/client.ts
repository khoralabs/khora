import type z from "zod";
import {
  type DeleteMemoryParams,
  deleteMemory as deleteMemoryHandler,
} from "../models/delete-memory";
import type { MemoriesPersistence } from "../persistence/types";
import {
  type MergeMemoryParams,
  type MutationCtx,
  mergeMemory,
  zMergeMemoryContentItem,
} from "./merge-memory";
import { type OntologyDefinition, validateEdgeLabel, validateNodeLabel } from "./ontology";
import type { ResolvedSource, Store } from "./resolve-sourcemap.js";
import { type SearchHit, type SearchParams, search as searchHandler } from "./search";

type LabelKind<TLabels extends Record<string, z.ZodType>> = keyof TLabels & string;

export type TypedMergeParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = MergeMemoryParams<TNode, TEdge>;

export type TypedSearchParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchParams<LabelKind<TNode>, LabelKind<TEdge>>;

export type TypedSearchHit<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchHit<LabelKind<TNode>, LabelKind<TEdge>>;

export type MemoriesClientOptions = {
  /** Lexical mirror (e.g. JSONL); {@link Store.resolve} enriches source maps. */
  store?: Store;
  /** When set, overrides {@link MemoriesClientOptions.store} per merge/search namespace. */
  storeForNamespace?: (namespace: string) => Store | undefined;
};

/**
 * Memories API with a **fixed ontology**: node/edge label kinds and per-kind props are
 * validated via Zod before {@link mergeMemory}.
 */
export class MemoriesClient<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  readonly ontology: OntologyDefinition<TNode, TEdge>;
  readonly persistence: MemoriesPersistence;
  private readonly store?: Store;
  private readonly storeForNamespace?: (namespace: string) => Store | undefined;

  constructor(
    persistence: MemoriesPersistence,
    ontology: OntologyDefinition<TNode, TEdge>,
    options?: MemoriesClientOptions,
  ) {
    this.persistence = persistence;
    this.ontology = ontology;
    this.store = options?.store;
    this.storeForNamespace = options?.storeForNamespace;
  }

  private get mutationCtx(): MutationCtx {
    return { persistence: this.persistence };
  }

  private storeForMergeNamespace(namespace: string): Store | undefined {
    return this.storeForNamespace?.(namespace) ?? this.store;
  }

  private syncLexicalExportToStore(namespace: string, mergedMemoryKeys: string[]): void {
    const store = this.storeForMergeNamespace(namespace);
    const pushRows = store?.syncFromTextExportRows;
    if (pushRows === undefined) {
      return;
    }
    for (const memoryKey of mergedMemoryKeys) {
      const memoryId = this.persistence.findMemoryIdByKey(namespace, memoryKey);
      if (memoryId === undefined) {
        continue;
      }
      pushRows.call(store, this.persistence.listTextFeatureExportRowsForMemory(memoryId));
    }
  }

  /**
   * Validates content items and ontology labels, maps labels to stored string identities, then runs
   * {@link mergeMemory} in a transaction.
   * @returns Memory keys whose search-meta lexical row was rebuilt.
   */
  mergeMemory(params: TypedMergeParams<TNode, TEdge>): string[] {
    for (const item of params.content) {
      zMergeMemoryContentItem.parse(item);
    }

    if (params.kind === "edge") {
      const mergedKeys = mergeMemory(this.mutationCtx, {
        kind: "edge",
        key: params.key,
        namespace: params.namespace,
        content: params.content,
        edge: {
          from_key: params.edge.from_key,
          to_key: params.edge.to_key,
          label: validateEdgeLabel(this.ontology, params.edge.label),
          properties: params.edge.properties,
        },
        searchMetaVector: params.searchMetaVector,
        ontology: this.ontology,
      });
      this.syncLexicalExportToStore(params.namespace, mergedKeys);
      return mergedKeys;
    }

    const labelInstances = params.labels.map((l) => validateNodeLabel(this.ontology, l));

    const edgesMapped =
      params.edges?.map((e) => ({
        memory_key: e.memory_key,
        direction: e.direction,
        label: validateEdgeLabel(this.ontology, e.label),
        properties: e.properties,
      })) ?? [];

    const mergedKeys = mergeMemory(this.mutationCtx, {
      key: params.key,
      namespace: params.namespace,
      content: params.content,
      labels: labelInstances,
      properties: params.properties,
      edges: edgesMapped,
      searchMetaVector: params.searchMetaVector,
      ontology: this.ontology,
    });
    this.syncLexicalExportToStore(params.namespace, mergedKeys);
    return mergedKeys;
  }

  /** Deletes the memory and cascaded data; delegates to the package `deleteMemory` function. */
  deleteMemory(params: DeleteMemoryParams): void {
    deleteMemoryHandler(this.mutationCtx, params);
  }

  /** Runs the package `search` function against this store. */
  search(params: TypedSearchParams<TNode, TEdge>): TypedSearchHit<TNode, TEdge>[] {
    return searchHandler(this.mutationCtx, params);
  }

  /**
   * Resolves lexical sources for up to {@code limit} source maps on a memory using the configured
   * {@link MemoriesClientOptions.store} (or {@link MemoriesClientOptions.storeForNamespace}).
   */
  async resolveSourcesForMemory(
    namespace: string,
    memoryId: string,
    limit: number,
  ): Promise<Array<{ sourceKey: string; content: ResolvedSource | null }>> {
    const store = this.storeForMergeNamespace(namespace);
    if (store === undefined) {
      throw new Error(
        "MemoriesClient: pass store or storeForNamespace in the constructor to use resolveSourcesForMemory",
      );
    }
    const maps = this.persistence.listSourceMapsForMemory(memoryId, limit);
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
