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

/**
 * Host persistence facade: profile entities and principal registrations.
 * App-specific durable data (posts, social graph, frame relay) lives in product adapters.
 */
export type HostPersistence = {
  profiles: HostEntityPersistence;
  registrations: HostRegistrations;
};
