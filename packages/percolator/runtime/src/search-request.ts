import z from "zod";

const zSearchContent = z.object({
  text: z.string().optional(),
  vector: z.array(z.number()).optional(),
});

const zSearchLabels = z.object({
  all: z.array(z.string()).optional(),
  some: z.array(z.string()).optional(),
});

const zSearchOptions = z.object({
  minScore: z.number().optional(),
  labels: zSearchLabels.optional(),
  arms: z
    .object({
      lexical: z.number().optional(),
      vector: z.number().optional(),
    })
    .optional(),
  maxVectorDistance: z.number().optional(),
});

export const zStandingSearchRequest = z.object({
  namespace: z.string().optional(),
  additionalNamespaces: z.array(z.string()).optional(),
  searchEntireDatabase: z.literal(true).optional(),
  searchScopeMode: z.enum(["pathSubtree", "scopeDag", "exactScope"]).optional(),
  content: zSearchContent,
  options: zSearchOptions.optional(),
});

export type StandingSearchRequest = z.infer<typeof zStandingSearchRequest>;
