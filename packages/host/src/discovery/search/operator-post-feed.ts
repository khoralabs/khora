import type { Database } from "bun:sqlite";
import type {
  KhoraStandingSearchRequest,
  OperatorFeedPost,
  OperatorPostFeedListResponse,
  OperatorPostFeedNewerCountResponse,
} from "@khoralabs/khora-contracts";
import { authorPrincipalIdFromPostId } from "../../lib/post-address-id";
import type { PostResolver } from "../../ports";
import { postsMemoryNamespace } from "./namespace";

export type OperatorPostFeedListParams = {
  limit: number;
  cursor?: string;
  authorDid?: string;
  /** AND semantics. */
  tags?: string[];
};

export type OperatorPostFeedNewerCountParams = {
  afterMs: number;
  authorDid?: string;
  tags?: string[];
};

export type OperatorPostFeedReader = {
  list(params: OperatorPostFeedListParams): Promise<OperatorPostFeedListResponse>;
  newerCount(params: OperatorPostFeedNewerCountParams): Promise<OperatorPostFeedNewerCountResponse>;
};

export type SqliteOperatorPostFeedReaderDeps = {
  db: Database;
  postResolver: PostResolver;
  namespaceRoot: string;
  profileIdForPrincipal: (principalId: string) => string | undefined;
};

type IndexRow = {
  _id: number;
  _ts_created: number;
  post_id: string;
};

type CursorTuple = { ts: number; id: number };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HYDRATE_BATCH = 40;
const MAX_SCAN = 500;

function encodeCursor(tuple: CursorTuple): string {
  return Buffer.from(JSON.stringify(tuple), "utf8").toString("base64url");
}

function decodeCursor(raw: string): CursorTuple {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new OperatorPostFeedBadRequest("malformed cursor");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as CursorTuple).ts !== "number" ||
    typeof (parsed as CursorTuple).id !== "number" ||
    !Number.isFinite((parsed as CursorTuple).ts) ||
    !Number.isFinite((parsed as CursorTuple).id)
  ) {
    throw new OperatorPostFeedBadRequest("malformed cursor");
  }
  return { ts: (parsed as CursorTuple).ts, id: (parsed as CursorTuple).id };
}

export class OperatorPostFeedBadRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorPostFeedBadRequest";
  }
}

export class OperatorPostFeedUnavailable extends Error {
  constructor(message = "Khora memories post index is unavailable") {
    super(message);
    this.name = "OperatorPostFeedUnavailable";
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const n = Math.floor(limit);
  if (n < 1) throw new OperatorPostFeedBadRequest("limit must be >= 1");
  return Math.min(n, MAX_LIMIT);
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (tags === undefined) return [];
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (trimmed.length === 0) {
      throw new OperatorPostFeedBadRequest("tag must be non-empty");
    }
    out.push(trimmed);
  }
  return out;
}

function buildFilterSql(params: {
  authorNamespace?: string;
  tags: string[];
  cursor?: CursorTuple;
  afterMs?: number;
}): { where: string; args: Array<string | number> } {
  const clauses: string[] = ["nl.kind IN ('khora_post', 'khora_subscription')", "m.suppressed = 0"];
  const args: Array<string | number> = [];

  if (params.authorNamespace !== undefined) {
    clauses.push("m.namespace = ?");
    args.push(params.authorNamespace);
  }

  for (const tag of params.tags) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM json_each(json_extract(nla.props, '$.topics')) AS t
        WHERE t.value = ?
      )`,
    );
    args.push(tag);
  }

  if (params.cursor !== undefined) {
    clauses.push("((m._ts_created < ?) OR (m._ts_created = ? AND m._id < ?))");
    args.push(params.cursor.ts, params.cursor.ts, params.cursor.id);
  }

  if (params.afterMs !== undefined) {
    clauses.push("m._ts_created > ?");
    args.push(params.afterMs);
  }

  return { where: clauses.join(" AND "), args };
}

const FROM_JOIN = `
FROM memories m
JOIN nodes n ON n.memory_id = m._id
JOIN node_label_assignments nla ON nla.node_id = n._id
JOIN node_labels nl ON nl._id = nla.label_id
`;

function asKind(value: unknown): OperatorFeedPost["kind"] {
  if (value === "status" || value === "subscription" || value === "post") {
    return value;
  }
  return "post";
}

function asVisibility(value: unknown): OperatorFeedPost["visibility"] {
  if (value === "network" || value === "private" || value === "public") {
    return value;
  }
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
  indexedAtMs: number,
): OperatorFeedPost | null {
  const authorDid = authorPrincipalIdFromPostId(post.id);
  if (authorDid === undefined || authorDid.length === 0) return null;

  const item: OperatorFeedPost = {
    id: post.id,
    kind: asKind(post.kind),
    authorDid,
    topics: asTopics(post.topics),
    visibility: asVisibility(post.visibility),
    indexedAtMs,
  };
  if (typeof post.authorProfileId === "string") {
    item.authorProfileId = post.authorProfileId;
  }
  if (typeof post.title === "string") item.title = post.title;
  if (typeof post.body === "string") item.body = post.body;
  if (item.kind === "subscription") {
    const search = asSearch(post.search);
    if (search !== undefined) item.search = search;
  }
  return item;
}

export function createSqliteOperatorPostFeedReader(
  deps: SqliteOperatorPostFeedReaderDeps,
): OperatorPostFeedReader {
  const resolveAuthorNamespace = (authorDid: string | undefined): string | undefined => {
    if (authorDid === undefined) return undefined;
    const did = authorDid.trim();
    if (did.length === 0) {
      throw new OperatorPostFeedBadRequest("authorDid must be non-empty");
    }
    const profileId = deps.profileIdForPrincipal(did);
    if (profileId === undefined) {
      return `${deps.namespaceRoot}/agents/__missing__/posts`;
    }
    return postsMemoryNamespace(deps.namespaceRoot, profileId);
  };

  const queryIndex = (opts: {
    authorDid?: string;
    tags: string[];
    cursor?: CursorTuple;
    afterMs?: number;
    limit: number;
  }): IndexRow[] => {
    const { where, args } = buildFilterSql({
      authorNamespace: resolveAuthorNamespace(opts.authorDid),
      tags: opts.tags,
      cursor: opts.cursor,
      afterMs: opts.afterMs,
    });
    const sql = `
SELECT m._id AS _id, m._ts_created AS _ts_created, m.key AS post_id
${FROM_JOIN}
WHERE ${where}
ORDER BY m._ts_created DESC, m._id DESC
LIMIT ?
`;
    return deps.db.query(sql).all(...args, opts.limit) as IndexRow[];
  };

  return {
    async list(params: OperatorPostFeedListParams): Promise<OperatorPostFeedListResponse> {
      const limit = clampLimit(params.limit);
      const tags = normalizeTags(params.tags);
      let cursor = params.cursor !== undefined ? decodeCursor(params.cursor) : undefined;

      const items: OperatorFeedPost[] = [];
      let lastExamined: CursorTuple | undefined = cursor;
      let scanned = 0;
      let hasMore = false;

      while (items.length < limit && scanned < MAX_SCAN) {
        const batchLimit = Math.min(
          HYDRATE_BATCH,
          MAX_SCAN - scanned,
          Math.max(limit - items.length, 1) * 2,
        );
        const rows = queryIndex({
          authorDid: params.authorDid,
          tags,
          cursor,
          limit: batchLimit,
        });
        if (rows.length === 0) {
          hasMore = false;
          break;
        }
        scanned += rows.length;
        hasMore = rows.length === batchLimit;

        for (const row of rows) {
          lastExamined = { ts: row._ts_created, id: row._id };
          cursor = lastExamined;
          const post = await deps.postResolver.resolvePostById(row.post_id);
          if (post === undefined) continue;
          const item = toFeedPost(post, row._ts_created);
          if (item === null) continue;
          items.push(item);
          if (items.length >= limit) break;
        }

        if (items.length >= limit) break;
        if (rows.length < batchLimit) {
          hasMore = false;
          break;
        }
      }

      if (items.length >= limit && lastExamined !== undefined) {
        const peek = queryIndex({
          authorDid: params.authorDid,
          tags,
          cursor: lastExamined,
          limit: 1,
        });
        hasMore = peek.length > 0;
      }

      const watermarkMs =
        items.length > 0 ? Math.max(...items.map((i) => i.indexedAtMs)) : Date.now();

      return {
        items,
        nextCursor: hasMore && lastExamined !== undefined ? encodeCursor(lastExamined) : null,
        hasMore,
        watermarkMs,
      };
    },

    async newerCount(
      params: OperatorPostFeedNewerCountParams,
    ): Promise<OperatorPostFeedNewerCountResponse> {
      if (!Number.isFinite(params.afterMs)) {
        throw new OperatorPostFeedBadRequest("afterMs must be a number");
      }
      const tags = normalizeTags(params.tags);
      const { where, args } = buildFilterSql({
        authorNamespace: resolveAuthorNamespace(params.authorDid),
        tags,
        afterMs: params.afterMs,
      });
      const sql = `
SELECT COUNT(*) AS count
${FROM_JOIN}
WHERE ${where}
`;
      const row = deps.db.query(sql).get(...args) as { count: number } | null;
      return { count: row?.count ?? 0 };
    },
  };
}
