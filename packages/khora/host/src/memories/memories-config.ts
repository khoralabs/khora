export const DEFAULT_ATRIUM_MEMORIES_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapOpts = {
  embeddingModel?: import("@khoralabs/memories-core/helpers").EmbeddingModel;
  namespaceRoot?: string;
};
