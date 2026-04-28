import { matchmakingPublicMemoryNamespace } from "./matchmaking-memory-namespaces.ts";

/**
 * Shared cross-subject namespace for all public profiles.
 */
export function matchmakingSharedPublicProfilesNamespace(): string {
  return matchmakingPublicMemoryNamespace();
}
