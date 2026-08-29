import z from "zod";
import { zKhoraPost } from "./khora-post";
import { zKhoraProfile } from "./khora-profile";
import { zSearchContent, zSearchLabels } from "./khora-standing-search";

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

/** Bounds on memory `_ts_created` for hybrid search (mirrors memories `SearchAsOf`). */
export const zKhoraSearchAsOf = z
  .object({
    gt: z.number().optional(),
    gte: z.number().optional(),
    lt: z.number().optional(),
    lte: z.number().optional(),
  })
  .refine(
    (v) => v.gt !== undefined || v.gte !== undefined || v.lt !== undefined || v.lte !== undefined,
    { message: "asOf must include at least one of gt, gte, lt, lte" },
  );

export type KhoraSearchAsOf = z.infer<typeof zKhoraSearchAsOf>;

/** POST /v1/search JSON body. */
export const zKhoraSearchRequest = z
  .object({
    namespace: z.string().optional(),
    additionalNamespaces: z.array(z.string()).optional(),
    searchEntireDatabase: z.literal(true).optional(),
    searchScopeMode: z.enum(["pathSubtree", "scopeDag", "exactScope"]).optional(),
    content: zSearchContent,
    options: zSearchOptions.optional(),
    asOf: zKhoraSearchAsOf.optional(),
    /** @deprecated Prefer `asOf: { lte }`. */
    asOfTimestampMs: z.number().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.asOfTimestampMs !== undefined &&
      val.asOf?.lte !== undefined &&
      val.asOf.lte !== val.asOfTimestampMs
    ) {
      ctx.addIssue({
        code: "custom",
        message: "asOf.lte and asOfTimestampMs conflict (must be equal when both set)",
        path: ["asOfTimestampMs"],
      });
    }
  });

export type KhoraSearchRequest = z.infer<typeof zKhoraSearchRequest>;

export {
  type KhoraStandingSearchRequest,
  zKhoraStandingSearchRequest,
} from "./khora-standing-search";

/**
 * The original entity resolved from the author's outbox via sourcemap.
 * For posts and subscriptions, `authorDid` is derived from the address-encoded post ID —
 * it is not stored on the node, but computed at query time.
 */
export const zKhoraSearchOriginal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), post: zKhoraPost, authorDid: z.string() }),
  z.object({ kind: z.literal("subscription"), post: zKhoraPost, authorDid: z.string() }),
  z.object({ kind: z.literal("profile"), entity: zKhoraProfile }),
  z.object({ kind: z.literal("ghost"), postId: z.string() }),
]);

export type KhoraSearchOriginal = z.infer<typeof zKhoraSearchOriginal>;

const zKhoraSearchNeighborHit = z
  .object({
    original: zKhoraSearchOriginal.optional(),
  })
  .loose();

export const zKhoraSearchHit = z
  .object({
    score: z.number(),
    /** Which content feature of the memory matched (e.g. "body", "query"). */
    sourceKey: z.string().optional(),
    /** Original entity resolved from the author's outbox. */
    original: zKhoraSearchOriginal.optional(),
    neighbors: z.array(zKhoraSearchNeighborHit).optional(),
  })
  .loose();

export type KhoraSearchHit = z.infer<typeof zKhoraSearchHit>;

export const zKhoraSearchResponse = z.object({
  hits: z.array(zKhoraSearchHit),
});

export type KhoraSearchResponse = z.infer<typeof zKhoraSearchResponse>;
