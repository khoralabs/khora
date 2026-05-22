import {
  type AtriumSearchRequest,
  atriumSearchRequestFromGetQuery,
  executeAtriumMemoriesSearch,
} from "@khoralabs/atrium-host";
import type { HostRouteDeps } from "./deps.ts";
import { jsonError } from "./responses.ts";

export async function handleSearchPost(req: Request, deps: HostRouteDeps): Promise<Response> {
  const memories = deps.ctx.memories;
  if (memories === undefined) {
    return jsonError("Memories search is not configured (set ATRIUM_MEMORIES_DB_PATH)", 503);
  }
  let body: AtriumSearchRequest;
  try {
    body = (await req.json()) as AtriumSearchRequest;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (body.content === undefined) {
    return jsonError("content is required", 400);
  }
  try {
    const result = await executeAtriumMemoriesSearch({
      client: memories.client,
      store: memories.store,
      embeddingModel: memories.embeddingModel,
      namespaceRoot: memories.namespaceRoot,
      params: body,
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}

export async function handleSearchGet(url: URL, deps: HostRouteDeps): Promise<Response> {
  const memories = deps.ctx.memories;
  if (memories === undefined) {
    return jsonError("Memories search is not configured (set ATRIUM_MEMORIES_DB_PATH)", 503);
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
  const params = atriumSearchRequestFromGetQuery(
    { q, topK, neighbors, ...(maxNeighbors !== undefined ? { maxNeighbors } : {}), namespace },
    memories.namespaceRoot,
  );
  try {
    const result = await executeAtriumMemoriesSearch({
      client: memories.client,
      store: memories.store,
      embeddingModel: memories.embeddingModel,
      namespaceRoot: memories.namespaceRoot,
      params,
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError(msg, 500);
  }
}
