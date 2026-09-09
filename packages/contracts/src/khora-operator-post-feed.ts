import z from "zod";
import { zKhoraPostKind, zKhoraPostVisibility } from "./khora-post";
import { zKhoraStandingSearchRequest } from "./khora-standing-search";

/** Operator-facing feed item (hydrated from memories post index + outbox). */
export const zOperatorFeedPost = z.object({
  id: z.string().min(1),
  kind: zKhoraPostKind,
  authorDid: z.string().min(1),
  authorProfileId: z.string().min(1).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  topics: z.array(z.string()),
  visibility: zKhoraPostVisibility,
  /** Index time from the memories post index (`_ts_created`). */
  indexedAtMs: z.number(),
  /** Present when `kind === "subscription"`. */
  search: zKhoraStandingSearchRequest.optional(),
});

export type OperatorFeedPost = z.infer<typeof zOperatorFeedPost>;

/** GET /v1/ops/posts response. */
export const zOperatorPostFeedListResponse = z.object({
  items: z.array(zOperatorFeedPost),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  watermarkMs: z.number(),
});

export type OperatorPostFeedListResponse = z.infer<typeof zOperatorPostFeedListResponse>;

/** GET /v1/ops/posts/newer-count response. */
export const zOperatorPostFeedNewerCountResponse = z.object({
  count: z.number().int().nonnegative(),
});

export type OperatorPostFeedNewerCountResponse = z.infer<
  typeof zOperatorPostFeedNewerCountResponse
>;
