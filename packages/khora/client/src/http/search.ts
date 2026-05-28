import {
  type KhoraSearchQuery,
  type KhoraSearchRequest,
  type KhoraSearchResponse,
  zKhoraSearchResponse,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export function searchGet(
  t: KhoraUnaryTransport,
  params: KhoraSearchQuery,
): Promise<KhoraSearchResponse> {
  const query: Record<string, string> = { q: params.q };
  if (params.topK !== undefined) query.topK = String(params.topK);
  if (params.neighbors === true) query.neighbors = "true";
  if (params.maxNeighbors !== undefined) query.maxNeighbors = String(params.maxNeighbors);
  if (params.namespace !== undefined && params.namespace.length > 0) {
    query.namespace = params.namespace;
  }
  return t.requestJson("GET", "/v1/search", { query, parse: zKhoraSearchResponse });
}

export function searchPost(
  t: KhoraUnaryTransport,
  body: KhoraSearchRequest,
): Promise<KhoraSearchResponse> {
  return t.requestJson("POST", "/v1/search", { body, parse: zKhoraSearchResponse });
}
