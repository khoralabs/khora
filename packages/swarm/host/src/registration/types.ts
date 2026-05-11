/** W3C DID string used as the agent routing key (e.g. `did:key:…`). Not a full grammar check. */
export type AgentDid = string;

const DID_PREFIX = /^did:[a-z0-9]+:/i;

/** Loose predicate for `did:<method>:…` shape only. */
export function isLikelyDidString(s: string): boolean {
  return DID_PREFIX.test(s);
}

export type DidRegistrationRequest = {
  did: AgentDid;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

export type DidRegistrationResult<TProfile> = {
  did: AgentDid;
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
