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
