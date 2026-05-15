import type { PrincipalId } from "./types.ts";

export type FrameChannelInvitePayload = {
  channelId: string;
  ticket: string;
  expiresAtMs?: number;
  issuedAtMs?: number;
  fromPrincipalId?: PrincipalId;
};

export type InboxPostReason =
  | { kind: "topic"; topic: string }
  | { kind: "author" }
  | { kind: "author_topic"; authorPrincipalId: PrincipalId; topic: string }
  | { kind: "probe-hit"; probePostId: string; score: number };

export type InboxPostNotificationPayload = {
  postId: string;
  postKind: "post" | "status" | "probe";
  authorPrincipalId?: PrincipalId;
  reasons: InboxPostReason[];
};

export type AgentNotification =
  | { kind: "connection_request"; payload: unknown }
  | { kind: "host"; payload: unknown }
  | { kind: "room_ticket"; payload: FrameChannelInvitePayload }
  | { kind: "inbox_post"; payload: InboxPostNotificationPayload };

/** Persisted inbox row (SQLite id + lifecycle fields). */
export type AgentNotificationRow = {
  id: number;
  createdAtMs: number;
  readAtMs: number | null;
  note: AgentNotification;
};

/** Host-side queue per principal (e.g. offline delivery). Column storage may label the key `did`. */
export interface AgentNotificationBufferPort {
  /** Idempotent registration slot for notification delivery. */
  ensureRegistered(principalId: PrincipalId): Promise<void>;

  /** Persists notification; returns row id for WebSocket fan-out. */
  enqueue(principalId: PrincipalId, note: AgentNotification): Promise<number>;

  dequeueBatch(principalId: PrincipalId, limit?: number): Promise<AgentNotification[]>;

  /** Recent rows for WebSocket snapshot / REST (rows are not deleted). */
  listRecent?(principalId: PrincipalId, limit?: number): Promise<AgentNotificationRow[]>;

  /** Set read_at_ms for ids (idempotent for already-read rows). */
  markRead?(principalId: PrincipalId, ids: readonly number[]): Promise<void>;
}
