import type { Store } from "@khoralabs/memories-core";
import type { DefaultEntityMap } from "@khoralabs/sourcemaps";
import type { SourceMap } from "@khoralabs/memories-core/persistence";
import type { FunctionReference } from "convex/server";

type RunQuery = (ref: unknown, args: Record<string, unknown>) => Promise<unknown>;

/**
 * {@link Store} backed by Convex `text_features` (lexical) via the component query
 * `getLexicalTextForMemorySource`. Same role as {@link JsonlStore} from `@khoralabs/memories-stores`,
 * but for data living in the Convex component.
 */
export function createConvexLexicalTextStore(
  runQuery: RunQuery,
  getLexicalTextForMemorySource: FunctionReference<
    "query",
    "internal",
    { memoryId: string; sourceKey: string },
    string | null
  >,
): Store<DefaultEntityMap> {
  return {
    async resolve(sourcemap: SourceMap) {
      const text = (await runQuery(getLexicalTextForMemorySource, {
        memoryId: sourcemap.memory_id,
        sourceKey: sourcemap.source_key,
      })) as string | null;
      if (text == null) {
        throw new Error(
          `ConvexLexicalTextStore: no lexical text for memory_id=${sourcemap.memory_id} source_key=${sourcemap.source_key}`,
        );
      }
      return { kind: "string", string: text };
    },
  };
}
