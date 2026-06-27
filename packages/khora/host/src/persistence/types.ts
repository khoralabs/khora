import type {
  HostPersistence,
  PrincipalId,
  SocialAgentIdentity,
  SocialRegisterAgentInput,
} from "@khoralabs/host-runtime";

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
