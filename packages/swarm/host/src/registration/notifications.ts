import type { AgentDid } from "./types.ts";

export type NegotiationTicketNotificationPayload = {
  roomId: string;
  ticket: string;
  expiresAtMs?: number;
  issuedAtMs?: number;
  fromDid?: AgentDid;
};

export type TopicPostNotificationPayload = {
  topicSlug: string;
  postId: string;
  authorProfileId?: string;
};

export type ProbeHitNotificationPayload = {
  probePostId: string;
  matchedPostId: string;
  score?: number;
};

export type AgentNotification =
  | { kind: "connection_request"; payload: unknown }
  | { kind: "host"; payload: unknown }
  | { kind: "negotiation_ticket"; payload: NegotiationTicketNotificationPayload }
  | { kind: "topic_post"; payload: TopicPostNotificationPayload }
  | { kind: "probe_hit"; payload: ProbeHitNotificationPayload };

/** Persisted inbox row (SQLite id + lifecycle fields). */
export type AgentNotificationRow = {
  id: number;
  createdAtMs: number;
  readAtMs: number | null;
  note: AgentNotification;
};

/** Host-side queue for agents identified by DID (e.g. offline delivery). */
export interface AgentNotificationBufferPort {
  /** Idempotent registration slot for notification delivery. */
  ensureRegistered(did: AgentDid): Promise<void>;

  /** Persists notification; returns row id for WebSocket fan-out. */
  enqueue(did: AgentDid, note: AgentNotification): Promise<number>;

  dequeueBatch(did: AgentDid, limit?: number): Promise<AgentNotification[]>;

  /** Recent rows for WebSocket snapshot / REST (rows are not deleted). */
  listRecent?(did: AgentDid, limit?: number): Promise<AgentNotificationRow[]>;

  /** Set read_at_ms for ids (idempotent for already-read rows). */
  markRead?(did: AgentDid, ids: readonly number[]): Promise<void>;
}
