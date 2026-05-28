import z from "zod";

/** Body for `POST /v1/khora/rooms` (authenticated). Room ids are always minted server-side. */
export const zKhoraRoomCreateBody = z
  .object({
    ttlMs: z
      .number()
      .int()
      .min(60_000)
      .max(86400_000 * 7)
      .optional(),
    /** Invite this DID to join (inbox `room_ticket`). */
    targetDid: z.string().trim().min(1).optional(),
    /** Alternative to `targetDid`: resolve registered username on this host. */
    targetUsername: z.string().trim().min(1).optional(),
  })
  .strict();

export type KhoraRoomCreateBody = z.infer<typeof zKhoraRoomCreateBody>;

/** Ticket payload from create or from `POST /v1/khora/rooms/:roomId/ticket` (rejoin). */
export const zKhoraRoomTicketResponse = z.object({
  roomId: z.string(),
  ticket: z.string(),
  /** Full WebSocket URL (includes `ticket` query); use with `@khoralabs/khora-client` `connectKhoraRoom` or `connectObpWebSocketSession`. */
  webSocketUrl: z.string(),
  expiresAtMs: z.number().optional(),
});

export type KhoraRoomTicketResponse = z.infer<typeof zKhoraRoomTicketResponse>;

/** Response from `POST /v1/rooms/join` — ticket plus room owner DID (no host hook required). */
export const zKhoraRoomJoinTicketResponse = zKhoraRoomTicketResponse.extend({
  creatorDid: z.string().min(1),
});

export type KhoraRoomJoinTicketResponse = z.infer<typeof zKhoraRoomJoinTicketResponse>;

/**
 * Response from `POST /v1/rooms`. When the room is created without `targetDid`/`targetUsername`,
 * `joinToken` is present for one-time OOB sharing; the peer redeems via `POST /v1/rooms/join`.
 */
export const zKhoraRoomCreateResponse = zKhoraRoomTicketResponse.extend({
  joinToken: z.string().min(1).optional(),
});

export type KhoraRoomCreateResponse = z.infer<typeof zKhoraRoomCreateResponse>;

/** Body for `POST /v1/rooms/join` (authenticated). */
export const zKhoraRoomJoinRequestBody = z
  .object({
    joinToken: z.string().trim().min(1),
  })
  .strict();

export type KhoraRoomJoinRequestBody = z.infer<typeof zKhoraRoomJoinRequestBody>;

export const zKhoraRoomRole = z.enum(["creator", "peer"]);

export type KhoraRoomRole = z.infer<typeof zKhoraRoomRole>;

export const zKhoraRoomSummary = z.object({
  roomId: z.string(),
  role: zKhoraRoomRole,
  createdAtMs: z.number(),
  expiresAtMs: z.number().nullable(),
  /** Other party’s DID when known; null if no invitee yet (creator-only room). */
  counterpartDid: z.string().nullable(),
  counterpartUsername: z.string().nullable().optional(),
  /** Present when viewer is creator: DID the room was offered to, if any. */
  inviteTargetDid: z.string().nullable().optional(),
});

export type KhoraRoomSummary = z.infer<typeof zKhoraRoomSummary>;

export const zKhoraRoomListResponse = z.object({
  rooms: z.array(zKhoraRoomSummary),
});

export type KhoraRoomListResponse = z.infer<typeof zKhoraRoomListResponse>;

/** Optional body for `POST /v1/khora/rooms/:roomId/ticket`. */
export const zKhoraRoomMintTicketBody = z
  .object({
    ttlMs: z
      .number()
      .int()
      .min(60_000)
      .max(86400_000 * 7)
      .optional(),
  })
  .strict();

export type KhoraRoomMintTicketBody = z.infer<typeof zKhoraRoomMintTicketBody>;
