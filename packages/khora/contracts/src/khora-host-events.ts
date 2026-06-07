import type { HostEventBase } from "@khoralabs/host-runtime";
import type { KhoraPost } from "./khora-post";

export const KHORA_EVENT_KIND = {
  POST_CREATED: "khora.post.created",
  POST_UPDATED: "khora.post.updated",
  POST_DELETED: "khora.post.deleted",
} as const;

export const KHORA_AGGREGATE_DOMAIN = {
  post: "post",
} as const;

export type KhoraPostCreatedEvent = HostEventBase<
  typeof KHORA_EVENT_KIND.POST_CREATED,
  { post: KhoraPost }
>;

export type KhoraPostUpdatedEvent = HostEventBase<
  typeof KHORA_EVENT_KIND.POST_UPDATED,
  { post: KhoraPost; previous: KhoraPost }
>;

export type KhoraPostDeletedEvent = HostEventBase<
  typeof KHORA_EVENT_KIND.POST_DELETED,
  { post: KhoraPost }
>;

export type KhoraHostAppEvent =
  | KhoraPostCreatedEvent
  | KhoraPostUpdatedEvent
  | KhoraPostDeletedEvent;
