import type { AgentNotification } from "@khoralabs/host-runtime";
import type { KhoraPost, KhoraProfile, KhoraRegistrationResult } from "@khoralabs/khora-contracts";
import type { InboxNotificationRow, InboxWsDrainMessage } from "./inbox-ws";

// ---------------------------------------------------------------------------
// Host/embedder callbacks (server-side, no secrets)
// Fired by the khora server; consumed by KhoraHost via `ctx.roomLifecycle`.
// ---------------------------------------------------------------------------

export type KhoraRoomLifecycleHostEvent =
  | {
      kind: "room_created";
      roomId: string;
      creatorDid: string;
      inviteTargetDid: string | null;
      hasOpenInvite: boolean;
      expiresAtMs: number;
    }
  | {
      kind: "room_ticket_minted";
      roomId: string;
      principalDid: string;
      expiresAtMs: number;
    }
  | {
      kind: "room_invite_redeemed";
      roomId: string;
      creatorDid: string;
      peerDid: string;
      expiresAtMs: number;
    };

// ---------------------------------------------------------------------------
// Client-side events (end-user SDK, surfaced by KhoraClient.prototype.subscribe)
// ---------------------------------------------------------------------------

/**
 * All successful RPC / inbox outcomes surfaced by `KhoraClient.prototype.subscribe`.
 *
 * **`inbox:*` live frames:** For each WebSocket notification frame, `inbox:notification` is always
 * emitted first. When `notification.kind` matches a known variant, an additional **derived** event
 * (`inbox:post`, etc.) is emitted from the same frame—useful for routers
 * without branching on `kind`. Derived events are redundant with `inbox:notification`.
 */
export type KhoraClientEvent =
  | {
      type: "registration:completed";
      result: KhoraRegistrationResult;
      requestDid: string;
    }
  | { type: "profile:updated"; profile: KhoraProfile; did: string }
  | { type: "post:created"; post: KhoraPost; did: string }
  | { type: "post:updated"; post: KhoraPost; did: string }
  | { type: "post:deleted"; postId: string; did: string }
  | {
      type: "inbox:snapshot";
      notifications: InboxNotificationRow[];
      did: string;
    }
  | {
      type: "inbox:drain";
      did: string;
      items: InboxWsDrainMessage["items"];
    }
  | {
      type: "inbox:notification";
      id: number;
      notification: AgentNotification;
      did: string;
    }
  | {
      type: "inbox:connection_request";
      id: number;
      notification: Extract<AgentNotification, { kind: "connection_request" }>;
      did: string;
    }
  | {
      type: "inbox:host";
      id: number;
      notification: Extract<AgentNotification, { kind: "host" }>;
      did: string;
    }
  | {
      type: "inbox:room_ticket";
      id: number;
      notification: Extract<AgentNotification, { kind: "room_ticket" }>;
      did: string;
    }
  | {
      type: "inbox:post";
      id: number;
      notification: Extract<AgentNotification, { kind: "inbox_post" }>;
      did: string;
    }
  | {
      type: "room:created";
      did: string;
      roomId: string;
      expiresAtMs?: number;
      hasOpenInvite: boolean;
      targetDid?: string;
      targetUsername?: string;
    }
  | {
      type: "room:ticket_minted";
      did: string;
      roomId: string;
      expiresAtMs?: number;
    }
  | {
      type: "room:invite_redeemed";
      did: string;
      roomId: string;
      creatorDid: string;
      expiresAtMs?: number;
    };

export type KhoraDerivedInboxEvent = Exclude<
  Extract<KhoraClientEvent, { type: `inbox:${string}` }>,
  { type: "inbox:snapshot" } | { type: "inbox:notification" }
>;

export function isInboxNotificationEvent(
  e: KhoraClientEvent,
): e is Extract<KhoraClientEvent, { type: "inbox:notification" }> {
  return e.type === "inbox:notification";
}

export function isDerivedInboxKindEvent(e: KhoraClientEvent): e is KhoraDerivedInboxEvent {
  switch (e.type) {
    case "inbox:connection_request":
    case "inbox:host":
    case "inbox:room_ticket":
    case "inbox:post":
      return true;
    default:
      return false;
  }
}
