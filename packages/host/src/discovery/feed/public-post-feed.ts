import type { CatalogPersistence } from "@khoralabs/colonnade/persistence";
import { encodePublicationFeedCursor } from "@khoralabs/colonnade/persistence";
import type {
  KhoraStandingSearchRequest,
  PublicFeedPost,
  PublicPostFeedListResponse,
  PublicPostFeedNewerCountResponse,
} from "@khoralabs/khora-contracts";
import { authorPrincipalIdFromPostId } from "../../lib/post-address-id";
import type { PostResolver } from "../../ports";

export type PublicPostFeedListParams = {
  limit: number;
  cursor?: string;
  authorDid?: string;
  /** AND semantics. */
  tags?: string[];
};

export type PublicPostFeedNewerCountParams = {
  afterMs: number;
  authorDid?: string;
  tags?: string[];
};

export type PublicPostFeedReader = {
  list(params: PublicPostFeedListParams): Promise<PublicPostFeedListResponse>;
  newerCount(params: PublicPostFeedNewerCountParams): Promise<PublicPostFeedNewerCountResponse>;
};

export type CatalogPublicPostFeedReaderDeps = {
  catalog: CatalogPersistence;
  tenantKey: string;
  postResolver: PostResolver;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HYDRATE_BATCH = 40;
const MAX_SCAN = 500;

export class PublicPostFeedBadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicPostFeedBadRequest";
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) throw new PublicPostFeedBadRequest("limit must be >= 1");
  return Math.min(n, MAX_LIMIT);
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (tags === undefined) return [];
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (trimmed.length === 0) {
      throw new PublicPostFeedBadRequest("tag must be non-empty");
    }
    out.push(trimmed);
  }
  return out;
}

function asKind(value: unknown): PublicFeedPost["kind"] {
  if (value === "status" || value === "subscription" || value === "post") return value;
  return "post";
}

function asVisibility(value: unknown): PublicFeedPost["visibility"] {
  if (value === "network" || value === "private" || value === "public") return value;
  return "public";
}

function asTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string" && t.length > 0);
}

function asSearch(value: unknown): KhoraStandingSearchRequest | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const search = value as KhoraStandingSearchRequest;
  if (
    search.content === null ||
    typeof search.content !== "object" ||
    Array.isArray(search.content)
  ) {
    return undefined;
  }
  return search;
}

function toFeedPost(
  post: NonNullable<Awaited<ReturnType<PostResolver["resolvePostById"]>>>,
  publishedAtMs: number,
): PublicFeedPost | null {
  const authorDid = authorPrincipalIdFromPostId(post.id);
  if (authorDid === undefined || authorDid.length === 0) return null;
  const item: PublicFeedPost = {
    id: post.id,
    kind: asKind(post.kind),
    authorDid,
    topics: asTopics(post.topics),
    visibility: asVisibility(post.visibility),
    publishedAtMs,
  };
  if (typeof post.authorProfileId === "string") item.authorProfileId = post.authorProfileId;
  if (typeof post.title === "string") item.title = post.title;
  if (typeof post.body === "string") item.body = post.body;
  if (item.kind === "subscription") {
    const search = asSearch(post.search);
    if (search !== undefined) item.search = search;
  }
  return item;
}

export function createCatalogPublicPostFeedReader(
  deps: CatalogPublicPostFeedReaderDeps,
): PublicPostFeedReader {
  const listCatalog = (opts: {
    limit: number;
    cursor?: string;
    authorDid?: string;
    tags: string[];
  }) =>
    deps.catalog.listPublicationPointers({
      tenant_key: deps.tenantKey,
      limit: opts.limit,
      ...(opts.cursor !== undefined && opts.cursor.length > 0 ? { cursor: opts.cursor } : {}),
      ...(opts.authorDid !== undefined && opts.authorDid.trim().length > 0
        ? { publisher_principal_id: opts.authorDid.trim() }
        : {}),
      ...(opts.tags.length > 0 ? { tags_all: opts.tags } : {}),
    });

  return {
    async list(params: PublicPostFeedListParams): Promise<PublicPostFeedListResponse> {
      const limit = clampLimit(params.limit);
      const tags = normalizeTags(params.tags);
      if (params.authorDid !== undefined && params.authorDid.trim().length === 0) {
        throw new PublicPostFeedBadRequest("authorDid must be non-empty");
      }

      let cursor = params.cursor;
      const items: PublicFeedPost[] = [];
      let lastExamined: { published_at_ms: number; catalog_pointer_id: string } | undefined;
      let scanned = 0;

      while (items.length < limit && scanned < MAX_SCAN) {
        const batchLimit = Math.min(
          HYDRATE_BATCH,
          MAX_SCAN - scanned,
          Math.max(limit - items.length, 1) * 2,
        );
        const page = await listCatalog({
          limit: batchLimit,
          cursor,
          authorDid: params.authorDid,
          tags,
        });
        if (page.entries.length === 0) break;
        scanned += page.entries.length;

        for (const entry of page.entries) {
          lastExamined = {
            published_at_ms: entry.published_at_ms,
            catalog_pointer_id: entry.catalog_pointer_id,
          };
          const post = await deps.postResolver.resolvePostById(entry.publication_key);
          if (post === undefined) {
            await deps.catalog.deletePublicationPointer({
              tenant_key: deps.tenantKey,
              publication_key: entry.publication_key,
            });
            continue;
          }
          const item = toFeedPost(post, entry.published_at_ms);
          if (item === null) continue;
          items.push(item);
          if (items.length >= limit) break;
        }

        if (items.length >= limit) break;
        if (page.next_cursor.length === 0) break;
        cursor = page.next_cursor;
      }

      let nextCursor: string | null = null;
      let hasMore = false;
      if (items.length >= limit && lastExamined !== undefined) {
        const encoded = encodePublicationFeedCursor({
          ts: lastExamined.published_at_ms,
          id: lastExamined.catalog_pointer_id,
        });
        const peek = await listCatalog({
          limit: 1,
          cursor: encoded,
          authorDid: params.authorDid,
          tags,
        });
        hasMore = peek.entries.length > 0;
        nextCursor = hasMore ? encoded : null;
      }

      const watermarkMs =
        items.length > 0 ? Math.max(...items.map((i) => i.publishedAtMs)) : Date.now();

      return { items, nextCursor, hasMore, watermarkMs };
    },

    async newerCount(
      params: PublicPostFeedNewerCountParams,
    ): Promise<PublicPostFeedNewerCountResponse> {
      if (!Number.isFinite(params.afterMs)) {
        throw new PublicPostFeedBadRequest("afterMs must be a number");
      }
      const tags = normalizeTags(params.tags);
      if (params.authorDid !== undefined && params.authorDid.trim().length === 0) {
        throw new PublicPostFeedBadRequest("authorDid must be non-empty");
      }
      const out = await deps.catalog.countPublicationPointersAfter({
        tenant_key: deps.tenantKey,
        after_ms: params.afterMs,
        ...(params.authorDid !== undefined && params.authorDid.trim().length > 0
          ? { publisher_principal_id: params.authorDid.trim() }
          : {}),
        ...(tags.length > 0 ? { tags_all: tags } : {}),
      });
      return { count: out.count };
    },
  };
}
