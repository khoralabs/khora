import type { PrincipalId } from "../registration/types";
import type { HostEntityRow, HostEntityUpsert, HostPersistence } from "./types";

/** Thin facade over {@link HostPersistence} entity slices (backend-agnostic). */
export type HostPersistenceClient = {
  readonly persistence: HostPersistence;
  upsertProfile(record: HostEntityUpsert): void;
  getProfileById(id: string): HostEntityRow | undefined;
  upsertRegistration(principalId: PrincipalId, profileId: string): void;
  registrationExists(principalId: PrincipalId): boolean;
  profileIdForPrincipal(principalId: PrincipalId): string | undefined;
  principalForProfileId(profileId: string): PrincipalId | undefined;
};

export function createHostPersistenceClient(persistence: HostPersistence): HostPersistenceClient {
  return {
    persistence,
    upsertProfile: (record) => persistence.profiles.upsert(record),
    getProfileById: (id) => persistence.profiles.getById(id),
    upsertRegistration: (principalId, profileId) =>
      persistence.registrations.upsert(principalId, profileId),
    registrationExists: (principalId) => persistence.registrations.exists(principalId),
    profileIdForPrincipal: (principalId) =>
      persistence.registrations.profileIdForPrincipal(principalId),
    principalForProfileId: (profileId) =>
      persistence.registrations.principalForProfileId(profileId),
  };
}
