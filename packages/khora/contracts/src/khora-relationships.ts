import z from "zod";

/** Viewer’s role in a pairwise room / frame-channel relationship. */
export const zKhoraRelationshipRole = z.enum(["creator", "peer"]);

export type KhoraRelationshipRole = z.infer<typeof zKhoraRelationshipRole>;

/**
 * One relationship row for the authenticated principal (from Colonnade social persistence).
 * `roomId` is the frame-channel id (same as `channelId` in relay-colonnade).
 */
export const zKhoraRelationshipItem = z.object({
  roomId: z.string(),
  role: zKhoraRelationshipRole,
  creatorDid: z.string(),
  peerDid: z.string().nullable(),
  createdAtMs: z.number(),
  expiresAtMs: z.number().optional(),
});

export type KhoraRelationshipItem = z.infer<typeof zKhoraRelationshipItem>;

export const zKhoraRelationshipListResponse = z.object({
  relationships: z.array(zKhoraRelationshipItem),
});

export type KhoraRelationshipListResponse = z.infer<typeof zKhoraRelationshipListResponse>;
