import { normalizeTopicSlug } from "@khoralabs/atrium-contracts";

/** Opaque subscription subject for a topic slug (normalized). */
export function topicSubscriptionSubject(topicSlug: string): string {
  return `topic:${topicSlug}`;
}

/** Opaque subscription subject for an author's agent DID. */
export function authorSubscriptionSubject(authorDid: string): string {
  return `author:${authorDid}`;
}

const TOPIC_PREFIX = "topic:";
const AUTHOR_PREFIX = "author:";

export function topicSlugFromSubscriptionSubject(subject: string): string | undefined {
  if (!subject.startsWith(TOPIC_PREFIX)) return undefined;
  return subject.slice(TOPIC_PREFIX.length);
}

export function authorDidFromSubscriptionSubject(subject: string): string | undefined {
  if (!subject.startsWith(AUTHOR_PREFIX)) return undefined;
  return subject.slice(AUTHOR_PREFIX.length);
}

const AUTHOR_TOPIC_PREFIX = "author_topic:";
/** TAB does not appear in DIDs or normalized topic slugs. */
const AUTHOR_TOPIC_SEP = "\t";

/** Opaque subscription subject for (author DID, normalized topic slug). */
export function authorTopicSubscriptionSubject(authorDid: string, topicSlugRaw: string): string {
  const slug = normalizeTopicSlug(topicSlugRaw);
  return `${AUTHOR_TOPIC_PREFIX}${authorDid}${AUTHOR_TOPIC_SEP}${slug}`;
}

export function parseAuthorTopicSubscriptionSubject(
  subject: string,
): { authorDid: string; topicSlug: string } | undefined {
  if (!subject.startsWith(AUTHOR_TOPIC_PREFIX)) return undefined;
  const rest = subject.slice(AUTHOR_TOPIC_PREFIX.length);
  const i = rest.indexOf(AUTHOR_TOPIC_SEP);
  if (i < 0) return undefined;
  const authorDid = rest.slice(0, i);
  const topicSlug = rest.slice(i + AUTHOR_TOPIC_SEP.length);
  if (authorDid.length === 0 || topicSlug.length === 0) return undefined;
  return { authorDid, topicSlug };
}
