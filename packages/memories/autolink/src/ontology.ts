import {
  defineOntology,
  type LabelSchemaMap,
  type OntologyDefinition,
} from "@khoralabs/memories-core";
import z from "zod";

/** Edge kind for retrieval-only links (lexical / hybrid search grounding). */
export const RETRIEVAL_AUTOLINK_EDGE_KIND = "retrieval_autolink" as const;

/** Optional node kind marking a memory that went through lexical autolink bootstrap. */
export const RETRIEVAL_BOOTSTRAP_NODE_KIND = "retrieval_bootstrap" as const;

/** JSON-stable snapshot of search tunables (persisted on each autolink edge). */
export const zRetrievalSearchConfig = z.record(z.string(), z.unknown());

export const zRetrievalAutolinkEdgeProps = z.object({
  similarityScore: z.number(),
  searchConfig: zRetrievalSearchConfig,
  rank: z.number().int().nonnegative().optional(),
  hitMemoryKey: z.string().optional(),
  hitSourceKey: z.string().optional(),
});

export const zRetrievalBootstrapNodeProps = z.object({
  source: z.literal("lexical_autolink"),
});

/**
 * Small ontology fragment for lexical / retrieval autolinking.
 * Compose with your primary ontology via {@link mergeOntologies} or object spread.
 */
export const retrievalAutolinkOntology = defineOntology({
  nodeLabels: {
    [RETRIEVAL_BOOTSTRAP_NODE_KIND]: zRetrievalBootstrapNodeProps,
  },
  edgeLabels: {
    [RETRIEVAL_AUTOLINK_EDGE_KIND]: zRetrievalAutolinkEdgeProps,
  },
});

export type RetrievalAutolinkOntology = typeof retrievalAutolinkOntology;

export type RetrievalAutolinkNodeLabels = (typeof retrievalAutolinkOntology)["nodeLabels"];
export type RetrievalAutolinkEdgeLabels = (typeof retrievalAutolinkOntology)["edgeLabels"];

/**
 * Merge two ontologies by spreading `nodeLabels` and `edgeLabels`.
 * On key collision, **extension** keys overwrite **base** keys.
 */
export function mergeOntologies<
  TN1 extends LabelSchemaMap,
  TE1 extends LabelSchemaMap,
  TN2 extends LabelSchemaMap,
  TE2 extends LabelSchemaMap,
>(
  base: OntologyDefinition<TN1, TE1>,
  extension: OntologyDefinition<TN2, TE2>,
): OntologyDefinition<TN1 & TN2, TE1 & TE2> {
  return defineOntology({
    nodeLabels: { ...base.nodeLabels, ...extension.nodeLabels } as TN1 & TN2,
    edgeLabels: { ...base.edgeLabels, ...extension.edgeLabels } as TE1 & TE2,
  });
}
