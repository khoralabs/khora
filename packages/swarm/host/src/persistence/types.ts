import type { AgentDid } from "../registration/types.ts";

/** Stored negotiation byte-relay room (ticket HMAC secret + TTL). */
export type NegotiationRelayRoomRecord = {
  roomId: string;
  pairingSecretHex: string;
  createdAtMs: number;
  expiresAtMs: number;
};

/** One persisted opaque frame for replay / buffering. */
export type NegotiationRelayFrameRow = {
  id: number;
  bytes: Uint8Array;
};

/**
 * Persistence slice for negotiation byte-relay rooms (`rooms` + `room_messages` parity).
 * Implementations may use SQLite, in-memory maps, etc.
 */
export interface NegotiationRelayPersistence {
  upsertRoom(record: NegotiationRelayRoomRecord): void;
  getPairingSecretIfActive(roomId: string, nowMs: number): string | undefined;
  enqueueFrame(roomId: string, bytes: Uint8Array): number;
  drainFramesAfter(roomId: string, afterId: number): NegotiationRelayFrameRow[];
  deleteFramesForRoom(roomId: string): void;
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

/** Persisted DID ↔ profile mapping for agent registration (implementation-defined storage). */
export interface SwarmHostAgentRegistrations {
  exists(did: AgentDid): boolean;
  upsert(did: AgentDid, profileId: string): void;
  profileIdForDid(did: AgentDid): string | undefined;
  didForProfileId(profileId: string): AgentDid | undefined;
}

/** Opaque subject subscriptions keyed by agent DID (e.g. `topic:<slug>`, `author:<did>`). */
export interface SwarmHostAgentSubjectSubscriptions {
  listSubjectsForDid(did: AgentDid): string[];
  subscriberDidsForSubject(subject: string, excludeDid?: AgentDid): AgentDid[];
  subscribe(did: AgentDid, subject: string): void;
  unsubscribe(did: AgentDid, subject: string): void;
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
 * Host persistence facade: negotiation byte relay plus logical entity slices over one `host_entities` table.
 * Add slices (e.g. notifications) without changing call sites that already take this composite.
 */
export type SwarmHostPersistence = {
  negotiationRelay: NegotiationRelayPersistence;
  profiles: SwarmHostEntityPersistence;
  posts: SwarmHostPostPersistence;
  topics: SwarmHostEntityPersistence;
  agentRegistrations: SwarmHostAgentRegistrations;
  agentSubjectSubscriptions: SwarmHostAgentSubjectSubscriptions;
};
