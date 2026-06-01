import z from "zod";
import type { KhoraStandingSearchRequest } from "./khora-standing-search";
import { KHORA_TOPIC_LABEL_PREFIX } from "./khora-subscription-searches";

export const zSubscriptionPredicate = z.object({
  topicSlug: z.string().optional(),
  authorDid: z.string().optional(),
  query: z.string().optional(),
});

export type SubscriptionPredicate = z.infer<typeof zSubscriptionPredicate>;

export const zAuthorSubscriptionsSnapshot = z.object({
  predicates: z.array(zSubscriptionPredicate),
});

export type AuthorSubscriptionsSnapshot = z.infer<typeof zAuthorSubscriptionsSnapshot>;

function topicSlugFromLabels(search: KhoraStandingSearchRequest): string | undefined {
  const prefix = KHORA_TOPIC_LABEL_PREFIX;
  for (const label of search.options?.labels?.some ?? []) {
    if (label.startsWith(prefix)) {
      return label.slice(prefix.length);
    }
  }
  return undefined;
}

function authorProfileIdFromSearch(search: KhoraStandingSearchRequest): string | undefined {
  const ns = search.namespace;
  if (ns === undefined || !ns.endsWith("/posts")) return undefined;
  if (search.searchScopeMode !== "pathSubtree") return undefined;
  return ns.split("/").at(-2);
}

/** Parse a standing query into the unified predicate shape (for list/display). */
export function standingSearchToPredicate(
  search: KhoraStandingSearchRequest,
  resolveAuthorDid: (profileId: string) => string | undefined,
): SubscriptionPredicate {
  const predicate: SubscriptionPredicate = {};
  const topicSlug = topicSlugFromLabels(search);
  if (topicSlug !== undefined) {
    predicate.topicSlug = topicSlug;
  }
  const authorProfileId = authorProfileIdFromSearch(search);
  if (authorProfileId !== undefined) {
    const authorDid = resolveAuthorDid(authorProfileId);
    if (authorDid !== undefined) {
      predicate.authorDid = authorDid;
    }
  }
  const query = search.content.text?.trim() ?? "";
  if (query.length > 0) {
    predicate.query = query;
  }
  return predicate;
}

export function listAuthorSubscriptionsSnapshot(
  searches: Iterable<KhoraStandingSearchRequest>,
  resolveAuthorDid: (profileId: string) => string | undefined,
): AuthorSubscriptionsSnapshot {
  const predicates: SubscriptionPredicate[] = [];
  for (const search of searches) {
    predicates.push(standingSearchToPredicate(search, resolveAuthorDid));
  }
  return { predicates };
}
