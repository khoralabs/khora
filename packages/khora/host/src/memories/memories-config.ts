import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";

export const DEFAULT_KHORA_MEMORIES_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapOpts = {
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
};
