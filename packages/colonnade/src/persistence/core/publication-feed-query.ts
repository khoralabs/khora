/** Shared helpers for chronological catalog publication feed queries. */

export type PublicationFeedCursor = { readonly ts: number; readonly id: string };

export function encodePublicationFeedCursor(tuple: PublicationFeedCursor): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

export function decodePublicationFeedCursor(raw: string): PublicationFeedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("malformed publication feed cursor");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as PublicationFeedCursor).ts !== "number" ||
    typeof (parsed as PublicationFeedCursor).id !== "string" ||
    !Number.isFinite((parsed as PublicationFeedCursor).ts) ||
    (parsed as PublicationFeedCursor).id.length === 0
  ) {
    throw new Error("malformed publication feed cursor");
  }
  return { ts: (parsed as PublicationFeedCursor).ts, id: (parsed as PublicationFeedCursor).id };
}

export function publicationMatchesTagsAll(
  tags: readonly string[],
  tagsAll: readonly string[],
): boolean {
  if (tagsAll.length === 0) return true;
  const set = new Set(tags);
  for (const t of tagsAll) {
    if (!set.has(t)) return false;
  }
  return true;
}
