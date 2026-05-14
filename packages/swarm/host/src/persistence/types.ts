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
export type SwarmHostEntityKind = "profile" | "post" | "topic";

/** Insert/update payload for `host_entities` (`body_json` is canonical JSON). */
export type SwarmHostEntityUpsert = {
  id: string;
  memoryId?: string | null;
  bodyJson: string;
};

/** Row read from host entity tables. */
export type SwarmHostEntityRow = {
  id: string;
  memoryId: string | null;
  bodyJson: string;
  updatedAtMs: number;
};

/** CRUD slice for one host entity table (profile, post, topic). */
export interface SwarmHostEntityPersistence {
  upsert(record: SwarmHostEntityUpsert): void;
  getById(id: string): SwarmHostEntityRow | undefined;
  deleteById(id: string): void;
}

/** Persisted principal ↔ profile mapping (implementation-defined storage; SQL column names may say `did`). */
export interface SwarmHostAgentRegistrations {
  exists(principalId: PrincipalId): boolean;
  upsert(principalId: PrincipalId, profileId: string): void;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
}

/** Opaque subject subscriptions keyed by principal (e.g. `topic:<slug>`, `author:<principalId>`). */
export interface SwarmHostAgentSubjectSubscriptions {
  listSubjectsForPrincipal(principalId: PrincipalId): string[];
  subscriberPrincipalsForSubject(subject: string, excludePrincipalId?: PrincipalId): PrincipalId[];
  subscribe(principalId: PrincipalId, subject: string): void;
  unsubscribe(principalId: PrincipalId, subject: string): void;
}

/** Post entity persistence plus filtered listing (e.g. probes by author profile id). */
export interface SwarmHostPostPersistence extends SwarmHostEntityPersistence {
  listRowsByAuthorProfileIdAndKind(params: {
    authorProfileId: string;
    kind: string;
    limit: number;
  }): SwarmHostEntityRow[];
}

/**
 * Host persistence facade: frame-channel hub store plus logical entity slices over one `host_entities` table.
 * Add slices (e.g. notifications) without changing call sites that already take this composite.
 */
export type SwarmHostPersistence = {
  frameChannelHubPersistence: FrameChannelHubPersistence;
  profiles: SwarmHostEntityPersistence;
  posts: SwarmHostPostPersistence;
  topics: SwarmHostEntityPersistence;
  agentRegistrations: SwarmHostAgentRegistrations;
  agentSubjectSubscriptions: SwarmHostAgentSubjectSubscriptions;
};
