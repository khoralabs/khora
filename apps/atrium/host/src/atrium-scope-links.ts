import type { MemoriesPersistence, MemoryOpContext } from "@khoralabs/memories-core";
import {
  atriumProfileScope,
  atriumProfileTopicScope,
  atriumScopeRoot,
  atriumTopicScopeFromNormalizedSlug,
  normalizedTopicSlugsForScopes,
} from "./atrium-memory-scopes.ts";

function memoryOp(): MemoryOpContext {
  return { now: Date.now() };
}

/**
 * Ensures DAG edges for profile-scoped read models. Idempotent: duplicate edges are no-ops
 * (see SQLite `linkScopes`).
 */
export function ensureAtriumScopeLinksForProfile(
  persistence: MemoriesPersistence,
  profileId: string,
): void {
  const op = memoryOp();
  const root = atriumScopeRoot();
  const prof = atriumProfileScope(profileId);
  persistence.linkScopes(op, { parentScopeId: root, childScopeId: prof });
}

/**
 * Ensures edges: `atrium` → topic, `atrium` → profile, profile → profile/topic.
 */
export function ensureAtriumScopeLinksForPost(
  persistence: MemoriesPersistence,
  authorProfileId: string | undefined,
  topics: readonly string[] | undefined,
): void {
  if (authorProfileId === undefined || authorProfileId.length === 0) return;
  const op = memoryOp();
  const root = atriumScopeRoot();
  const prof = atriumProfileScope(authorProfileId);
  persistence.linkScopes(op, { parentScopeId: root, childScopeId: prof });
  for (const slug of normalizedTopicSlugsForScopes(topics)) {
    const topicScope = atriumTopicScopeFromNormalizedSlug(slug);
    const profileTopic = atriumProfileTopicScope(authorProfileId, slug);
    persistence.linkScopes(op, { parentScopeId: root, childScopeId: topicScope });
    persistence.linkScopes(op, { parentScopeId: prof, childScopeId: profileTopic });
  }
}
