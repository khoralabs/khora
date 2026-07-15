import type { MemoriesPersistenceAsync } from "@khoralabs/memories-core";
import { MemoriesClientAsync } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { PostResolver } from "../ports";
import type { HostPersistenceClient } from "../runtime";
import { createKhoraMemoriesIndexer, type KhoraMemoriesIndexer } from "./indexer";
import { createKhoraCanonicalStore, type KhoraCanonicalStore } from "./khora-canonical-store";
import { khoraOntology } from "./khora-ontology";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config";

export type KhoraMemoriesHost = {
  client: MemoriesClientAsync<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  store: KhoraCanonicalStore;
  persistence: MemoriesPersistenceAsync;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: KhoraMemoriesIndexer;
  close(): void | Promise<void>;
};

export type BootstrapKhoraMemoriesOpts = {
  persistence: MemoriesPersistenceAsync;
  close: () => void | Promise<void>;
  persistenceClient: HostPersistenceClient;
  postResolver: PostResolver;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
  onEmbeddingFailure?: (input: { namespace: string; memoryKey: string; text: string }) => void;
};

export function bootstrapKhoraMemories(opts: BootstrapKhoraMemoriesOpts): KhoraMemoriesHost {
  const namespaceRoot = opts.namespaceRoot ?? DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT;
  const store = createKhoraCanonicalStore({
    persistence: opts.persistence,
    postResolver: opts.postResolver,
    persistenceClient: opts.persistenceClient,
  });
  const client = new MemoriesClientAsync(opts.persistence, khoraOntology, { store });
  const indexer = createKhoraMemoriesIndexer({
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
