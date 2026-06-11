import type { BlogPostFrontmatter, BlogPostMeta } from "./types";

export function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return [];
}

export function parseCoverImage(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const value = String(raw).trim();
  return value || undefined;
}

export function parseFrontmatter(slug: string, data: Record<string, unknown>): BlogPostFrontmatter {
  const cover = parseCoverImage(data.cover ?? data.coverImage);
  return {
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    author: data.author != null ? String(data.author) : undefined,
    tags: normalizeTags(data.tags),
    description: data.description != null ? String(data.description) : undefined,
    cover,
    draft: data.draft === true,
  };
}

export function sortPostsByDate<T extends { date: string }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const ta = Date.parse(a.date);
    const tb = Date.parse(b.date);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

export function getPost<T extends BlogPostMeta>(posts: T[], slug: string): T | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllTags(posts: Pick<BlogPostMeta, "tags">[]): string[] {
  const set = new Set<string>();
  for (const p of posts) for (const t of p.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterPostsByTag<T extends BlogPostMeta>(posts: T[], tag: string | undefined): T[] {
  if (!tag) return posts;
  return posts.filter((p) => p.tags.includes(tag));
}
