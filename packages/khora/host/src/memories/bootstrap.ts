import type { AgentRelayPersistenceClient } from "@khoralabs/host-runtime";
import { MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import type { PostResolver } from "../ports";
import { createKhoraMemoriesIndexer, type KhoraMemoriesIndexer } from "./indexer";
import { createKhoraCanonicalStore, type KhoraCanonicalStore } from "./khora-canonical-store";
import { khoraOntology } from "./khora-ontology";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config";

export type KhoraMemoriesHost = {
  client: MemoriesClient<typeof khoraOntology.nodeLabels, typeof khoraOntology.edgeLabels>;
  store: KhoraCanonicalStore;
  persistence: MemoriesPersistence;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: KhoraMemoriesIndexer;
  close(): void;
};

export type BootstrapKhoraMemoriesOpts = {
  persistence: MemoriesPersistence;
  close: () => void;
  persistenceClient: AgentRelayPersistenceClient;
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
  const client = new MemoriesClient(opts.persistence, khoraOntology, { store });
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
