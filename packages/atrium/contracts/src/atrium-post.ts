import z from "zod";

export const zAtriumPostKind = z.enum(["post", "probe", "status"]);

/** Incoming kinds a probe may subscribe to (not `probe` itself). */
export const zAtriumProbeMatchPostKind = z.enum(["post", "status"]);

/** Shared fields for create requests and full posts (no id / author). */
const zAtriumPostContent = z.object({
  /** Regular posts, probes, or singleton-per-agent status. */
  kind: zAtriumPostKind.default("post"),
  /** Hashtag topic slugs (normalized externally); publish-time routing only. */
  topics: z.array(z.string().trim().min(1)).optional(),
  /** For {@link kind} probe only: which incoming post kinds may trigger a hit (omit = any). */
  matchPostKinds: z.array(zAtriumProbeMatchPostKind).optional(),
  /** For {@link kind} probe only: minimum cosine similarity required for delivery (0..1). */
  minHitScore: z.number().min(0).max(1).optional(),
  /** For {@link kind} probe only: Unix ms after which the probe stops delivering hits. */
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
      (val.kind === "probe" || val.kind === "status") &&
      (val.authorProfileId === undefined || val.authorProfileId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${val.kind} posts require authorProfileId`,
        path: ["authorProfileId"],
      });
    }
    if (val.kind !== "probe") {
      if (val.minHitScore !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "minHitScore is only allowed on probe posts",
          path: ["minHitScore"],
        });
      }
      if (val.expiresAtMs !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "expiresAtMs is only allowed on probe posts",
          path: ["expiresAtMs"],
        });
      }
    }
  });

export type AtriumPost = z.infer<typeof zAtriumPost>;

/** Partial fields allowed on PATCH (id comes from URL). Author cannot be changed. */
export const zAtriumPostPatch = z.object({
  kind: zAtriumPostKind.optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  matchPostKinds: z.array(zAtriumProbeMatchPostKind).optional(),
  minHitScore: z.number().min(0).max(1).optional(),
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

/** Short summary for canonical `observation` label on normal posts; probes use `probe` label. */
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
    matchPostKinds: patch.matchPostKinds ?? previous.matchPostKinds,
    minHitScore: patch.minHitScore ?? previous.minHitScore,
    expiresAtMs: patch.expiresAtMs ?? previous.expiresAtMs,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body,
  });
}
