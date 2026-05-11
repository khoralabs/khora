import type { EmbeddingModel } from "@cfd/memories-core/helpers";

/** Passed as {@link SwarmHostDeps.appContext} for Atrium memory namespaces. */
export type AtriumHostAppContext = {
  profileNamespace: string;
  postNamespace: string;
  probeNamespace: string;
  topicNamespace?: string;
  embeddingModel?: EmbeddingModel;
};
