import type {
  KhoraInboxNotification,
  KhoraPost,
  KhoraProfile,
  KhoraRegistrationResult,
} from "@khoralabs/khora-contracts";
import type { InboxNotificationRow, InboxWsDrainMessage } from "./inbox-ws";

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
      notification: KhoraInboxNotification;
      did: string;
    }
  | {
      type: "inbox:connection_request";
      id: number;
      notification: Extract<KhoraInboxNotification, { kind: "connection_request" }>;
      did: string;
    }
  | {
      type: "inbox:host";
      id: number;
      notification: Extract<KhoraInboxNotification, { kind: "host" }>;
      did: string;
    }
  | {
      type: "inbox:post";
      id: number;
      notification: Extract<KhoraInboxNotification, { kind: "inbox_post" }>;
      did: string;
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
    case "inbox:post":
      return true;
    default:
      return false;
  }
}
