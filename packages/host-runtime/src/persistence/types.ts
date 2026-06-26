import type { PrincipalId } from "../registration/types";

/** Insert/update payload for host entity storage (`body_json` is canonical JSON). */
export type HostEntityUpsert = {
  id: string;
  memoryId?: string | null;
  bodyJson: string;
};

/** Row read from host entity tables. */
export type HostEntityRow = {
  id: string;
  memoryId: string | null;
  bodyJson: string;
  updatedAtMs: number;
};

/** CRUD slice for profile entity storage. */
export interface HostEntityPersistence {
  upsert(record: HostEntityUpsert): void;
  getById(id: string): HostEntityRow | undefined;
  deleteById(id: string): void;
}

/** Persisted principal ↔ profile mapping (implementation-defined storage; SQL column names may say `did`). */
export interface HostRegistrations {
  exists(principalId: PrincipalId): boolean;
  upsert(principalId: PrincipalId, profileId: string): void;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
}

// ---------------------------------------------------------------------------
// Social relationship persistence
// ---------------------------------------------------------------------------

/** Pairwise social relationship keyed by relay `channelId`; peer is unknown until {@link SocialRelationshipPersistence.bindPeer}. */
export type SocialRelationshipRow = {
  channelId: string;
  creatorPrincipalId: PrincipalId;
  peerPrincipalId: PrincipalId | null;
  createdAtMs: number;
  expiresAtMs?: number;
  metadata?: unknown;
};

export type SocialRelationshipPersistence = {
  createRelationship(params: {
    channelId: string;
    creatorPrincipalId: PrincipalId;
    expiresAtMs?: number;
    metadata?: unknown;
  }): void;
  getRelationship(channelId: string): SocialRelationshipRow | undefined;
  bindPeer(params: { channelId: string; peerPrincipalId: PrincipalId }): void;
  /**
   * Align stored `expiresAtMs` with registry after `rotateChannelTicket` (mint/rejoin ticket TTL end).
   * No-op if no relationship row exists for the channel.
   */
  refreshRelationshipTicketExpiry(params: { channelId: string; expiresAtMs: number }): void;
  listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[];
  /**
   * Tear down one channel: catalog relationship row + principal channel indexes.
   * Returns the removed row, or undefined if the channel was unknown.
   */
  deleteRelationship(channelId: string): SocialRelationshipRow | undefined;
};

/** Input shape used when registering a new agent with username and profile. */
export type SocialRegisterAgentInput = {
  principalId: PrincipalId;
  profileUpsert: HostEntityUpsert;
  /** Human-facing handle; stored as `normalizeUsername()` from `@khoralabs/khora-contracts` (trim + lowercase) for stable URL paths. */
  username: string;
};

/** Resolved identity returned after a successful agent registration. */
export type SocialAgentIdentity = {
  principalId: PrincipalId;
  profileId: string;
  username: string;
};

// ---------------------------------------------------------------------------
// Agent account status persistence
// ---------------------------------------------------------------------------

export type AgentAccountStatus = "suspended" | "deleted";

export type AgentAccountStatusPort = {
  getStatus(did: string): AgentAccountStatus | undefined;
  setStatus(did: string, status: AgentAccountStatus): void;
  clearStatus(did: string): void;
};

// ---------------------------------------------------------------------------
// Host persistence facade
// ---------------------------------------------------------------------------

/**
 * Host persistence facade: profile entities, principal registrations,
 * social graph, and account status.
 * Implementation-specific storage (SQL, KV, etc.) is chosen by the server.
 */
export type HostPersistence = {
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
  social: SocialRelationshipPersistence;
  agentAccountStatus: AgentAccountStatusPort;
};
