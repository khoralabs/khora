import { AuthStrategyError } from "@khoralabs/khora-auth";
import type { KhoraSearchRequest } from "@khoralabs/khora-contracts";
import { executeKhoraMemoriesSearch, khoraSearchRequestFromGetQuery } from "@khoralabs/khora-host";
import type { HostRouteDeps } from "./deps.ts";
import { authErrorResponse, jsonError } from "./responses.ts";

async function optionalReaderDid(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<string | undefined> {
  try {
    const { did } = await deps.ctx.auth.requireAuthenticatedRequest(req, url, "", []);
    return did;
  } catch (e) {
    if (e instanceof AuthStrategyError) {
      return undefined;
    }
    throw e;
  }
}

export async function handleSearchPost(req: Request, deps: HostRouteDeps): Promise<Response> {
  const memories = deps.ctx.memories;
  if (memories === undefined) {
    return jsonError("Memories search is not configured (set KHORA_MEMORIES_DB_PATH)", 503);
  }
  let body: KhoraSearchRequest;
  try {
    body = (await req.json()) as KhoraSearchRequest;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (body.content === undefined) {
    return jsonError("content is required", 400);
  }
  let readerPrincipalId: string | undefined;
  try {
    readerPrincipalId = await optionalReaderDid(req, new URL(req.url), deps);
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const result = await executeKhoraMemoriesSearch({
      client: memories.client,
      store: memories.store,
      embeddingModel: memories.embeddingModel,
      namespaceRoot: memories.namespaceRoot,
      params: body,
      readerPrincipalId,
      social: deps.ctx.social,
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}

export async function handleSearchGet(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const memories = deps.ctx.memories;
  if (memories === undefined) {
    return jsonError("Memories search is not configured (set KHORA_MEMORIES_DB_PATH)", 503);
  }
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) {
    return Response.json({ hits: [] });
  }
  const topKRaw = url.searchParams.get("topK");
  const topK =
    topKRaw !== null && topKRaw.length > 0 ? Math.min(50, Math.max(1, Number(topKRaw) || 10)) : 10;
  const neighbors = url.searchParams.get("neighbors") === "true";
  const maxNeighborsRaw = url.searchParams.get("maxNeighbors");
  const maxNeighbors =
    maxNeighborsRaw !== null && maxNeighborsRaw.length > 0
      ? Math.min(50, Math.max(0, Number(maxNeighborsRaw) || 5))
      : undefined;
  const namespace = url.searchParams.get("namespace")?.trim() || undefined;
  const params = khoraSearchRequestFromGetQuery(
    { q, topK, neighbors, ...(maxNeighbors !== undefined ? { maxNeighbors } : {}), namespace },
    memories.namespaceRoot,
  );
  try {
    const readerPrincipalId = await optionalReaderDid(req, url, deps);
    const result = await executeKhoraMemoriesSearch({
      client: memories.client,
      store: memories.store,
      embeddingModel: memories.embeddingModel,
      namespaceRoot: memories.namespaceRoot,
      params,
      readerPrincipalId,
      social: deps.ctx.social,
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}
