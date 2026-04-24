import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";

/**
 * Shared memory namespace for directory-style public cards (simulated + user):
 * `obp_demo/matchmaking/subjects/{subjectId}/_global_`.
 */
export function matchmakingGlobalMemoryNamespace(
  subjectId: string = resolveMatchmakingSubjectId(),
): string {
  return `obp_demo/matchmaking/subjects/${subjectId}/_global_`;
}
