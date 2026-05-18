import type { AgentRelayEntityUpsert, PrincipalId } from "@khoralabs/agent-relay";

/** Pairwise relationship (e.g. frame channel room); peer is unknown until {@link SocialRelationshipPersistence.bindPeer}. */
export type SocialRelationshipRow = {
  channelId: string;
  creatorPrincipalId: PrincipalId;
  peerPrincipalId: PrincipalId | null;
  createdAtMs: number;
  expiresAtMs?: number;
  metadata?: unknown;
};

export type SocialAgentIdentity = {
  principalId: PrincipalId;
  profileId: string;
  username: string;
};

export type SocialRegisterAgentInput = {
  principalId: PrincipalId;
  profileUpsert: AgentRelayEntityUpsert;
  /** Human-facing handle; stored as `normalizeUsername()` from `@khoralabs/atrium-contracts` (trim + lowercase) for stable URL paths. */
  username: string;
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
};
