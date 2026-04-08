import type { Database } from "bun:sqlite";
import type z from "zod";
import { type DeleteMemoryParams, deleteMemory as deleteMemoryHandler } from "./delete-memory";
import {
  type MergeMemoryParams,
  type MutationCtx,
  mergeMemory,
  zMergeMemoryContentItem,
} from "./merge-memory";
import type { EdgeLabelInstance, NodeLabelInstance, OntologyDefinition } from "./ontology";
import { validateEdgeLabel, validateNodeLabel } from "./ontology";
import { type SearchHit, type SearchParams, search as searchHandler } from "./search";

type LabelKind<TLabels extends Record<string, z.ZodType>> = keyof TLabels & string;

export type TypedMergeParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = MergeMemoryParams<NodeLabelInstance<TNode>, EdgeLabelInstance<TEdge>>;

export type TypedSearchParams<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchParams<LabelKind<TNode>, LabelKind<TEdge>>;

export type TypedSearchHit<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> = SearchHit<LabelKind<TNode>, LabelKind<TEdge>>;

/**
 * SQLite-backed memories API with a **fixed ontology**: node/edge label kinds and per-kind props are
 * validated via Zod before {@link mergeMemory}.
 */
export class MemoriesClient<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
> {
  readonly ontology: OntologyDefinition<TNode, TEdge>;

  constructor(
    readonly db: Database,
    ontology: OntologyDefinition<TNode, TEdge>,
  ) {
    this.ontology = ontology;
  }

  private get mutationCtx(): MutationCtx {
    return { db: this.db };
  }

  /**
   * Validates content items and ontology labels, maps labels to stored string identities, then runs
   * {@link mergeMemory} in a transaction.
   */
  mergeMemory(params: TypedMergeParams<TNode, TEdge>): void {
    for (const item of params.content) {
      zMergeMemoryContentItem.parse(item);
    }

    const labelStrings = params.labels.map((l) => validateNodeLabel(this.ontology, l));

    const edgesMapped = params.edges.map((e) => ({
      memory_key: e.memory_key,
      direction: e.direction,
      label: validateEdgeLabel(this.ontology, e.label),
      properties: e.properties,
    }));

    const flat: MergeMemoryParams<string, string> = {
      key: params.key,
      namespace: params.namespace,
      content: params.content,
      labels: labelStrings,
      properties: params.properties,
      edges: edgesMapped,
    };

    mergeMemory(this.mutationCtx, flat);
  }

  /** Deletes the memory and cascaded data; delegates to the package `deleteMemory` function. */
  deleteMemory(params: DeleteMemoryParams): void {
    deleteMemoryHandler(this.mutationCtx, params);
  }

  /** Runs the package `search` function against this database. */
  search(params: TypedSearchParams<TNode, TEdge>): TypedSearchHit<TNode, TEdge>[] {
    return searchHandler(this.mutationCtx, params);
  }
}
