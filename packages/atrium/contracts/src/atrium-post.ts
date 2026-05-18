import z from "zod";

export const zAtriumPostKind = z.enum(["post", "status"]);

/** Shared fields for create requests and full posts (no id / author). */
const zAtriumPostContent = z.object({
  /** Regular posts or singleton-per-agent status. */
  kind: zAtriumPostKind.default("post"),
  /** Hashtag topic slugs (normalized externally); publish-time routing only. */
  topics: z.array(z.string().trim().min(1)).optional(),
  /** Optional expiry (Unix ms); e.g. ephemeral status or time-limited posts. */
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000),
});

/** Body for `POST /v1/posts`; server fills `id` and `authorProfileId` from DID registration. */
export const zAtriumPostCreate = zAtriumPostContent;
/** Wire/input shape; `kind` may be omitted (defaults to `post`). */
export type AtriumPostCreate = z.input<typeof zAtriumPostCreate>;

export const zAtriumPost = zAtriumPostContent
  .extend({
    id: z.string().trim().min(1),
    authorProfileId: z.string().trim().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.kind === "status" &&
      (val.authorProfileId === undefined || val.authorProfileId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "status posts require authorProfileId",
        path: ["authorProfileId"],
      });
    }
  });

export type AtriumPost = z.infer<typeof zAtriumPost>;

/** Partial fields allowed on PATCH (id comes from URL). Author cannot be changed. */
export const zAtriumPostPatch = z.object({
  kind: zAtriumPostKind.optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
});

export type AtriumPostPatch = z.infer<typeof zAtriumPostPatch>;

/** Response for `GET /v1/agent/status`. */
export const zAgentStatusResponse = z.object({
  status: zAtriumPost.nullable(),
});

export type AgentStatusResponse = z.infer<typeof zAgentStatusResponse>;

export function atriumPostLexicalText(p: AtriumPost): string {
  const topicLine =
    p.topics !== undefined && p.topics.length > 0 ? p.topics.map((t) => `#${t}`).join(" ") : "";
  const parts = [p.title, topicLine, p.body].filter((s) => s !== undefined && s.length > 0);
  return parts.join("\n\n");
}

/** Short summary for canonical `observation` label on posts and status. */
export function atriumPostObservationSummary(p: AtriumPost): string {
  const base = p.title !== undefined && p.title.length > 0 ? p.title : p.body;
  const max = 280;
  return base.length <= max ? base : `${base.slice(0, max - 1)}…`;
}

export function mergeAtriumPostPatch(previous: AtriumPost, patch: AtriumPostPatch): AtriumPost {
  return zAtriumPost.parse({
    id: previous.id,
    authorProfileId: previous.authorProfileId,
    kind: patch.kind ?? previous.kind,
    topics: patch.topics ?? previous.topics,
    expiresAtMs: patch.expiresAtMs ?? previous.expiresAtMs,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body,
  });
}
