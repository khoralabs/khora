import z from "zod";

/** HTTP body for `POST /v1/relationships`. */
export const zKhoraRelationshipCreate = z.object({
  peerDid: z.string().trim().min(1),
});

export type KhoraRelationshipCreate = z.infer<typeof zKhoraRelationshipCreate>;

export const zKhoraRelationshipRole = z.enum(["creator", "peer"]);
export const zKhoraRelationshipStatus = z.enum(["pending", "accepted"]);

export const zKhoraRelationship = z.object({
  channelId: z.string().min(1),
  peerDid: z.string().min(1),
  role: zKhoraRelationshipRole,
  status: zKhoraRelationshipStatus,
  createdAtMs: z.number(),
});

export type KhoraRelationship = z.infer<typeof zKhoraRelationship>;

export const zKhoraRelationshipListResponse = z.object({
  relationships: z.array(zKhoraRelationship),
});

export type KhoraRelationshipListResponse = z.infer<typeof zKhoraRelationshipListResponse>;

/** Single relationship returned from create / accept. */
export const zKhoraRelationshipResponse = z.object({
  relationship: zKhoraRelationship,
});

export type KhoraRelationshipResponse = z.infer<typeof zKhoraRelationshipResponse>;

/** Inbox notification when a peer is invited to connect. */
export const zKhoraConnectionRequestPayload = z.object({
  channelId: z.string().min(1),
  fromPrincipalId: z.string().min(1),
  createdAtMs: z.number(),
});

export type KhoraConnectionRequestPayload = z.infer<typeof zKhoraConnectionRequestPayload>;
