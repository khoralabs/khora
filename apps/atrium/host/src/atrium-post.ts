import z from "zod";

export const zAtriumPost = z.object({
  id: z.string().trim().min(1),
  authorProfileId: z.string().trim().min(1).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000),
});

export type AtriumPost = z.infer<typeof zAtriumPost>;

/** Partial fields allowed on PATCH (id comes from URL). */
export const zAtriumPostPatch = z.object({
  authorProfileId: z.string().trim().min(1).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
});

export type AtriumPostPatch = z.infer<typeof zAtriumPostPatch>;

export function atriumPostLexicalText(p: AtriumPost): string {
  const parts = [p.title, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}

/** Short summary for canonical `observation` label `summary` field. */
export function atriumPostObservationSummary(p: AtriumPost): string {
  const base = p.title !== undefined && p.title.length > 0 ? p.title : p.body;
  const max = 280;
  return base.length <= max ? base : `${base.slice(0, max - 1)}…`;
}

export function mergeAtriumPostPatch(previous: AtriumPost, patch: AtriumPostPatch): AtriumPost {
  return zAtriumPost.parse({
    id: previous.id,
    authorProfileId: patch.authorProfileId ?? previous.authorProfileId,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body,
  });
}
