import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import {
  createPercolator,
  type Percolator,
  type PercolatorPersistence,
} from "@khoralabs/percolator";

export type KhoraPercolatorHost = {
  percolator: Percolator;
};

export function bootstrapKhoraPercolator(deps: {
  persistence: PercolatorPersistence;
  embeddingModel?: EmbeddingModel;
}): KhoraPercolatorHost {
  const embedText =
    deps.embeddingModel !== undefined
      ? async (text: string): Promise<number[]> => {
          const vectors = await embedTextChunks(deps.embeddingModel as EmbeddingModel, [text]);
          return vectors[0] ?? [];
        }
      : undefined;
  return {
    percolator: createPercolator({ persistence: deps.persistence, embedText }),
  };
}
