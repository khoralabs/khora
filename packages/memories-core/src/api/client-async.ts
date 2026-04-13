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
import type { OntologyDefinition } from "./ontology";
import { validateEdgeLabel, validateNodeLabel } from "./ontology";
import {
  type SearchHit,
  type SearchParams,
  searchAsync as searchHandlerAsync,
} from "./search-async";

type LabelKind<TLabels extends Record<string, z.ZodType>> = keyof TLabels & string;

export type TypedMergeParamsAsync<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = MergeMemoryParams;

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

  constructor(persistence: MemoriesPersistenceAsync, ontology: OntologyDefinition<TNode, TEdge>) {
    this.persistence = persistence;
    this.ontology = ontology;
  }

  private get mutationCtx(): MutationCtxAsync {
    return { persistence: this.persistence };
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

    return mergeMemoryAsync(this.mutationCtx, {
      key: params.key,
      namespace: params.namespace,
      content: params.content,
      labels: labelInstances,
      properties: params.properties,
      edges: edgesMapped,
      searchMetaVector: params.searchMetaVector,
      ontology: this.ontology,
    });
  }

  async deleteMemory(params: DeleteMemoryParams): Promise<void> {
    return deleteMemoryAsync(this.mutationCtx, params);
  }

  async search(
    params: TypedSearchParamsAsync<TNode, TEdge>,
  ): Promise<TypedSearchHitAsync<TNode, TEdge>[]> {
    return searchHandlerAsync(this.mutationCtx, params);
  }
}
