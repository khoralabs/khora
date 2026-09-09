import type { Database } from "bun:sqlite";
import type { MemoriesPersistenceAsync } from "@khoralabs/memories-node";
import { MemoriesClientAsync } from "@khoralabs/memories-node";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { HostPersistenceClient } from "../../persistence/core/client";
import type { PostResolver } from "../../ports";
import { createHostSearchCanonicalStore, type HostSearchCanonicalStore } from "./canonical-store";
import { DEFAULT_HOST_SEARCH_NAMESPACE_ROOT } from "./config";
import { createHostSearchIndexer, type HostSearchIndexer } from "./indexer";
import { khoraOntology } from "./ontology";
import {
  createSqliteOperatorPostFeedReader,
  type OperatorPostFeedReader,
} from "./operator-post-feed";

export type HostSearch = {
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  store: HostSearchCanonicalStore;
  persistence: MemoriesPersistenceAsync;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: HostSearchIndexer;
  /** Present when {@link BootstrapHostSearchOpts.memoriesDb} was provided. */
  operatorPostFeed?: OperatorPostFeedReader;
  close(): void | Promise<void>;
};

export type BootstrapHostSearchOpts = {
  persistence: MemoriesPersistenceAsync;
  close: () => void | Promise<void>;
  persistenceClient: HostPersistenceClient;
  postResolver: PostResolver;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
  /** When set, enables the operator chronological post feed reader. */
  memoriesDb?: Database;
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
  const operatorPostFeed =
    opts.memoriesDb !== undefined
      ? createSqliteOperatorPostFeedReader({
          db: opts.memoriesDb,
          postResolver: opts.postResolver,
          namespaceRoot,
          profileIdForPrincipal: (principalId) =>
            opts.persistenceClient.profileIdForPrincipal(principalId),
        })
      : undefined;
  return {
    client,
    store,
    persistence: opts.persistence,
    embeddingModel: opts.embeddingModel,
    namespaceRoot,
    indexer,
    ...(operatorPostFeed !== undefined ? { operatorPostFeed } : {}),
    close: opts.close,
  };
}
