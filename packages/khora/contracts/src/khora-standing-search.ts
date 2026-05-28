import z from "zod";

export const zSearchContent = z.object({
  text: z.string().optional(),
  vector: z.array(z.number()).optional(),
});

export const zSearchLabels = z.object({
  all: z.array(z.string()).optional(),
  some: z.array(z.string()).optional(),
});

const zStandingSearchOptions = z.object({
  minScore: z.number().optional(),
  labels: zSearchLabels.optional(),
  arms: z
    .object({
      vector: z.number().optional(),
      lexical: z.number().optional(),
    })
    .optional(),
  maxVectorDistance: z.number().optional(),
});

/** Mirrors @khoralabs/percolator zStandingSearchRequest — keep in sync manually. */
export const zKhoraStandingSearchRequest = z.object({
  namespace: z.string().optional(),
  additionalNamespaces: z.array(z.string()).optional(),
  searchEntireDatabase: z.literal(true).optional(),
  searchScopeMode: z.enum(["pathSubtree", "scopeDag", "exactScope"]).optional(),
  content: zSearchContent,
  options: zStandingSearchOptions.optional(),
});

export type KhoraStandingSearchRequest = z.infer<typeof zKhoraStandingSearchRequest>;
