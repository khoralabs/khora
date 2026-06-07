import type { PrincipalId } from "@khoralabs/host-runtime";

export type FrameChannelInvitePayload = {
  channelId: string;
  ticket: string;
  expiresAtMs?: number;
  issuedAtMs?: number;
  fromPrincipalId?: PrincipalId;
};

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
  | { kind: "room_ticket"; payload: FrameChannelInvitePayload }
  | { kind: "inbox_post"; payload: InboxPostNotificationPayload };
