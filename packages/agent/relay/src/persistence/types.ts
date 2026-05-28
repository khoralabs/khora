import type { PrincipalId } from "../registration/types.ts";

/** Stored frame-channel hub session row (ticket HMAC secret + TTL). Maps to `rooms.session_id`. */
export type FrameChannelRoomRecord = {
  channelId: string;
  pairingSecretHex: string;
  createdAtMs: number;
  expiresAtMs: number;
};

/** One persisted opaque frame for replay / buffering in the hub store. */
export type FrameChannelStoredFrame = {
  id: number;
  bytes: Uint8Array;
};

/**
 * Persistence slice for {@link FrameChannelHubPort}: secrets + queued opaque bytes (`rooms` +
 * `room_messages` in typical SQLite backends).
 */
export interface FrameChannelHubPersistence {
  upsertRoom(record: FrameChannelRoomRecord): void;
  getPairingSecretIfActive(channelId: string, nowMs: number): string | undefined;
  enqueueFrame(channelId: string, bytes: Uint8Array): number;
  drainFramesAfter(channelId: string, afterId: number): FrameChannelStoredFrame[];
  deleteFramesForRoom(channelId: string): void;
}

/** Discriminator for rows in the shared `host_entities` table (matches `source_key` domain prefix). */
export type AgentRelayEntityKind = "profile" | "topic";

/** Insert/update payload for `host_entities` (`body_json` is canonical JSON). */
export type AgentRelayEntityUpsert = {
  id: string;
  memoryId?: string | null;
  bodyJson: string;
};

/** Row read from host entity tables. */
export type AgentRelayEntityRow = {
  id: string;
  memoryId: string | null;
  bodyJson: string;
  updatedAtMs: number;
};

/** CRUD slice for one host entity table (profile, topic). */
export interface AgentRelayEntityPersistence {
  upsert(record: AgentRelayEntityUpsert): void;
  getById(id: string): AgentRelayEntityRow | undefined;
  deleteById(id: string): void;
}

/** Persisted principal ↔ profile mapping (implementation-defined storage; SQL column names may say `did`). */
export interface AgentRelayRegistrations {
  exists(principalId: PrincipalId): boolean;
  upsert(principalId: PrincipalId, profileId: string): void;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
}

/**
 * Relay persistence facade: frame-channel hub store plus logical entity slices.
 * Post bodies live in author cell outbox (not catalog); see khora-host post resolution.
 * Receive-side subscriptions are standing queries in the percolator (not catalog edges).
 */
export type AgentRelayPersistence = {
  frameChannelHubPersistence: FrameChannelHubPersistence;
  profiles: AgentRelayEntityPersistence;
  topics: AgentRelayEntityPersistence;
  agentRegistrations: AgentRelayRegistrations;
};
