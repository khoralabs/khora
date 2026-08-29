import type { PrincipalId } from "@khoralabs/khora-contracts";

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
  delete(principalId: PrincipalId, profileId: string): void;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
}

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

export type AgentAccountStatus = "suspended" | "deleted";

export type AgentAccountStatusPort = {
  getStatus(did: string): AgentAccountStatus | undefined;
  setStatus(did: string, status: AgentAccountStatus): void;
  clearStatus(did: string): void;
};

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

/**
 * Bidirectional username ↔ principal index.
 * Usernames are globally unique across all principals on this host.
 */
export type UsernameIndexPort = {
  lookupByUsername(normalizedUsername: string): PrincipalId | undefined;
  lookupByPrincipal(principalId: PrincipalId): string | undefined;
  /**
   * Upsert the username for a principal. Removes any previous username for this principal.
   * Throws if the username is already taken by a different principal.
   */
  setForPrincipal(principalId: PrincipalId, normalizedUsername: string): void;
  /** Remove both username map entries for this principal. No-op if not found. */
  deleteForPrincipal(principalId: PrincipalId): void;
  /**
   * After a failed registration attempt: remove any new username entries for this principal
   * and restore the prior username entry if one existed.
   */
  rollbackForPrincipal(principalId: PrincipalId, priorNormalizedUsername: string | undefined): void;
};

export type ClaimedTeardownJob = { principalId: PrincipalId; profileId: string };

/** Durable job queue for async principal teardown (phase 2: social graph + cell purge). */
export type PrincipalTeardownQueuePort = {
  enqueue(principalId: PrincipalId, profileId: string, nowMs: number): void;
  tryClaimNext(nowMs: number): ClaimedTeardownJob | undefined;
  hasActiveJob(principalId: PrincipalId): boolean;
  complete(principalId: PrincipalId): void;
  failAndRequeue(principalId: PrincipalId, nowMs: number, error: string): void;
};

/**
 * Khora host persistence contract.
 * Extends HostPersistence with username indexing, teardown queue, and
 * two compound operations that require cross-store atomicity.
 */
export type KhoraHostPersistence = HostPersistence & {
  usernameIndex: UsernameIndexPort;
  teardownQueue: PrincipalTeardownQueuePort;
  /**
   * Atomically upsert profile entity, registration mapping, and username index.
   * Throws if the username is already taken by a different principal.
   */
  registerAgent(input: SocialRegisterAgentInput): SocialAgentIdentity;
  /**
   * Atomically: clear username index entry, delete registration rows,
   * delete profile entity, and enqueue an async teardown job.
   * Precondition: principal is registered.
   */
  phase1Unregister(principalId: PrincipalId, profileId: string, nowMs: number): void;
};

export type KhoraInviteListRow = {
  preview: string;
  consumed: boolean;
  consumedByDid: string | undefined;
  createdAtMs: number;
  kind: string;
};

export type KhoraInviteAdminListRow = KhoraInviteListRow & {
  mintedByDid: string | null;
};

export type InvitePreviewResult =
  | {
      ok: true;
      inviter: { did: string; profile: unknown } | null;
      source: "inviter" | "root" | "seed";
    }
  | { ok: false };

export type KhoraInvitesRepo = {
  insertSeedInviteTokens(plaintexts: string[]): number;
  ensureRootInviteIfAbsent(): string | undefined;
  tryConsumeInviteToken(plaintext: string, consumerDid: string): boolean;
  rollbackInviteConsumption(plaintext: string, consumerDid: string): void;
  mintStandardInviteTokens(mintedByDid: string, count: number): string[];
  listInvitesMintedForDid(minterDid: string): KhoraInviteListRow[];
  listAllInviteTokens(params?: { limit?: number; mintedByDid?: string }): KhoraInviteAdminListRow[];
  previewInviteToken(
    plaintext: string,
    loadProfileForDid: (did: string) => unknown | null | undefined,
  ): InvitePreviewResult;
  /** Delete all invite tokens minted by or consumed by the given principal (called on principal teardown). */
  deleteTokensForPrincipal(did: string): void;
};
