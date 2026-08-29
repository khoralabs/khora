import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import { embedTextChunks } from "@khoralabs/memories-node/helpers";
import { createPercolator, type Percolator } from "@khoralabs/percolator";
import type { PercolatorPersistence } from "@khoralabs/percolator/persistence";

export type HostSubscriptions = {
  percolator: Percolator;
};

export function bootstrapHostSubscriptions(deps: {
  persistence: PercolatorPersistence;
  embeddingModel?: EmbeddingModel;
}): HostSubscriptions {
  const embeddingModel = deps.embeddingModel;
  let embedText: ((text: string) => Promise<number[]>) | undefined;

  if (embeddingModel === undefined) {
    embedText = undefined;
  } else {
    embedText = async (text: string): Promise<number[]> => {
      const vectors = await embedTextChunks(embeddingModel, [text]);
      return vectors[0] ?? [];
    };
  }
  return {
    percolator: createPercolator({ persistence: deps.persistence, embedText }),
  };
}
