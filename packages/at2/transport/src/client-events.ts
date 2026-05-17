import type { AgentNotification } from "@khoralabs/agent-relay";
import type {
  AtriumPost,
  AtriumProfile,
  AtriumRegistrationResult,
} from "@khoralabs/at2-contracts";
import type { InboxNotificationRow, InboxWsDrainMessage } from "./inbox-ws.ts";

/**
 * All successful RPC / inbox outcomes surfaced by `At2Client.prototype.subscribe`.
 *
 * **`inbox:*` live frames:** For each WebSocket notification frame, `inbox:notification` is always
 * emitted first. When `notification.kind` matches a known variant, an additional **derived** event
 * (`inbox:post`, etc.) is emitted from the same frame—useful for routers
 * without branching on `kind`. Derived events are redundant with `inbox:notification`.
 */
export type At2ClientEvent =
  | { type: "registration:completed"; result: AtriumRegistrationResult; requestDid: string }
  | { type: "profile:updated"; profile: AtriumProfile; did: string }
  | { type: "post:created"; post: AtriumPost; did: string }
  | { type: "post:updated"; post: AtriumPost; did: string }
  | { type: "post:deleted"; postId: string; did: string }
  | { type: "topic:subscribed"; topicSlug: string; did: string }
  | { type: "topic:unsubscribed"; topicSlug: string; did: string }
  | { type: "author:subscribed"; username: string; authorDid: string; did: string }
  | { type: "author:unsubscribed"; username: string; did: string }
  | {
      type: "author_topic:subscribed";
      username: string;
      authorDid: string;
      topicSlug: string;
      did: string;
    }
  | { type: "author_topic:unsubscribed"; username: string; topicSlug: string; did: string }
  | { type: "inbox:snapshot"; notifications: InboxNotificationRow[]; did: string }
  | {
      type: "inbox:drain";
      did: string;
      items: InboxWsDrainMessage["items"];
    }
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
    };

export type At2DerivedInboxEvent = Exclude<
  Extract<At2ClientEvent, { type: `inbox:${string}` }>,
  { type: "inbox:snapshot" } | { type: "inbox:notification" }
>;

export function isInboxNotificationEvent(
  e: At2ClientEvent,
): e is Extract<At2ClientEvent, { type: "inbox:notification" }> {
  return e.type === "inbox:notification";
}

export function isDerivedInboxKindEvent(e: At2ClientEvent): e is At2DerivedInboxEvent {
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
