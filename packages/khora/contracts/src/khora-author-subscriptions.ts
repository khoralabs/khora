import z from "zod";
import type { KhoraStandingSearchRequest } from "./khora-standing-search";
import { KHORA_TOPIC_LABEL_PREFIX } from "./khora-subscription-searches";

export const zAuthorSubscriptionsSnapshot = z.object({
  authorDids: z.array(z.string()),
  authorTopics: z.array(z.object({ authorDid: z.string(), topicSlug: z.string() })).default([]),
  topicSlugs: z.array(z.string()).default([]),
  semantic: z.array(z.object({ searchText: z.string() })).default([]),
});

export type AuthorSubscriptionsSnapshot = z.infer<typeof zAuthorSubscriptionsSnapshot>;

function topicSlugsFromLabels(search: KhoraStandingSearchRequest): string[] {
  const prefix = KHORA_TOPIC_LABEL_PREFIX;
  const slugs: string[] = [];
  for (const label of search.options?.labels?.some ?? []) {
    if (label.startsWith(prefix)) {
      slugs.push(label.slice(prefix.length));
    }
  }
  return slugs;
}

function authorProfileIdFromSearch(search: KhoraStandingSearchRequest): string | undefined {
  const ns = search.namespace;
  if (ns === undefined || !ns.endsWith("/posts")) return undefined;
  if (search.searchScopeMode !== "pathSubtree") return undefined;
  return ns.split("/").at(-2);
}

function hasSemanticContent(search: KhoraStandingSearchRequest): boolean {
  const text = search.content.text?.trim() ?? "";
  const vector = search.content.vector;
  return text.length > 0 || (vector !== undefined && vector.length > 0);
}

/** Classify a standing query into listable subscription targets (profile ids, not DIDs). */
export function parseStandingQuerySubscriptionTargets(search: KhoraStandingSearchRequest): {
  authorProfileId?: string;
  authorTopicSlugs: string[];
  topicSlugs: string[];
  semanticSearchText?: string;
} {
  const authorProfileId = authorProfileIdFromSearch(search);
  const labelTopicSlugs = topicSlugsFromLabels(search);

  if (authorProfileId !== undefined) {
    return {
      authorProfileId,
      authorTopicSlugs: labelTopicSlugs,
      topicSlugs: [],
      semanticSearchText: undefined,
    };
  }

  const text = search.content.text?.trim() ?? "";
  return {
    authorTopicSlugs: [],
    topicSlugs: labelTopicSlugs,
    semanticSearchText: hasSemanticContent(search) && text.length > 0 ? text : undefined,
  };
}

export function mergeAuthorSubscriptionsSnapshot(
  parts: Iterable<ReturnType<typeof parseStandingQuerySubscriptionTargets>>,
  resolveAuthorDid: (profileId: string) => string | undefined,
): AuthorSubscriptionsSnapshot {
  const authorDids = new Set<string>();
  const authorTopics: { authorDid: string; topicSlug: string }[] = [];
  const topicSlugs = new Set<string>();
  const semanticTexts = new Set<string>();
  const seenAuthorTopics = new Set<string>();

  for (const part of parts) {
    if (part.authorProfileId !== undefined) {
      const authorDid = resolveAuthorDid(part.authorProfileId);
      if (authorDid === undefined) continue;
      if (part.authorTopicSlugs.length === 0) {
        authorDids.add(authorDid);
      } else {
        for (const topicSlug of part.authorTopicSlugs) {
          const key = `${authorDid}\0${topicSlug}`;
          if (seenAuthorTopics.has(key)) continue;
          seenAuthorTopics.add(key);
          authorTopics.push({ authorDid, topicSlug });
        }
      }
      continue;
    }
    for (const slug of part.topicSlugs) {
      topicSlugs.add(slug);
    }
    if (part.semanticSearchText !== undefined) {
      semanticTexts.add(part.semanticSearchText);
    }
  }

  return {
    authorDids: [...authorDids].sort(),
    authorTopics,
    topicSlugs: [...topicSlugs].sort(),
    semantic: [...semanticTexts].sort().map((searchText) => ({ searchText })),
  };
}
