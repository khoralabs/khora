import {
  matchmakingPersonalMemoryNamespace,
  matchmakingUserNamespaceSegment,
} from "./matchmaking-memory-namespaces.ts";

export { matchmakingUserNamespaceSegment };

/**
 * Cross-subject personal namespace for the experiential app user.
 */
export function appUserMemoryNamespace(_subjectId?: string): string {
  return matchmakingPersonalMemoryNamespace(matchmakingUserNamespaceSegment());
}
