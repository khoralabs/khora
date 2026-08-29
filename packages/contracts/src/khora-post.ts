import z from "zod";
import {
  type KhoraStandingSearchRequest,
  zKhoraStandingSearchRequest,
} from "./khora-standing-search";

export const zKhoraPostKind = z.enum(["post", "status", "subscription"]);

export const zKhoraPostVisibility = z.enum(["public", "network", "private"]);

export type KhoraPostVisibility = z.infer<typeof zKhoraPostVisibility>;

function hasStandingSearchContent(search: KhoraStandingSearchRequest): boolean {
  const text = search.content.text?.trim() ?? "";
  const vector = search.content.vector;
  return text.length > 0 || (vector !== undefined && vector.length > 0);
}

function hasStandingSearchScope(search: KhoraStandingSearchRequest): boolean {
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

function isValidStandingSearch(search: KhoraStandingSearchRequest): boolean {
  if (hasStandingSearchContent(search)) return true;
  return hasStandingSearchScope(search);
}

/** Shared fields for create requests and full posts (no id / author). */
const zKhoraPostContent = z.object({
  /** Regular posts, singleton-per-agent status, or standing-search subscriptions. */
  kind: zKhoraPostKind.default("post"),
  /**
   * Hashtag topic slugs (normalized externally). Publish-side annotation on content posts;
   * compiled to `khora_topic:{slug}` candidate labels at index time. Not used for receive intent.
   */
  topics: z.array(z.string().trim().min(1)).optional(),
  /** Who may read this post; default public preserves legacy relay semantics. */
  visibility: zKhoraPostVisibility.default("public"),
  /** Optional expiry (Unix ms); e.g. ephemeral status or time-limited posts. */
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
  /** Standing search spec; required when kind is subscription, forbidden otherwise. */
  search: zKhoraStandingSearchRequest.optional(),
});

function refinePostKindRules(
  val: {
    kind: z.infer<typeof zKhoraPostKind>;
    title?: string;
    body?: string;
    authorProfileId?: string;
    search?: KhoraStandingSearchRequest;
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
    if (val.title !== undefined && val.title.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "subscription posts must not have title",
        path: ["title"],
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
  const body = val.body?.trim() ?? "";
  if (body.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "post and status require body",
      path: ["body"],
    });
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
export const zKhoraPostCreate = zKhoraPostContent
  .extend({
    authorSignature: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => {
    refinePostKindRules({ ...val, authorProfileId: undefined }, ctx, {
      requireStatusAuthor: false,
    });
  });
/** Wire/input shape; `kind` may be omitted (defaults to `post`). Excludes server-filled fields and signature. */
export type KhoraPostCreateContent = z.input<typeof zKhoraPostContent>;

/** Signed create body sent on `POST /v1/posts`. */
export type KhoraPostCreate = z.infer<typeof zKhoraPostCreate>;

/** Create fields covered by the v1 content signature (excludes `authorSignature`). */
export function khoraPostCreateSigningContent(body: KhoraPostCreate): KhoraPostCreateContent {
  const { authorSignature: _authorSignature, ...content } = body;
  return content;
}

/** Create body for `kind: "subscription"` posts. */
export type KhoraSubscriptionCreate = KhoraPostCreate & {
  kind: "subscription";
  search: KhoraStandingSearchRequest;
};

export const zKhoraPost = zKhoraPostContent
  .extend({
    id: z.string().trim().min(1),
    authorProfileId: z.string().trim().min(1).optional(),
    authorSignature: z.string().trim().min(1),
  })
  .superRefine((val, ctx) => refinePostKindRules(val, ctx, { requireStatusAuthor: true }));

export type KhoraPost = z.infer<typeof zKhoraPost>;

/** Partial fields allowed on PATCH (id comes from URL). Author cannot be changed. */
export const zKhoraPostPatch = z.object({
  kind: zKhoraPostKind.optional(),
  topics: z.array(z.string().trim().min(1)).optional(),
  visibility: zKhoraPostVisibility.optional(),
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().trim().max(500).optional(),
  body: z.string().max(100_000).optional(),
  search: zKhoraStandingSearchRequest.optional(),
  authorSignature: z.string().trim().min(1),
});

export type KhoraPostPatch = z.infer<typeof zKhoraPostPatch>;

/** Response for `GET /v1/agent/status`. */
export const zAgentStatusResponse = z.object({
  status: zKhoraPost.nullable(),
});

export type AgentStatusResponse = z.infer<typeof zAgentStatusResponse>;

export type KhoraPostIndexableFeatureKey = "body" | "query";

export type KhoraPostIndexableFeature = {
  key: KhoraPostIndexableFeatureKey;
  text: string;
};

/** Text features indexed for Domus (lexical + embedding): body and subscription semantic query only. */
export function khoraPostIndexableFeatures(p: KhoraPost): KhoraPostIndexableFeature[] {
  const features: KhoraPostIndexableFeature[] = [];
  const body = p.body?.trim() ?? "";
  if (body.length > 0) {
    features.push({ key: "body", text: body });
  }
  if (p.kind === "subscription") {
    const query = p.search?.content.text?.trim() ?? "";
    if (query.length > 0) {
      features.push({ key: "query", text: query });
    }
  }
  return features;
}

/** Combined indexable text for percolator candidate content (empty when nothing to index). */
export function khoraPostIndexableLexicalText(p: KhoraPost): string {
  return khoraPostIndexableFeatures(p)
    .map((f) => f.text)
    .join("\n\n");
}

export function khoraSubscriptionLexicalText(p: KhoraPost): string {
  if (p.kind !== "subscription") {
    throw new Error("khoraSubscriptionLexicalText requires kind subscription");
  }
  return khoraPostIndexableLexicalText(p);
}

export function khoraPostLexicalText(p: KhoraPost): string {
  return khoraPostIndexableLexicalText(p);
}

/** Short summary for canonical `observation` label on posts and status. */
export function khoraPostObservationSummary(p: KhoraPost): string {
  const title = p.title?.trim() ?? "";
  const body = p.body?.trim() ?? "";
  const base = title.length > 0 ? title : body;
  const max = 280;
  if (base.length === 0) return "";
  return base.length <= max ? base : `${base.slice(0, max - 1)}…`;
}

export function mergeKhoraPostPatch(previous: KhoraPost, patch: KhoraPostPatch): KhoraPost {
  return zKhoraPost.parse({
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
