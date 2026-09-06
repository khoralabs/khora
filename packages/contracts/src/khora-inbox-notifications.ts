import type { PrincipalId } from "./host-types";
import type { KhoraConnectionRequestPayload } from "./khora-relationships";

export type InboxSubscriptionMatch = {
  subscriptionId: string;
  score: number;
};

export type InboxPostNotificationPayload = {
  postId: string;
  postKind: "post" | "status" | "subscription";
  authorPrincipalId?: PrincipalId;
  subscriptionMatches: InboxSubscriptionMatch[];
};

export type { KhoraConnectionRequestPayload };

export type KhoraInboxNotification =
  | { kind: "connection_request"; payload: KhoraConnectionRequestPayload }
  | { kind: "host"; payload: unknown }
  | { kind: "inbox_post"; payload: InboxPostNotificationPayload };
