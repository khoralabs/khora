import { AuthError } from "@khoralabs/khora-auth";
import type { KhoraSearchRequest } from "@khoralabs/khora-contracts";
import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import { executeHostSearch, hostSearchRequestFromGetQuery } from "../..";
import type { HostRouteDeps } from "./deps";
import { authErrorResponse, jsonError } from "./responses";

async function optionalReaderDid(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<string | undefined> {
  try {
    const { did } = await deps.ctx.auth.requireAuthenticatedRequest(req, url, "", []);
    return did;
  } catch (e) {
    if (e instanceof AuthError) {
      return undefined;
    }
    throw e;
  }
}

export async function handleSearchPost(req: Request, deps: HostRouteDeps): Promise<Response> {
  const memories = deps.ctx.search;
  if (memories === undefined) {
    return jsonError(
      "Memories search is disabled (set KHORA_MEMORIES=1)",
      503,
      KHORA_ERROR_CODE.search_disabled,
    );
  }
  let body: KhoraSearchRequest;
  try {
    body = (await req.json()) as KhoraSearchRequest;
  } catch {
    return jsonError("Invalid JSON body", 400, KHORA_ERROR_CODE.invalid_request);
  }
  if (body.content === undefined) {
    return jsonError("content is required", 400, KHORA_ERROR_CODE.invalid_request);
  }
  let readerPrincipalId: string | undefined;
  try {
    readerPrincipalId = await optionalReaderDid(req, new URL(req.url), deps);
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const result = await executeHostSearch({
      client: memories.client,
      persistence: memories.persistence,
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
    return jsonError(msg, 500, KHORA_ERROR_CODE.internal_error);
  }
}

export async function handleSearchGet(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
): Promise<Response> {
  const memories = deps.ctx.search;
  if (memories === undefined) {
    return jsonError(
      "Memories search is disabled (set KHORA_MEMORIES=1)",
      503,
      KHORA_ERROR_CODE.search_disabled,
    );
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
  const params = hostSearchRequestFromGetQuery(
    { q, topK, neighbors, ...(maxNeighbors !== undefined ? { maxNeighbors } : {}), namespace },
    memories.namespaceRoot,
  );
  try {
    const readerPrincipalId = await optionalReaderDid(req, url, deps);
    const result = await executeHostSearch({
      client: memories.client,
      persistence: memories.persistence,
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
    return jsonError(msg, 500, KHORA_ERROR_CODE.internal_error);
  }
}
