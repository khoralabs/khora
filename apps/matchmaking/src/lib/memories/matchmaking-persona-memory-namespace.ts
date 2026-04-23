import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";

/**
 * SQLite + JSONL path segment under the memories root, subject-scoped:
 * `obp_demo/matchmaking/subjects/{subjectId}/personas/{slug}`.
 */
export function matchmakingPersonaMemoryNamespace(
  slug: string,
  subjectId: string = resolveMatchmakingSubjectId(),
): string {
  return `obp_demo/matchmaking/subjects/${subjectId}/personas/${slug}`;
}
