import type { SwarmHostSearchScope } from "@khoralabs/swarm-host";
import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zOntologyLabel = z.object({ kind: z.string() }).passthrough();

export const zMemorySearchHit = z.object({
  memory_key: z.string(),
  kind: z.enum(["node", "edge"]),
  score: z.number(),
  labels: z.array(zOntologyLabel),
  source_key: z.string(),
  edge: z
    .object({
      from_key: z.string(),
      to_key: z.string(),
      edge_label_kinds: z.array(z.string()),
    })
    .optional(),
  neighbors: z
    .array(
      z.object({
        memory_key: z.string(),
        labels: z.array(zOntologyLabel),
      }),
    )
    .optional(),
});

export const zMemoriesSearchResponse = z.array(zMemorySearchHit);

export type MemorySearchHitWire = z.infer<typeof zMemorySearchHit>;

export type MemoriesSearchParams = {
  query: string;
  scope: SwarmHostSearchScope;
  limit?: number;
  minScore?: number;
  searchScopeMode?: "pathSubtree" | "scopeDag" | "exactScope";
};

export function searchMemories(
  t: HttpTransport,
  params: MemoriesSearchParams,
): Promise<MemorySearchHitWire[]> {
  return t.requestJson("POST", "/v1/memories/search", {
    body: {
      query: params.query,
      scope: params.scope,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.minScore !== undefined ? { minScore: params.minScore } : {}),
      ...(params.searchScopeMode !== undefined ? { searchScopeMode: params.searchScopeMode } : {}),
    },
    parse: zMemoriesSearchResponse,
  });
}
