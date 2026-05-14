import z from "zod";

/** Body for `POST /v1/atrium/rooms` (authenticated). Room ids are always minted server-side. */
export const zAtriumRoomCreateBody = z
  .object({
    ttlMs: z
      .number()
      .int()
      .min(60_000)
      .max(86400_000 * 7)
      .optional(),
    /** Invite this DID to join (inbox `negotiation_ticket`). */
    targetDid: z.string().trim().min(1).optional(),
    /** Alternative to `targetDid`: resolve registered username on this host. */
    targetUsername: z.string().trim().min(1).optional(),
  })
  .strict();

export type AtriumRoomCreateBody = z.infer<typeof zAtriumRoomCreateBody>;

/** Ticket payload from create or from `POST /v1/atrium/rooms/:roomId/ticket` (rejoin). */
export const zAtriumRoomTicketResponse = z.object({
  roomId: z.string(),
  ticket: z.string(),
  /** Full WebSocket URL (includes `ticket` query); use with `@khoralabs/atrium-client` `connectAtriumRoom` or `connectObpWebSocketSession`. */
  webSocketUrl: z.string(),
  expiresAtMs: z.number().optional(),
});

export type AtriumRoomTicketResponse = z.infer<typeof zAtriumRoomTicketResponse>;

export const zAtriumRoomRole = z.enum(["creator", "peer"]);

export type AtriumRoomRole = z.infer<typeof zAtriumRoomRole>;

export const zAtriumRoomSummary = z.object({
  roomId: z.string(),
  role: zAtriumRoomRole,
  createdAtMs: z.number(),
  expiresAtMs: z.number().nullable(),
  /** Other party’s DID when known; null if no invitee yet (creator-only room). */
  counterpartDid: z.string().nullable(),
  counterpartUsername: z.string().nullable().optional(),
  /** Present when viewer is creator: DID the room was offered to, if any. */
  inviteTargetDid: z.string().nullable().optional(),
});

export type AtriumRoomSummary = z.infer<typeof zAtriumRoomSummary>;

export const zAtriumRoomListResponse = z.object({
  rooms: z.array(zAtriumRoomSummary),
});

export type AtriumRoomListResponse = z.infer<typeof zAtriumRoomListResponse>;

/** Optional body for `POST /v1/atrium/rooms/:roomId/ticket`. */
export const zAtriumRoomMintTicketBody = z
  .object({
    ttlMs: z
      .number()
      .int()
      .min(60_000)
      .max(86400_000 * 7)
      .optional(),
  })
  .strict();

export type AtriumRoomMintTicketBody = z.infer<typeof zAtriumRoomMintTicketBody>;
