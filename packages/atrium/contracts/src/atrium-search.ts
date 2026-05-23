import z from "zod";
import { zAtriumPost } from "./atrium-post.ts";
import { zAtriumProfile } from "./atrium-profile.ts";

/** GET /v1/search query params. */
export type AtriumSearchQuery = {
  q: string;
  topK?: number;
  neighbors?: boolean;
  maxNeighbors?: number;
  namespace?: string;
};

const zSearchContent = z.object({
  text: z.string().optional(),
  vector: z.array(z.number()).optional(),
});

const zSearchLabels = z.object({
  all: z.array(z.string()).optional(),
  some: z.array(z.string()).optional(),
});

const zSearchOptions = z.object({
  topK: z.number().int().min(1).max(50).optional(),
  minScore: z.number().optional(),
  labels: zSearchLabels.optional(),
  neighbors: z.union([z.boolean(), z.record(z.string(), z.unknown())]).optional(),
  maxNeighbors: z.number().int().min(0).max(50).optional(),
  arms: z
    .object({
      vector: z.number().optional(),
      lexical: z.number().optional(),
    })
    .optional(),
  maxVectorDistance: z.number().optional(),
});

/** POST /v1/search JSON body. */
export const zAtriumSearchRequest = z.object({
  namespace: z.string().optional(),
  additionalNamespaces: z.array(z.string()).optional(),
  searchEntireDatabase: z.literal(true).optional(),
  searchScopeMode: z.enum(["pathSubtree", "scopeDag", "exactScope"]).optional(),
  content: zSearchContent,
  options: zSearchOptions.optional(),
  asOfTimestampMs: z.number().optional(),
});

export type AtriumSearchRequest = z.infer<typeof zAtriumSearchRequest>;

export const zAtriumSearchHydratedEntity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), entity: zAtriumPost }),
  z.object({ kind: z.literal("probe"), entity: zAtriumPost }),
  z.object({ kind: z.literal("profile"), entity: zAtriumProfile }),
  z.object({ kind: z.literal("ghost"), postId: z.string() }),
]);

export type AtriumSearchHydratedEntity = z.infer<typeof zAtriumSearchHydratedEntity>;

const zAtriumSearchNeighborHit = z
  .object({
    hydrated: zAtriumSearchHydratedEntity.optional(),
  })
  .loose();

export const zAtriumSearchHit = z
  .object({
    score: z.number(),
    hydrated: zAtriumSearchHydratedEntity.optional(),
    neighbors: z.array(zAtriumSearchNeighborHit).optional(),
  })
  .loose();

export type AtriumSearchHit = z.infer<typeof zAtriumSearchHit>;

export const zAtriumSearchResponse = z.object({
  hits: z.array(zAtriumSearchHit),
});

export type AtriumSearchResponse = z.infer<typeof zAtriumSearchResponse>;
