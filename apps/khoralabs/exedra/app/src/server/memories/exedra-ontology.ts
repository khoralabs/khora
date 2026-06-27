import { retrievalSimilarityOntology } from "@khoralabs/memories-autolink";
import { defineOntology } from "@khoralabs/memories-core";
import { mergeOntologies } from "@khoralabs/memories-core/helpers";
import z from "zod";

/**
 * A salience facet: a compressible slice of high information density from prose.
 * Not a part-of-speech tag — a standalone dimension (aspect) plus distilled statement.
 */
export const zFeature = z.object({
  aspect: z
    .string()
    .max(64)
    .describe(
      "Short facet name for the dimension (e.g. timeline, stakeholder, constraint, preference, claim).",
    ),
  statement: z
    .string()
    .max(500)
    .describe(
      "Information-dense statement for this facet; readable without the surrounding prose.",
    ),
});

export type ExedraFeature = z.infer<typeof zFeature>;

/** Homogeneous node + semantic related edges for Exedra memories. */
export const exedraOntology = defineOntology({
  nodeLabels: {
    memory: z.object({
      features: z
        .array(zFeature)
        .max(12)
        .optional()
        .describe("Salience facets extracted from the memory prose."),
    }),
  },
  edgeLabels: {
    related: z.object({
      context: z
        .string()
        .describe("Natural-language description of why these memories are linked."),
      features: z
        .array(zFeature)
        .max(6)
        .optional()
        .describe("Salience facets describing the relationship itself."),
    }),
  },
});

/** App-wide client ontology including retrieval autolink edge kinds. */
export const exedraMemoriesOntology = mergeOntologies(exedraOntology, retrievalSimilarityOntology);

export type ExedraOntology = typeof exedraOntology;
export type ExedraMemoriesOntology = typeof exedraMemoriesOntology;
