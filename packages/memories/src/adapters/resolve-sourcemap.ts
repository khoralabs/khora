import type { SourceMap } from "../db/schema";

/** Resolved payload for a {@link SourceMap} from a {@link Store}. */
export type ResolvedSource =
  | {
      kind: "blob";
      blob: Blob;
    }
  | {
      kind: "string";
      string: string;
    }
  | {
      kind: "url";
      url: string;
    };

export interface Store {
  resolve(sourcemap: SourceMap): Promise<ResolvedSource>;
}

export async function resolveSourcemap(sourcemap: SourceMap, store: Store): Promise<ResolvedSource> {
  return store.resolve(sourcemap);
}
