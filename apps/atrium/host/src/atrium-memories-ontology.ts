import { retrievalAutolinkOntology } from "@khoralabs/memories-autolink";
import { defineOntology } from "@khoralabs/memories-core";
import { mergeOntologies } from "@khoralabs/memories-core/helpers";
import { canonicalOntology } from "@khoralabs/memories-core/ontologies";
import z from "zod";

/** Probe ontology plus retrieval autolink edge/node kinds for Atrium merges. */
export const atriumMemoriesOntology = mergeOntologies(
  defineOntology({
    nodeLabels: {
      probe: z
        .object({
          ownerProfileId: z
            .string()
            .min(1)
            .describe("Profile id of the subscriber who owns this probe."),
          matchPostKinds: z
            .array(z.enum(["post", "status"]))
            .optional()
            .describe(
              "Only match incoming posts with these kinds (post and/or status); omit to match any indexed incoming kind used in probe fan-out.",
            ),
        })
        .describe(
          "Semantic subscription stored as searchable memory; matched when other posts align in hybrid search.",
        ),
    },
    edgeLabels: {},
  }),
  canonicalOntology,
  retrievalAutolinkOntology,
);

export type AtriumMemoriesTNode = (typeof atriumMemoriesOntology)["nodeLabels"];
export type AtriumMemoriesTEdge = (typeof atriumMemoriesOntology)["edgeLabels"];
