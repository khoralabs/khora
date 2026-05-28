import type { AgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import { MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import type { PostResolver } from "../ports.ts";
import { createKhoraMemoriesIndexer, type KhoraMemoriesIndexer } from "./indexer.ts";
import { createKhoraCanonicalStore, type KhoraCanonicalStore } from "./khora-canonical-store.ts";
import { khoraOntology } from "./khora-ontology.ts";
import { DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT } from "./memories-config.ts";

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
