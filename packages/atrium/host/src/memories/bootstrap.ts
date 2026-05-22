import type { Database } from "bun:sqlite";
import type { AgentRelayPersistenceClient } from "@khoralabs/agent-relay";
import type { SqliteColonnadeCluster } from "@khoralabs/colonnade-persistence";
import { MemoriesClient } from "@khoralabs/memories-core";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { MemoriesPersistence } from "@khoralabs/memories-core/persistence";
import { type AtriumCanonicalStore, createAtriumCanonicalStore } from "./atrium-canonical-store.ts";
import { atriumOntology } from "./atrium-ontology.ts";
import { type AtriumMemoriesIndexer, createAtriumMemoriesIndexer } from "./indexer.ts";
import {
  type AtriumMemoriesConfig,
  DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT,
} from "./memories-config.ts";
import { openAtriumMemoriesDb } from "./open-atrium-memories-db.ts";

export type AtriumMemoriesHost = {
  client: MemoriesClient<typeof atriumOntology.nodeLabels, typeof atriumOntology.edgeLabels>;
  store: AtriumCanonicalStore;
  persistence: MemoriesPersistence;
  embeddingModel?: EmbeddingModel;
  namespaceRoot: string;
  indexer: AtriumMemoriesIndexer;
  db: Database;
  close(): void;
};

export function bootstrapAtriumMemories(
  config: AtriumMemoriesConfig & {
    cluster: SqliteColonnadeCluster;
    persistenceClient: AgentRelayPersistenceClient;
  },
): AtriumMemoriesHost {
  const namespaceRoot = config.namespaceRoot ?? DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT;
  const { db, persistence } = openAtriumMemoriesDb(config.dbPath);
  const store = createAtriumCanonicalStore({
    persistence,
    cluster: config.cluster,
    persistenceClient: config.persistenceClient,
  });
  const client = new MemoriesClient(persistence, atriumOntology, { store });
  const indexer = createAtriumMemoriesIndexer({
    client,
    persistence,
    persistenceClient: config.persistenceClient,
    embeddingModel: config.embeddingModel,
    namespaceRoot,
  });
  return {
    client,
    store,
    persistence,
    embeddingModel: config.embeddingModel,
    namespaceRoot,
    indexer,
    db,
    close() {
      db.close();
    },
  };
}
