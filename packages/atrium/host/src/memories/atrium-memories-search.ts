import type {
  AtriumSearchQuery,
  AtriumSearchRequest,
  AtriumSearchResponse,
} from "@khoralabs/atrium-contracts";
import type { MemoriesClient, SearchParams } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import { type AtriumCanonicalStore, hydrateMemoryLabels } from "./atrium-canonical-store.ts";
import type { atriumOntology } from "./atrium-ontology.ts";

export type {
  AtriumSearchQuery,
  AtriumSearchRequest,
  AtriumSearchResponse,
} from "@khoralabs/atrium-contracts";

export async function executeAtriumMemoriesSearch(deps: {
  client: MemoriesClient<typeof atriumOntology.nodeLabels, typeof atriumOntology.edgeLabels>;
  store: AtriumCanonicalStore;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  params: AtriumSearchRequest;
}): Promise<AtriumSearchResponse> {
  const { client, store, embeddingModel, namespaceRoot, params } = deps;
  let content: SearchParams["content"];
  if (params.content.vector !== undefined && params.content.vector.length > 0) {
    content =
      params.content.text !== undefined && params.content.text.length > 0
        ? { text: params.content.text, vector: params.content.vector }
        : { vector: params.content.vector };
  } else if (params.content.text !== undefined && params.content.text.trim().length > 0) {
    const text = params.content.text.trim();
    if (embeddingModel !== undefined) {
      const vectors = await embedTextChunks(embeddingModel, [text]);
      const vector = vectors[0];
      content = vector !== undefined && vector.length > 0 ? { text, vector } : { text };
    } else {
      content = { text };
    }
  } else {
    return { hits: [] };
  }

  const searchParams = {
    ...(params.additionalNamespaces !== undefined
      ? { additionalNamespaces: params.additionalNamespaces }
      : {}),
    ...(params.searchEntireDatabase !== undefined
      ? { searchEntireDatabase: params.searchEntireDatabase }
      : {}),
    ...(params.asOfTimestampMs !== undefined ? { asOfTimestampMs: params.asOfTimestampMs } : {}),
    ...(params.options !== undefined ? { options: params.options } : {}),
    namespace: params.namespace ?? namespaceRoot,
    searchScopeMode: params.searchScopeMode ?? "pathSubtree",
    content,
  } satisfies SearchParams;

  const hits = client.search(searchParams as Parameters<typeof client.search>[0]);
  const enriched: AtriumSearchResponse["hits"] = [];
  for (const hit of hits) {
    const hydrated = await hydrateMemoryLabels(store, hit.labels, hit.memory._id, hit.source_key);
    const neighbors = hit.neighbors
      ? await Promise.all(
          hit.neighbors.map(async (n) => ({
            ...n,
            hydrated: await hydrateMemoryLabels(store, n.labels, n._id, undefined),
          })),
        )
      : undefined;
    enriched.push({ ...hit, hydrated, neighbors } as AtriumSearchResponse["hits"][number]);
  }
  return { hits: enriched };
}

export function atriumSearchRequestFromGetQuery(
  query: AtriumSearchQuery,
  namespaceRoot: string,
): AtriumSearchRequest {
  return {
    namespace: query.namespace ?? namespaceRoot,
    content: { text: query.q },
    options: {
      topK: query.topK ?? 10,
      neighbors: query.neighbors ?? false,
      ...(query.maxNeighbors !== undefined ? { maxNeighbors: query.maxNeighbors } : {}),
    },
  };
}
