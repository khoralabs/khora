const USER_SEG_SAFE = /^[a-zA-Z0-9._-]+$/;

export const APP_USER_KEY = "_user_";

/**
 * Final user key segment for experiential app user namespaces.
 */
export function matchmakingUserNamespaceSegment(): string {
  const raw = process.env.USER_NAMESPACE?.trim();
  if (raw === undefined || raw.length === 0) {
    return APP_USER_KEY;
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
 * Shared cross-subject namespace for public profile memories.
 */
export function matchmakingPublicMemoryNamespace(): string {
  return "obp_demo/matchmaking/public_profiles/_global_";
}

/**
 * Cross-subject per-user namespace for invites/goals/reflections and private self-context.
 */
export function matchmakingPersonalMemoryNamespace(userKey: string): string {
  return `obp_demo/matchmaking/users/${userKey}/personal`;
}

/**
 * Cross-subject per-user namespace for explicit agent feedback memories.
 */
export function matchmakingFeedbackMemoryNamespace(userKey: string): string {
  return `obp_demo/matchmaking/users/${userKey}/feedback`;
}

/**
 * Maps run party slug to namespace user key.
 */
export function matchmakingNamespaceUserKeyFromPartySlug(slug: string): string {
  if (slug === APP_USER_KEY) {
    return matchmakingUserNamespaceSegment();
  }
  return slug;
}
