import { defineOntology } from "@cfd/memories-core";
import z from "zod";

export const canonicalOntology = defineOntology({
    nodeLabels: {
      person: z.object({}),
      place: z.object({}),
      preference: z.object({}),
      event: z.object({}),
      fact: z.object({}),
      observation: z.object({}),
      belief: z.object({}),
      temporal: z.object({}),
    },
    edgeLabels: {
      references: z.object({}),
      affects: z.object({}),
      causes: z.object({}),
      describes: z.object({}),
      before: z.object({}),
      after: z.object({}),
      during: z.object({}),
      includes: z.object({}),
    },
  });