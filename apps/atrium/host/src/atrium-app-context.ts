import type { Database } from "bun:sqlite";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";

/** Passed as {@link SwarmHostDeps.appContext} for Atrium SQLite routing and memory namespaces. */
export type AtriumHostAppContext = {
  db: Database;
  profileNamespace: string;
  postNamespace: string;
  probeNamespace: string;
  topicNamespace?: string;
  embeddingModel?: EmbeddingModel;
};
