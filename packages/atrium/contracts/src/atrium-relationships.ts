import z from "zod";

/** Viewer’s role in a pairwise room / frame-channel relationship. */
export const zAtriumRelationshipRole = z.enum(["creator", "peer"]);

export type AtriumRelationshipRole = z.infer<typeof zAtriumRelationshipRole>;

/**
 * One relationship row for the authenticated principal (from Colonnade social persistence).
 * `roomId` is the frame-channel id (same as `channelId` in relay-colonnade).
 */
export const zAtriumRelationshipItem = z.object({
  roomId: z.string(),
  role: zAtriumRelationshipRole,
  creatorDid: z.string(),
  peerDid: z.string().nullable(),
  createdAtMs: z.number(),
  expiresAtMs: z.number().optional(),
});

export type AtriumRelationshipItem = z.infer<typeof zAtriumRelationshipItem>;

export const zAtriumRelationshipListResponse = z.object({
  relationships: z.array(zAtriumRelationshipItem),
});

export type AtriumRelationshipListResponse = z.infer<typeof zAtriumRelationshipListResponse>;
