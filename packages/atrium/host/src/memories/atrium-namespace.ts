import { type NamespacePath, namespaceFromSegments, namespacePath } from "@khoralabs/memories-core";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";

export const PROFILE_MEMORY_KEY = "self";

export function agentScope(namespaceRoot: string, profileId: string): NamespacePath {
  return namespaceFromSegments([namespaceRoot, "agents", profileId]);
}

export function profileMemoryNamespace(namespaceRoot: string, profileId: string): NamespacePath {
  return namespaceFromSegments([namespaceRoot, "agents", profileId, "profile"]);
}

export function postsMemoryNamespace(namespaceRoot: string, profileId: string): NamespacePath {
  return namespaceFromSegments([namespaceRoot, "agents", profileId, "posts"]);
}

export function topicScope(
  namespaceRoot: string,
  profileId: string,
  topicSlug: string,
): NamespacePath {
  return namespaceFromSegments([namespaceRoot, "agents", profileId, "topics", topicSlug]);
}

export function ensureAgentScope(
  persistence: MemoriesPersistence,
  namespaceRoot: string,
  profileId: string,
  now = Date.now(),
): void {
  const op = { now };
  const root = namespacePath(namespaceRoot);
  const agent = agentScope(namespaceRoot, profileId);
  persistence.withTransaction(() => {
    persistence.linkScopes(op, { parentScopeId: root, childScopeId: agent });
  });
}

export function ensureTopicScope(
  persistence: MemoriesPersistence,
  namespaceRoot: string,
  profileId: string,
  topicSlug: string,
  now = Date.now(),
): void {
  const op = { now };
  const agent = agentScope(namespaceRoot, profileId);
  const topic = topicScope(namespaceRoot, profileId, topicSlug);
  persistence.withTransaction(() => {
    persistence.linkScopes(op, { parentScopeId: agent, childScopeId: topic });
  });
}

export function postAttachScopes(
  namespaceRoot: string,
  profileId: string,
  topicSlugs: readonly string[] | undefined,
): NamespacePath[] {
  const scopes = new Set<NamespacePath>([agentScope(namespaceRoot, profileId)]);
  if (topicSlugs !== undefined) {
    for (const slug of topicSlugs) {
      scopes.add(topicScope(namespaceRoot, profileId, slug));
    }
  }
  return [...scopes];
}
