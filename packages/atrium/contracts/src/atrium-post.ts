import z from "zod";

export const zAtriumPostKind = z.enum(["post", "status", "probe"]);

export const zAtriumProbeAttributes = z.object({
  stage: z.string().trim().min(1).optional(),
  domains: z.array(z.string().trim().min(1)).optional(),
  engagementType: z.string().trim().min(1).optional(),
});

export type AtriumProbeAttributes = z.infer<typeof zAtriumProbeAttributes>;

/** Shared fields for create requests and full posts (no id / author). */
const zAtriumPostContent = z.object({
  /** Regular posts, singleton-per-agent status, or structured intent probes. */
  kind: zAtriumPostKind.default("post"),
  /** Hashtag topic slugs (normalized externally); publish-time routing only. */
  topics: z.array(z.string().trim().min(1)).optional(),
  /** Optional expiry (Unix ms); e.g. ephemeral status or time-limited posts. */
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000),
  /** Structured probe metadata; required when kind is probe, forbidden otherwise. */
  attributes: zAtriumProbeAttributes.optional(),
});

function refinePostKindRules(
  val: {
    kind: z.infer<typeof zAtriumPostKind>;
    title?: string;
    body: string;
    authorProfileId?: string;
    attributes?: AtriumProbeAttributes;
  },
  ctx: z.RefinementCtx,
  opts: { requireStatusAuthor?: boolean },
): void {
  if (val.kind === "status" && opts.requireStatusAuthor) {
    if (val.authorProfileId === undefined || val.authorProfileId.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "status posts require authorProfileId",
        path: ["authorProfileId"],
      });
    }
  }
  if (val.kind === "status" && val.attributes !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "attributes are only allowed on probe posts",
      path: ["attributes"],
    });
  }
  if (val.kind === "probe") {
    if (val.title === undefined || val.title.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "probe posts require title",
        path: ["title"],
      });
    }
    if (val.body.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "probe posts require body",
        path: ["body"],
      });
    }
    if (val.attributes === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "probe posts require attributes",
        path: ["attributes"],
      });
    }
    return;
  }
  if (val.kind !== "post" && val.kind !== "status") {
    return;
  }
  if (val.attributes !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "attributes are only allowed on probe posts",
      path: ["attributes"],
    });
  }
}

/** Body for `POST /v1/posts`; server fills `id` and `authorProfileId` from DID registration. */
export const zAtriumPostCreate = zAtriumPostContent
  .extend({
    authorSignature: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => {
    refinePostKindRules({ ...val, authorProfileId: undefined }, ctx, {
      requireStatusAuthor: false,
    });
  });
/** Wire/input shape; `kind` may be omitted (defaults to `post`). Excludes server-filled fields and signature. */
export type AtriumPostCreateContent = z.input<typeof zAtriumPostContent>;

/** Signed create body sent on `POST /v1/posts`. */
export type AtriumPostCreate = z.infer<typeof zAtriumPostCreate>;

/** Create fields covered by the v1 content signature (excludes `authorSignature`). */
export function atriumPostCreateSigningContent(body: AtriumPostCreate): AtriumPostCreateContent {
  const { authorSignature: _authorSignature, ...content } = body;
  return content;
}

/** Create body for `kind: "probe"` posts. */
export type AtriumProbeCreate = AtriumPostCreate & {
  kind: "probe";
  title: string;
  attributes: AtriumProbeAttributes;
};

export const zAtriumPost = zAtriumPostContent
  .extend({
    id: z.string().trim().min(1),
    authorProfileId: z.string().trim().min(1).optional(),
    authorSignature: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => refinePostKindRules(val, ctx, { requireStatusAuthor: true }));

export type AtriumPost = z.infer<typeof zAtriumPost>;

/** Partial fields allowed on PATCH (id comes from URL). Author cannot be changed. */
export const zAtriumPostPatch = z.object({
  kind: zAtriumPostKind.optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
  attributes: zAtriumProbeAttributes.optional(),
  authorSignature: z.string().trim().min(1),
});

export type AtriumPostPatch = z.infer<typeof zAtriumPostPatch>;

/** Response for `GET /v1/agent/status`. */
export const zAgentStatusResponse = z.object({
  status: zAtriumPost.nullable(),
});

export type AgentStatusResponse = z.infer<typeof zAgentStatusResponse>;

function formatProbeAttributes(attributes: AtriumProbeAttributes): string {
  const parts: string[] = [];
  if (attributes.stage !== undefined) parts.push(`stage: ${attributes.stage}`);
  if (attributes.domains !== undefined && attributes.domains.length > 0) {
    parts.push(`domains: ${attributes.domains.join(", ")}`);
  }
  if (attributes.engagementType !== undefined) {
    parts.push(`engagement: ${attributes.engagementType}`);
  }
  return parts.join("\n");
}

export function atriumProbeLexicalText(p: AtriumPost): string {
  if (p.kind !== "probe") {
    throw new Error("atriumProbeLexicalText requires kind probe");
  }
  const topicLine =
    p.topics !== undefined && p.topics.length > 0 ? p.topics.map((t) => `#${t}`).join(" ") : "";
  const attrLine = p.attributes !== undefined ? formatProbeAttributes(p.attributes) : "";
  const parts = [p.title, topicLine, p.body, attrLine].filter(
    (s) => s !== undefined && s.length > 0,
  );
  return parts.join("\n\n");
}

export function atriumPostLexicalText(p: AtriumPost): string {
  if (p.kind === "probe") {
    return atriumProbeLexicalText(p);
  }
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
    attributes: patch.attributes ?? previous.attributes,
    authorSignature: patch.authorSignature,
  });
}
