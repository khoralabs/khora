import z from "zod";
import { zKhoraPostKind, zKhoraPostVisibility } from "./khora-post";
import { zKhoraStandingSearchRequest } from "./khora-standing-search";

/** Public global feed item (catalog pointer timeline + outbox hydrate). */
export const zPublicFeedPost = z.object({
  id: z.string().min(1),
  kind: zKhoraPostKind,
  authorDid: z.string().min(1),
  authorProfileId: z.string().min(1).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  topics: z.array(z.string()),
  visibility: zKhoraPostVisibility,
  /** Outbox commit time copied onto the catalog pointer (`published_at_ms`). */
  publishedAtMs: z.number(),
  /** Present when `kind === "subscription"`. */
  search: zKhoraStandingSearchRequest.optional(),
});

export type PublicFeedPost = z.infer<typeof zPublicFeedPost>;

/** GET /v1/ops/posts response. */
export const zPublicPostFeedListResponse = z.object({
  items: z.array(zPublicFeedPost),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  watermarkMs: z.number(),
});

export type PublicPostFeedListResponse = z.infer<typeof zPublicPostFeedListResponse>;

/** GET /v1/ops/posts/newer-count response. */
export const zPublicPostFeedNewerCountResponse = z.object({
  count: z.number().int().nonnegative(),
});

export type PublicPostFeedNewerCountResponse = z.infer<typeof zPublicPostFeedNewerCountResponse>;
