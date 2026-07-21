import type {
  KhoraSearchOriginal,
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
  PrincipalId,
} from "@khoralabs/khora-contracts";
import type {
  MemoriesClientAsync,
  MemoriesPersistenceAsync,
  SearchParams,
} from "@khoralabs/memories-node";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import { embedTextChunks } from "@khoralabs/memories-node/helpers";
import { authorPrincipalIdFromPostId } from "../post-address-id";
import { canReadPost } from "../post-visibility";
import type { SocialRelationshipPersistence } from "../runtime";
import {
  hydrateMemoryLabels,
  type KhoraCanonicalStore,
  purgeOrphanMemory,
} from "./khora-canonical-store";
import type { khoraOntology } from "./khora-ontology";

export type {
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
} from "@khoralabs/khora-contracts";

export async function executeKhoraMemoriesSearch(deps: {
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  persistence: MemoriesPersistenceAsync;
  store: KhoraCanonicalStore;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  params: KhoraSearchRequest;
  readerPrincipalId?: PrincipalId;
  social?: SocialRelationshipPersistence;
}): Promise<KhoraSearchResponse> {
  const {
    client,
    persistence,
    store,
    embeddingModel,
    namespaceRoot,
    params,
    readerPrincipalId,
    social,
  } = deps;
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

  const { hits } = await client.search(searchParams as Parameters<typeof client.search>[0]);
  const enriched: KhoraSearchResponse["hits"] = [];
  for (const hit of hits) {
    const hydrated = await hydrateMemoryLabels(store, hit.labels, hit.memory._id, hit.source_key);
    if (hydrated?.kind === "ghost" || hydrated?.kind === "orphan") {
      await purgeOrphanMemory(client, persistence, hit.memory._id);
      continue;
    }
    if (
      social !== undefined &&
      hydrated !== undefined &&
      (hydrated.kind === "post" || hydrated.kind === "subscription") &&
      !canReadPost({ post: hydrated.entity, readerPrincipalId, social })
    ) {
      continue;
    }

    let original: KhoraSearchResponse["hits"][number]["original"];
    if (hydrated !== undefined) {
      if (hydrated.kind === "post" || hydrated.kind === "subscription") {
        const authorDid = authorPrincipalIdFromPostId(hydrated.entity.id) ?? "";
        original = { kind: hydrated.kind, post: hydrated.entity, authorDid };
      } else if (hydrated.kind === "profile") {
        original = { kind: "profile", entity: hydrated.entity };
      }
    }

    const neighbors = hit.neighbors
      ? (
          await Promise.all(
            hit.neighbors.map(async (n) => {
              const neighborHydrated = await hydrateMemoryLabels(store, n.labels, n._id, undefined);
              if (neighborHydrated?.kind === "ghost" || neighborHydrated?.kind === "orphan") {
                await purgeOrphanMemory(client, persistence, n._id);
                return undefined;
              }
              if (
                social !== undefined &&
                neighborHydrated !== undefined &&
                (neighborHydrated.kind === "post" || neighborHydrated.kind === "subscription") &&
                !canReadPost({ post: neighborHydrated.entity, readerPrincipalId, social })
              ) {
                return undefined;
              }
              let neighborOriginal: KhoraSearchOriginal | undefined;
              if (neighborHydrated !== undefined) {
                if (neighborHydrated.kind === "post" || neighborHydrated.kind === "subscription") {
                  const authorDid = authorPrincipalIdFromPostId(neighborHydrated.entity.id) ?? "";
                  neighborOriginal = {
                    kind: neighborHydrated.kind,
                    post: neighborHydrated.entity,
                    authorDid,
                  };
                } else if (neighborHydrated.kind === "profile") {
                  neighborOriginal = { kind: "profile", entity: neighborHydrated.entity };
                }
              }
              return { ...n, original: neighborOriginal };
            }),
          )
        ).filter((n): n is NonNullable<typeof n> => n !== undefined)
      : undefined;

    enriched.push({
      ...hit,
      sourceKey: hit.source_key,
      original,
      neighbors,
    } as KhoraSearchResponse["hits"][number]);
  }
  return { hits: enriched };
}

export function khoraSearchRequestFromGetQuery(
  query: KhoraSearchQuery,
  namespaceRoot: string,
): KhoraSearchRequest {
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
