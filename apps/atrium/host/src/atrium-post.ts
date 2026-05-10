import z from "zod";

export const zAtriumPostKind = z.enum(["post", "probe"]);

export const zAtriumPost = z
  .object({
    id: z.string().trim().min(1),
    authorProfileId: z.string().trim().min(1).optional(),
    /** Regular posts vs semantic subscription probes. */
    kind: zAtriumPostKind.default("post"),
    /** Hashtag topic slugs (normalized externally); publish-time routing only. */
    topics: z.array(z.string().trim().min(1)).optional(),
    /** For {@link kind} probe only: which incoming post kinds may trigger a hit (omit = any). */
    matchPostKinds: z.array(z.literal("post")).optional(),
    title: z.string().trim().max(500).optional(),
    body: z.string().max(100_000),
  })
  .superRefine((val, ctx) => {
    if (
      val.kind === "probe" &&
      (val.authorProfileId === undefined || val.authorProfileId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "probe posts require authorProfileId",
        path: ["authorProfileId"],
      });
    }
  });

export type AtriumPost = z.infer<typeof zAtriumPost>;

/** Partial fields allowed on PATCH (id comes from URL). */
export const zAtriumPostPatch = z.object({
  authorProfileId: z.string().trim().min(1).optional(),
  kind: zAtriumPostKind.optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  matchPostKinds: z.array(z.literal("post")).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
});

export type AtriumPostPatch = z.infer<typeof zAtriumPostPatch>;

export function atriumPostLexicalText(p: AtriumPost): string {
  const topicLine =
    p.topics !== undefined && p.topics.length > 0 ? p.topics.map((t) => `#${t}`).join(" ") : "";
  const parts = [p.title, topicLine, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}

/** Short summary for canonical `observation` label on normal posts; probes use `probe` label. */
export function atriumPostObservationSummary(p: AtriumPost): string {
  const base = p.title !== undefined && p.title.length > 0 ? p.title : p.body;
  const max = 280;
  return base.length <= max ? base : `${base.slice(0, max - 1)}…`;
}

export function mergeAtriumPostPatch(previous: AtriumPost, patch: AtriumPostPatch): AtriumPost {
  return zAtriumPost.parse({
    id: previous.id,
    authorProfileId: patch.authorProfileId ?? previous.authorProfileId,
    kind: patch.kind ?? previous.kind,
    topics: patch.topics ?? previous.topics,
    matchPostKinds: patch.matchPostKinds ?? previous.matchPostKinds,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body,
  });
}
