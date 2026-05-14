/** Opaque globally unique principal key (routing id for registrations, inbox, subscriptions). Format is adapter-defined; swarm-host does not validate shape. */
export type PrincipalId = string;

export type PrincipalRegistrationRequest = {
  principalId: PrincipalId;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

export type PrincipalRegistrationResult<TProfile> = {
  principalId: PrincipalId;
  profile: TProfile;
  profileId: string;
};

/** Requires `profile.id: string` for event aggregates and indexing conventions. */
export function profileEntityId(profile: unknown): string {
  if (
    profile !== null &&
    typeof profile === "object" &&
    "id" in profile &&
    typeof (profile as { id: unknown }).id === "string" &&
    (profile as { id: string }).id.length > 0
  ) {
    return (profile as { id: string }).id;
  }
  throw new Error("SwarmHost: profile must have a non-empty string `id` for registration");
}
