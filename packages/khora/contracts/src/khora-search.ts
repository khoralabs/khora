import z from "zod";
import { zKhoraPost } from "./khora-post.ts";
import { zKhoraProfile } from "./khora-profile.ts";
import { zSearchContent, zSearchLabels } from "./khora-standing-search.ts";

/** GET /v1/search query params. */
export type KhoraSearchQuery = {
  q: string;
  topK?: number;
  neighbors?: boolean;
  maxNeighbors?: number;
  namespace?: string;
};

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
export const zKhoraSearchRequest = z.object({
  namespace: z.string().optional(),
  additionalNamespaces: z.array(z.string()).optional(),
  searchEntireDatabase: z.literal(true).optional(),
  searchScopeMode: z.enum(["pathSubtree", "scopeDag", "exactScope"]).optional(),
  content: zSearchContent,
  options: zSearchOptions.optional(),
  asOfTimestampMs: z.number().optional(),
});

export type KhoraSearchRequest = z.infer<typeof zKhoraSearchRequest>;

export {
  type KhoraStandingSearchRequest,
  zKhoraStandingSearchRequest,
} from "./khora-standing-search.ts";

export const zKhoraSearchHydratedEntity = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), entity: zKhoraPost }),
  z.object({ kind: z.literal("subscription"), entity: zKhoraPost }),
  z.object({ kind: z.literal("profile"), entity: zKhoraProfile }),
  z.object({ kind: z.literal("ghost"), postId: z.string() }),
]);

export type KhoraSearchHydratedEntity = z.infer<typeof zKhoraSearchHydratedEntity>;

const zKhoraSearchNeighborHit = z
  .object({
    hydrated: zKhoraSearchHydratedEntity.optional(),
  })
  .loose();

export const zKhoraSearchHit = z
  .object({
    score: z.number(),
    hydrated: zKhoraSearchHydratedEntity.optional(),
    neighbors: z.array(zKhoraSearchNeighborHit).optional(),
  })
  .loose();

export type KhoraSearchHit = z.infer<typeof zKhoraSearchHit>;

export const zKhoraSearchResponse = z.object({
  hits: z.array(zKhoraSearchHit),
});

export type KhoraSearchResponse = z.infer<typeof zKhoraSearchResponse>;
