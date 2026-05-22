import type { AgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import { MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import type { PostResolver } from "../ports.ts";
import { type AtriumCanonicalStore, createAtriumCanonicalStore } from "./atrium-canonical-store.ts";
import { atriumOntology } from "./atrium-ontology.ts";
import { type AtriumMemoriesIndexer, createAtriumMemoriesIndexer } from "./indexer.ts";
import { DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT } from "./memories-config.ts";

export type AtriumMemoriesHost = {
  client: MemoriesClient<typeof atriumOntology.nodeLabels, typeof atriumOntology.edgeLabels>;
  store: AtriumCanonicalStore;
  persistence: MemoriesPersistence;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: AtriumMemoriesIndexer;
  close(): void;
};

export type BootstrapAtriumMemoriesOpts = {
  persistence: MemoriesPersistence;
  close: () => void;
  persistenceClient: AgentRelayPersistenceClient;
  postResolver: PostResolver;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
};

export function bootstrapAtriumMemories(opts: BootstrapAtriumMemoriesOpts): AtriumMemoriesHost {
  const namespaceRoot = opts.namespaceRoot ?? DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
  const store = createAtriumCanonicalStore({
    persistence: opts.persistence,
    postResolver: opts.postResolver,
    persistenceClient: opts.persistenceClient,
  });
  const client = new MemoriesClient(opts.persistence, atriumOntology, { store });
  const indexer = createAtriumMemoriesIndexer({
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
