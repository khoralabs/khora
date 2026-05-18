import { normalizeTopicSlug } from "@khoralabs/at2-contracts";

export function topicSubscriptionSubject(topicSlug: string): string {
  return `topic:${topicSlug}`;
}

export function authorSubscriptionSubject(authorDid: string): string {
  return `author:${authorDid}`;
}

const AUTHOR_TOPIC_PREFIX = "author_topic:";
const AUTHOR_TOPIC_SEP = "\t";

export function authorTopicSubscriptionSubject(authorDid: string, topicSlugRaw: string): string {
  const slug = normalizeTopicSlug(topicSlugRaw);
  return `${AUTHOR_TOPIC_PREFIX}${authorDid}${AUTHOR_TOPIC_SEP}${slug}`;
}

const AUTHOR_PREFIX = "author:";

export function authorDidFromSubscriptionSubject(subject: string): string | undefined {
  if (!subject.startsWith(AUTHOR_PREFIX)) return undefined;
  return subject.slice(AUTHOR_PREFIX.length);
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
