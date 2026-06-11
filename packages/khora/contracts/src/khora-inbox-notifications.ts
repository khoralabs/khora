import type { PrincipalId } from "@khoralabs/host-runtime";

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

export type KhoraInboxNotification =
  | { kind: "connection_request"; payload: unknown }
  | { kind: "host"; payload: unknown }
  | { kind: "inbox_post"; payload: InboxPostNotificationPayload };
