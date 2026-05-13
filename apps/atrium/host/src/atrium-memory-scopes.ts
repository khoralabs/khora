import { normalizeTopicSlug } from "@khoralabs/atrium-contracts";
import { type NamespacePath, namespaceFromSegments } from "@khoralabs/memories-core";

/** First segment for DAG read-model scopes (distinct from `atrium/profiles` primary merge namespace). */
export const ATRIUM_SCOPE_ROOT_SEGMENT = "atrium" as const;

/** Validated `atrium` scope id (single segment). */
export function atriumScopeRoot(): NamespacePath {
  return namespaceFromSegments([ATRIUM_SCOPE_ROOT_SEGMENT]);
}

/** `atrium/<profileId>` — profile id must already satisfy namespace segment rules. */
export function atriumProfileScope(profileId: string): NamespacePath {
  return namespaceFromSegments([ATRIUM_SCOPE_ROOT_SEGMENT, profileId]);
}

/** `atrium/<normalizedTopicSlug>` — slug must be normalized (see {@link normalizeTopicSlug}). */
export function atriumTopicScopeFromNormalizedSlug(normalizedSlug: string): NamespacePath {
  return namespaceFromSegments([ATRIUM_SCOPE_ROOT_SEGMENT, normalizedSlug]);
}

/** `atrium/<profileId>/<normalizedTopicSlug>`. */
export function atriumProfileTopicScope(profileId: string, normalizedSlug: string): NamespacePath {
  return namespaceFromSegments([ATRIUM_SCOPE_ROOT_SEGMENT, profileId, normalizedSlug]);
}

/** Normalize topic strings for scope paths; invalid entries are skipped. */
export function normalizedTopicSlugsForScopes(topics: readonly string[] | undefined): string[] {
  if (topics === undefined || topics.length === 0) return [];
  const out: string[] = [];
  for (const raw of topics) {
    try {
      out.push(normalizeTopicSlug(raw));
    } catch {
      /* skip */
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

/**
 * `attachScopes` for a profile memory: app root + profile bucket so `scopeDag` search from either
 * root finds the profile node (see `linkScopes` edges in {@link ./atrium-scope-links.ts}).
 */
export function computeProfileAttachScopes(profileId: string): NamespacePath[] {
  return dedupePaths([atriumScopeRoot(), atriumProfileScope(profileId)]);
}

/**
 * `attachScopes` for a post or probe: root, author profile bucket, global topic buckets, and
 * per-author topic buckets.
 */
export function computePostAttachScopes(
  authorProfileId: string | undefined,
  topics: readonly string[] | undefined,
): NamespacePath[] {
  if (authorProfileId === undefined || authorProfileId.length === 0) {
    return dedupePaths([atriumScopeRoot()]);
  }
  const slugs = normalizedTopicSlugsForScopes(topics);
  const parts: NamespacePath[] = [
    atriumScopeRoot(),
    atriumProfileScope(authorProfileId),
    ...slugs.map((s) => atriumTopicScopeFromNormalizedSlug(s)),
    ...slugs.map((s) => atriumProfileTopicScope(authorProfileId, s)),
  ];
  return dedupePaths(parts);
}

function dedupePaths(paths: readonly NamespacePath[]): NamespacePath[] {
  const seen = new Set<string>();
  const out: NamespacePath[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}
