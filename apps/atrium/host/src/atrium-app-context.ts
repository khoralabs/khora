import type { Database } from "bun:sqlite";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";

/** Passed as `appContext` on {@link AgentRelay} for Atrium memory namespaces. */
export type AtriumHostAppContext = {
  db: Database;
  profileNamespace: string;
  postNamespace: string;
  probeNamespace: string;
  topicNamespace?: string;
  embeddingModel?: EmbeddingModel;
};
