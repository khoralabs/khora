import { defineOntology } from "@cfd/memories-core";
import { canonicalOntology } from "@cfd/memories-core/ontologies";
import z from "zod";

/** Canonical memories ontology plus Swarm-host labels (e.g. semantic probe subscriptions). */
export const swarmHostOntology = defineOntology({
  nodeLabels: {
    ...canonicalOntology.nodeLabels,
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
  edgeLabels: {
    ...canonicalOntology.edgeLabels,
  },
});
