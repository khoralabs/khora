import type { Database } from "bun:sqlite";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import { createPercolator, type Percolator } from "@khoralabs/percolator";
import { createPercolatorSqlitePersistence } from "@khoralabs/percolator-sqlite";

export type AtriumPercolatorHost = {
  percolator: Percolator;
};

export function bootstrapAtriumPercolator(deps: {
  catalogDb: Database;
  embeddingModel?: EmbeddingModel;
}): AtriumPercolatorHost {
  const persistence = createPercolatorSqlitePersistence(deps.catalogDb);
  const embedText =
    deps.embeddingModel !== undefined
      ? async (text: string): Promise<number[]> => {
          const vectors = await embedTextChunks(deps.embeddingModel as EmbeddingModel, [text]);
          return vectors[0] ?? [];
        }
      : undefined;
  return {
    percolator: createPercolator({ persistence, embedText }),
  };
}
