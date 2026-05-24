import z from "zod";
import {
  type AtriumStandingSearchRequest,
  zAtriumStandingSearchRequest,
} from "./atrium-standing-search.ts";

export const zAtriumPostKind = z.enum(["post", "status", "subscription"]);

export const zAtriumPostVisibility = z.enum(["public", "network", "private"]);

export type AtriumPostVisibility = z.infer<typeof zAtriumPostVisibility>;

function hasStandingSearchContent(search: AtriumStandingSearchRequest): boolean {
  const text = search.content.text?.trim() ?? "";
  const vector = search.content.vector;
  return text.length > 0 || (vector !== undefined && vector.length > 0);
}

function hasStandingSearchScope(search: AtriumStandingSearchRequest): boolean {
  if (search.searchEntireDatabase === true) return true;
  if (search.namespace !== undefined && search.namespace.length > 0) return true;
  if (search.additionalNamespaces !== undefined && search.additionalNamespaces.length > 0) {
    return true;
  }
  const labels = search.options?.labels;
  if (labels?.all !== undefined && labels.all.length > 0) return true;
  if (labels?.some !== undefined && labels.some.length > 0) return true;
  return false;
}

function isValidStandingSearch(search: AtriumStandingSearchRequest): boolean {
  if (hasStandingSearchContent(search)) return true;
  return hasStandingSearchScope(search);
}

/** Shared fields for create requests and full posts (no id / author). */
const zAtriumPostContent = z.object({
  /** Regular posts, singleton-per-agent status, or standing-search subscriptions. */
  kind: zAtriumPostKind.default("post"),
  /**
   * Hashtag topic slugs (normalized externally). Publish-side annotation on content posts;
   * compiled to `atrium_topic:{slug}` candidate labels at index time. Not used for receive intent.
   */
  topics: z.array(z.string().trim().min(1)).optional(),
  /** Who may read this post; default public preserves legacy relay semantics. */
  visibility: zAtriumPostVisibility.default("public"),
  /** Optional expiry (Unix ms); e.g. ephemeral status or time-limited posts. */
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000),
  /** Standing search spec; required when kind is subscription, forbidden otherwise. */
  search: zAtriumStandingSearchRequest.optional(),
});

function refinePostKindRules(
  val: {
    kind: z.infer<typeof zAtriumPostKind>;
    title?: string;
    body: string;
    authorProfileId?: string;
    search?: AtriumStandingSearchRequest;
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
  if (val.kind === "status" && val.search !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "search is only allowed on subscription posts",
      path: ["search"],
    });
  }
  if (val.kind === "subscription") {
    if (val.title === undefined || val.title.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "subscription posts require title",
        path: ["title"],
      });
    }
    if (val.body.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "subscription posts require body",
        path: ["body"],
      });
    }
    if (val.search === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "subscription posts require search",
        path: ["search"],
      });
    } else if (!isValidStandingSearch(val.search)) {
      ctx.addIssue({
        code: "custom",
        message:
          "subscription search requires content (text or vector) or scope (namespace, labels, or searchEntireDatabase)",
        path: ["search"],
      });
    }
    return;
  }
  if (val.kind !== "post" && val.kind !== "status") {
    return;
  }
  if (val.search !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "search is only allowed on subscription posts",
      path: ["search"],
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

/** Create body for `kind: "subscription"` posts. */
export type AtriumSubscriptionCreate = AtriumPostCreate & {
  kind: "subscription";
  title: string;
  search: AtriumStandingSearchRequest;
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
  visibility: zAtriumPostVisibility.optional(),
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
  search: zAtriumStandingSearchRequest.optional(),
  authorSignature: z.string().trim().min(1),
});

export type AtriumPostPatch = z.infer<typeof zAtriumPostPatch>;

/** Response for `GET /v1/agent/status`. */
export const zAgentStatusResponse = z.object({
  status: zAtriumPost.nullable(),
});

export type AgentStatusResponse = z.infer<typeof zAgentStatusResponse>;

export function atriumSubscriptionLexicalText(p: AtriumPost): string {
  if (p.kind !== "subscription") {
    throw new Error("atriumSubscriptionLexicalText requires kind subscription");
  }
  const topicLine =
    p.topics !== undefined && p.topics.length > 0 ? p.topics.map((t) => `#${t}`).join(" ") : "";
  const searchText = p.search?.content.text?.trim() ?? "";
  const parts = [p.title, topicLine, p.body, searchText].filter(
    (s) => s !== undefined && s.length > 0,
  );
  return parts.join("\n\n");
}

export function atriumPostLexicalText(p: AtriumPost): string {
  if (p.kind === "subscription") {
    return atriumSubscriptionLexicalText(p);
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
    visibility: patch.visibility ?? previous.visibility,
    expiresAtMs: patch.expiresAtMs ?? previous.expiresAtMs,
    title: patch.title ?? previous.title,
    body: patch.body ?? previous.body,
    search: patch.search ?? previous.search,
    authorSignature: patch.authorSignature,
  });
}
