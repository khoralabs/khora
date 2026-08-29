import { normalizeTopicSlug } from "@khoralabs/khora-contracts";

const BODY_HASHTAG_RE = /#([a-zA-Z0-9][a-zA-Z0-9_-]{0,62})/g;

/** Parse `#tag` tokens from post body text; invalid tags are skipped. */
export function parseTopicsFromBody(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(BODY_HASHTAG_RE)) {
    const raw = match[1];
    if (raw === undefined || raw.length === 0) continue;
    try {
      const slug = normalizeTopicSlug(raw);
      if (!seen.has(slug)) {
        seen.add(slug);
        out.push(slug);
      }
    } catch {
      // ignore invalid hashtag tokens
    }
  }
  return out;
}

/** Merge topic lists in order, deduplicated. */
export function mergeTopicLists(...lists: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (list === undefined) continue;
    for (const topic of list) {
      const slug = topic.trim();
      if (slug.length === 0 || seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }
  return out.length > 0 ? out : undefined;
}

export function topicsCreatePromptLine(existingTags: readonly string[]): string {
  if (existingTags.length === 0) {
    return "Topics, comma-separated (optional): ";
  }
  return `Existing tags: ${existingTags.join(", ")}. Topics, comma-separated (optional, adds to existing): `;
}

export function topicsUpdatePromptLine(existingTags: readonly string[]): string {
  if (existingTags.length === 0) {
    return "Topics, comma-separated (leave empty to skip): ";
  }
  return `Existing tags: ${existingTags.join(", ")}. Topics, comma-separated (leave empty to skip, adds to existing): `;
}
