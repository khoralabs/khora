import type { KhoraStandingSearchRequest } from "./khora-standing-search";

export const KHORA_TOPIC_LABEL_PREFIX = "khora_topic:";

export function topicSlugToLabelKind(slug: string): string {
  return `${KHORA_TOPIC_LABEL_PREFIX}${slug}`;
}

export function postsMemoryNamespace(namespaceRoot: string, profileId: string): string {
  return `${namespaceRoot}/agents/${profileId}/posts`;
}

export type BuildSubscriptionSearchInput = {
  topicSlug?: string;
  authorProfileId?: string;
  namespaceRoot?: string;
  queryText?: string;
  minScore?: number;
};

/** Build a standing search from AND-combined topic, author scope, and query text. */
export function buildSubscriptionSearch(
  input: BuildSubscriptionSearchInput,
): KhoraStandingSearchRequest {
  const topicSlug = input.topicSlug?.trim();
  const authorProfileId = input.authorProfileId?.trim();
  const queryText = input.queryText?.trim();
  const hasTopic = topicSlug !== undefined && topicSlug.length > 0;
  const hasAuthor = authorProfileId !== undefined && authorProfileId.length > 0;
  const hasQuery = queryText !== undefined && queryText.length > 0;

  if (!hasTopic && !hasAuthor && !hasQuery) {
    throw new Error("Subscription requires at least one of topic, author, or query");
  }

  const namespaceRoot = input.namespaceRoot ?? "global";
  const search: KhoraStandingSearchRequest = { content: {} };

  if (hasAuthor) {
    search.namespace = postsMemoryNamespace(namespaceRoot, authorProfileId);
    search.searchScopeMode = "pathSubtree";
  }

  if (hasTopic || (hasQuery && input.minScore !== undefined)) {
    search.options = {};
    if (hasTopic) {
      search.options.labels = { some: [topicSlugToLabelKind(topicSlug)] };
    }
    if (hasQuery && input.minScore !== undefined) {
      search.options.minScore = input.minScore;
    }
  }

  if (hasQuery) {
    search.content = { text: queryText };
  }

  return search;
}

export function topicSubscriptionSearch(slug: string): KhoraStandingSearchRequest {
  return buildSubscriptionSearch({ topicSlug: slug });
}

export function authorSubscriptionSearch(
  authorProfileId: string,
  namespaceRoot: string,
): KhoraStandingSearchRequest {
  return buildSubscriptionSearch({ authorProfileId, namespaceRoot });
}

export function authorTopicSubscriptionSearch(
  authorProfileId: string,
  slug: string,
  namespaceRoot: string,
): KhoraStandingSearchRequest {
  return buildSubscriptionSearch({ authorProfileId, topicSlug: slug, namespaceRoot });
}
