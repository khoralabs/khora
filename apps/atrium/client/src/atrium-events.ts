import type { AtriumPost, AtriumProfile, AtriumRegistrationResult } from "@cfd/atrium-contracts";
import type { AgentNotification } from "@cfd/swarm-host";
import type { InboxNotificationRow } from "./inbox-ws.ts";

/** Pull-based inbox list payload (same shape as `AtriumClient.listInbox` resolution value). */
export type AtriumInboxListPayload = {
  notifications: InboxNotificationRow[];
};

/**
 * All successful RPC / inbox outcomes surfaced by `AtriumClient.prototype.subscribe`.
 *
 * **`inbox:*` live frames:** For each WebSocket notification frame, `inbox:notification` is always
 * emitted first. When `notification.kind` matches a known variant, an additional **derived** event
 * (`inbox:probe_hit`, `inbox:topic_post`, etc.) is emitted from the same frame—useful for routers
 * without branching on `kind`. Derived events are redundant with `inbox:notification`.
 */
export type AtriumClientEvent =
  | { type: "registration:completed"; result: AtriumRegistrationResult; requestDid: string }
  | { type: "profile:updated"; profile: AtriumProfile; did: string }
  | { type: "post:created"; post: AtriumPost; did: string }
  | { type: "post:updated"; post: AtriumPost; did: string }
  | { type: "post:deleted"; postId: string; did: string }
  | { type: "topic:subscribed"; topicSlug: string; did: string }
  | { type: "topic:unsubscribed"; topicSlug: string; did: string }
  | { type: "inbox:list"; result: AtriumInboxListPayload; did: string }
  | { type: "inbox:snapshot"; notifications: InboxNotificationRow[]; did: string }
  | { type: "inbox:notification"; id: number; notification: AgentNotification; did: string }
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
      type: "inbox:negotiation_ticket";
      id: number;
      notification: Extract<AgentNotification, { kind: "negotiation_ticket" }>;
      did: string;
    }
  | {
      type: "inbox:topic_post";
      id: number;
      notification: Extract<AgentNotification, { kind: "topic_post" }>;
      did: string;
    }
  | {
      type: "inbox:probe_hit";
      id: number;
      notification: Extract<AgentNotification, { kind: "probe_hit" }>;
      did: string;
    };

export type AtriumDerivedInboxEvent = Exclude<
  Extract<AtriumClientEvent, { type: `inbox:${string}` }>,
  { type: "inbox:list" } | { type: "inbox:snapshot" } | { type: "inbox:notification" }
>;

export function isInboxNotificationEvent(
  e: AtriumClientEvent,
): e is Extract<AtriumClientEvent, { type: "inbox:notification" }> {
  return e.type === "inbox:notification";
}

export function isDerivedInboxKindEvent(e: AtriumClientEvent): e is AtriumDerivedInboxEvent {
  switch (e.type) {
    case "inbox:connection_request":
    case "inbox:host":
    case "inbox:negotiation_ticket":
    case "inbox:topic_post":
    case "inbox:probe_hit":
      return true;
    default:
      return false;
  }
}
