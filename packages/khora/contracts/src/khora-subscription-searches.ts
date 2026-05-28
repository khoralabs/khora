import type { KhoraStandingSearchRequest } from "./khora-standing-search.ts";

export const ATRIUM_TOPIC_LABEL_PREFIX = "khora_topic:";

export function topicSlugToLabelKind(slug: string): string {
  return `${ATRIUM_TOPIC_LABEL_PREFIX}${slug}`;
}

export function postsMemoryNamespace(namespaceRoot: string, profileId: string): string {
  return `${namespaceRoot}/agents/${profileId}/posts`;
}

export function topicSubscriptionSearch(slug: string): KhoraStandingSearchRequest {
  return {
    content: {},
    options: { labels: { some: [topicSlugToLabelKind(slug)] } },
  };
}

export function authorSubscriptionSearch(
  authorProfileId: string,
  namespaceRoot: string,
): KhoraStandingSearchRequest {
  return {
    namespace: postsMemoryNamespace(namespaceRoot, authorProfileId),
    content: {},
    searchScopeMode: "pathSubtree",
  };
}

export function authorTopicSubscriptionSearch(
  authorProfileId: string,
  slug: string,
  namespaceRoot: string,
): KhoraStandingSearchRequest {
  return {
    namespace: postsMemoryNamespace(namespaceRoot, authorProfileId),
    content: {},
    searchScopeMode: "pathSubtree",
    options: { labels: { some: [topicSlugToLabelKind(slug)] } },
  };
}
