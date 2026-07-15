import type {
  PrincipalId,
  PrincipalRegistrationRequest,
  PrincipalRegistrationResult,
} from "@khoralabs/khora-contracts";

export type { PrincipalId, PrincipalRegistrationRequest, PrincipalRegistrationResult };

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
  throw new Error("HostRuntime: profile must have a non-empty string `id` for registration");
}
