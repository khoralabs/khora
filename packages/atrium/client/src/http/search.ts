import {
  type AtriumSearchQuery,
  type AtriumSearchRequest,
  type AtriumSearchResponse,
  zAtriumSearchResponse,
} from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export function searchGet(
  t: AtriumUnaryTransport,
  params: AtriumSearchQuery,
): Promise<AtriumSearchResponse> {
  const query: Record<string, string> = { q: params.q };
  if (params.topK !== undefined) query.topK = String(params.topK);
  if (params.neighbors === true) query.neighbors = "true";
  if (params.maxNeighbors !== undefined) query.maxNeighbors = String(params.maxNeighbors);
  if (params.namespace !== undefined && params.namespace.length > 0) {
    query.namespace = params.namespace;
  }
  return t.requestJson("GET", "/v1/search", { query, parse: zAtriumSearchResponse });
}

export function searchPost(
  t: AtriumUnaryTransport,
  body: AtriumSearchRequest,
): Promise<AtriumSearchResponse> {
  return t.requestJson("POST", "/v1/search", { body, parse: zAtriumSearchResponse });
}
