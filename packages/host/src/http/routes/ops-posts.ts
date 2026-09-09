import { KHORA_ERROR_CODE, KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import {
  OperatorPostFeedBadRequest,
  type OperatorPostFeedReader,
} from "../../discovery/search/operator-post-feed";
import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

function parseTags(url: URL): string[] {
  return url.searchParams.getAll("tag");
}

function parseOptionalAuthor(url: URL): string | undefined {
  const raw = url.searchParams.get("authorDid");
  if (raw === null) return undefined;
  return raw;
}

function parseLimit(url: URL): number | undefined {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new OperatorPostFeedBadRequest("limit must be a number");
  }
  return n;
}

function parseAfterMs(url: URL): number {
  const raw = url.searchParams.get("afterMs");
  if (raw === null || raw === "") {
    throw new OperatorPostFeedBadRequest("afterMs is required");
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new OperatorPostFeedBadRequest("afterMs must be a number");
  }
  return n;
}

function resolveReader(deps: HostRouteDeps): OperatorPostFeedReader | null {
  return deps.ctx.search?.operatorPostFeed ?? null;
}

function errorResponse(err: unknown): Response {
  if (err instanceof OperatorPostFeedBadRequest) {
    return jsonError(err.message, 400, KHORA_ERROR_CODE.invalid_request);
  }
  throw err;
}

export async function handleOpsPostsList(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    const reader = resolveReader(deps);
    if (reader === null) {
      return jsonError(
        "Khora memories post index is unavailable",
        503,
        KHORA_ERROR_CODE.operator_post_feed_disabled,
      );
    }
    try {
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const result = await reader.list({
        limit: parseLimit(url) ?? 20,
        cursor,
        authorDid: parseOptionalAuthor(url),
        tags: parseTags(url),
      });
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  });
}

export async function handleOpsPostsNewerCount(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    const reader = resolveReader(deps);
    if (reader === null) {
      return jsonError(
        "Khora memories post index is unavailable",
        503,
        KHORA_ERROR_CODE.operator_post_feed_disabled,
      );
    }
    try {
      const result = await reader.newerCount({
        afterMs: parseAfterMs(url),
        authorDid: parseOptionalAuthor(url),
        tags: parseTags(url),
      });
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  });
}

/** True when pathname is an operator posts feed route. */
export function isOpsPostsPath(pathname: string): boolean {
  return pathname === KHORA_HTTP_PATH.opsPosts || pathname === KHORA_HTTP_PATH.opsPostsNewerCount;
}
