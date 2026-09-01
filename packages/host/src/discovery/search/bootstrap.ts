import type { MemoriesPersistenceAsync } from "@khoralabs/memories-node";
import { MemoriesClientAsync } from "@khoralabs/memories-node";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { HostPersistenceClient } from "../../persistence/core/client";
import type { PostResolver } from "../../ports";
import { createHostSearchCanonicalStore, type HostSearchCanonicalStore } from "./canonical-store";
import { DEFAULT_HOST_SEARCH_NAMESPACE_ROOT } from "./config";
import { createHostSearchIndexer, type HostSearchIndexer } from "./indexer";
import { khoraOntology } from "./ontology";

export type HostSearch = {
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  store: HostSearchCanonicalStore;
  persistence: MemoriesPersistenceAsync;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: HostSearchIndexer;
  close(): void | Promise<void>;
};

export type BootstrapHostSearchOpts = {
  persistence: MemoriesPersistenceAsync;
  close: () => void | Promise<void>;
  persistenceClient: HostPersistenceClient;
  postResolver: PostResolver;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
  onEmbeddingFailure?: (input: {
    namespace: string;
    memoryKey: string;
    sourceKey: string;
    text: string;
  }) => void;
};

export function bootstrapHostSearch(opts: BootstrapHostSearchOpts): HostSearch {
  const namespaceRoot = opts.namespaceRoot ?? DEFAULT_HOST_SEARCH_NAMESPACE_ROOT;
  const store = createHostSearchCanonicalStore({
    persistence: opts.persistence,
    postResolver: opts.postResolver,
    persistenceClient: opts.persistenceClient,
  });
  const client = new MemoriesClientAsync(opts.persistence, khoraOntology, { store });
  const indexer = createHostSearchIndexer({
    client,
    persistence: opts.persistence,
    persistenceClient: opts.persistenceClient,
    embeddingModel: opts.embeddingModel,
    namespaceRoot,
    ...(opts.onEmbeddingFailure !== undefined
      ? { onEmbeddingFailure: opts.onEmbeddingFailure }
      : {}),
  });
  return {
    client,
    store,
    persistence: opts.persistence,
    embeddingModel: opts.embeddingModel,
    namespaceRoot,
    indexer,
    close: opts.close,
  };
}
