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
};

export type SocialRegisterAgentInput = {
  principalId: PrincipalId;
  profileUpsert: AgentRelayEntityUpsert;
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
  listRelationshipsForPrincipal(principalId: PrincipalId): SocialRelationshipRow[];
};
