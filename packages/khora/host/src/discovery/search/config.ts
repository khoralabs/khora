import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";

export const DEFAULT_HOST_SEARCH_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapOpts = {
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
};
