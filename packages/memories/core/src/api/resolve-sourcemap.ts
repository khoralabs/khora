import type { SourceMap } from "../persistence/rows.js";

/** Subset of {@link SourceMap} sufficient for {@link Store.resolve} and wire interchange. */
export type SourceMapRef = Pick<SourceMap, "memory_id" | "source_key">;

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

/**
 * JSON-serializable mirror of {@link ResolvedSource}: `blob` is base64-encoded bytes, not a {@link Blob}.
 */
export type ResolvedSourceWire =
  | { kind: "string"; string: string }
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: string; mimeType?: string };

/**
 * One line in a file-backed store (e.g. JSONL): {@link SourceMapRef} plus a {@link ResolvedSourceWire} body.
 */
export type ResolvedSourceMapLine = SourceMapRef & ResolvedSourceWire;

export interface Store {
  resolve(sourcemap: SourceMap): Promise<ResolvedSource>;
}

export async function resolveSourcemap(
  sourcemap: SourceMap,
  store: Store,
): Promise<ResolvedSource> {
  return store.resolve(sourcemap);
}
