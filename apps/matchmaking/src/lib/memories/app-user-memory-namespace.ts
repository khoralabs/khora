import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";

const USER_SEG_SAFE = /^[a-zA-Z0-9._-]+$/;

/**
 * Final path segment for the experiential app user’s memory namespace (not `personas/{slug}`).
 * `USER_NAMESPACE` when set to a non-empty trim; otherwise `_user_`.
 * Only ASCII path-safe characters are allowed; throws if invalid.
 */
export function matchmakingUserNamespaceSegment(): string {
  const raw = process.env.USER_NAMESPACE?.trim();
  if (raw === undefined || raw.length === 0) {
    return "_user_";
  }
  if (raw.includes("/") || raw.includes("\n") || raw.includes("\r")) {
    throw new Error("USER_NAMESPACE must not contain / or newlines");
  }
  if (!USER_SEG_SAFE.test(raw)) {
    throw new Error(
      "USER_NAMESPACE may only contain letters, digits, and ._- (set USER_NAMESPACE to override the default _user_ segment)",
    );
  }
  return raw;
}

/**
 * Experiential user memory path under the memories root, subject-scoped:
 * `obp_demo/matchmaking/subjects/{subjectId}/{userSegment}`.
 */
export function appUserMemoryNamespace(subjectId: string = resolveMatchmakingSubjectId()): string {
  return `obp_demo/matchmaking/subjects/${subjectId}/${matchmakingUserNamespaceSegment()}`;
}
