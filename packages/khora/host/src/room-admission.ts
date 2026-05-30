import type { FrameChannelHubPort } from "@khoralabs/agent-relay";
import type { SocialRelationshipPersistence } from "@khoralabs/relay-colonnade";
import type { KhoraHostContext } from "./context";
import { enqueueCellInboxInline } from "./relay-cell-inbox";

export type RoomRegistryMeta = {
  creatorDid: string;
  inviteTargetDid: string | null;
};

/** Inline inbox payload for `kind: "room_ticket"` (Tier 3 admission only). */
export type RoomTicketInlinePayload = {
  kind: "room_ticket";
  channelId: string;
  ticket: string;
  webSocketUrl: string;
  expiresAtMs: number;
  issuedAtMs: number;
  fromPrincipalId: string;
};

export type MintRoomChannelTicketOpts = {
  roomHub: FrameChannelHubPort;
  social: SocialRelationshipPersistence;
  roomId: string;
  ttlMs: number;
  registryMeta: RoomRegistryMeta;
  upsertRoomRegistry: (roomId: string, meta: RoomRegistryMeta & { expiresAtMs: number }) => void;
  /** e.g. `wss://host` from the incoming HTTP request */
  webSocketBase: string;
};

/**
 * Rotate frame-channel ticket, sync catalog registry TTL, and relationship expiry.
 * Preserves `room_frames` (see `rotateChannelTicket` on the hub).
 */
export async function mintRoomChannelTicketAndSync(
  opts: MintRoomChannelTicketOpts,
): Promise<{ ticket: string; webSocketUrl: string; expiresAtMs: number }> {
  const now = Date.now();
  const expiresAtMs = now + opts.ttlMs;
  const { ticket } = await opts.roomHub.rotateChannelTicket(opts.roomId, opts.ttlMs);
  const webSocketUrl = `${opts.webSocketBase}/v1/rooms/${encodeURIComponent(opts.roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  opts.upsertRoomRegistry(opts.roomId, { ...opts.registryMeta, expiresAtMs });
  opts.social.refreshRelationshipTicketExpiry({
    channelId: opts.roomId,
    expiresAtMs,
  });
  return { ticket, webSocketUrl, expiresAtMs };
}

export type RoomAdmissionInboxCtx = Pick<KhoraHostContext, "host" | "tenantKey" | "cluster">;

/** Push `room_ticket` to a principal's cell inbox and optional live inbox WebSocket. */
export async function deliverRoomTicketToPrincipal(
  ctx: RoomAdmissionInboxCtx,
  recipientDid: string,
  payload: RoomTicketInlinePayload,
): Promise<void> {
  await enqueueCellInboxInline(ctx, recipientDid, payload);
  const hub = ctx.host.inboxHub;
  if (hub !== undefined && hub.listenerCount(recipientDid) > 0) {
    hub.broadcast(recipientDid, {
      type: "notification",
      id: payload.issuedAtMs,
      notification: {
        kind: "room_ticket",
        payload: {
          channelId: payload.channelId,
          ticket: payload.ticket,
          expiresAtMs: payload.expiresAtMs,
          issuedAtMs: payload.issuedAtMs,
          fromPrincipalId: payload.fromPrincipalId,
        },
      },
    });
  }
}
