import type { PrincipalId } from "../registration/types";

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
 * Host relay persistence facade: logical entity slices for profiles, topics, and registrations.
 * Post bodies live in author cell outbox (not catalog); see khora-host post resolution.
 * Receive-side subscriptions are standing queries in the percolator (not catalog edges).
 * Frame relay hub storage lives in `@khoralabs/obp-frame-relay`.
 */
export type AgentRelayPersistence = {
  profiles: AgentRelayEntityPersistence;
  topics: AgentRelayEntityPersistence;
  agentRegistrations: AgentRelayRegistrations;
};
