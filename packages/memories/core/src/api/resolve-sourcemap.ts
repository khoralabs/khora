import type { TextFeatureExportRow } from "../persistence/row-schemas.js";
import type { SourceMap } from "../persistence/rows.js";

export type { SourceMap };

/** Subset of {@link SourceMap} sufficient for {@link Store.resolve} and wire interchange. */
export type SourceMapRef = Pick<SourceMap, "memory_id" | "source_key">;

/** Default entity map: any string domain with unknown payload (widest {@link Store} compatibility). */
export type DefaultEntityMap = Record<string, unknown>;

/** Literal JSON octets; the store does not parse — callers use {@link JSON.parse} if needed. */
export type ResolvedJsonSource = {
  kind: "json";
  /** UTF-8 JSON text or JSON octets. */
  body: string | Blob;
};

/** Parsed host entity row — storage must deserialize before returning this variant. */
export type ResolvedRecordSource<EntityMap extends Record<string, unknown> = DefaultEntityMap> = {
  [K in keyof EntityMap & string]: {
    kind: "record";
    domain: K;
    entityId: string;
    value: EntityMap[K];
  };
}[keyof EntityMap & string];

/** Resolved payload for a {@link SourceMap} from a {@link Store}. */
export type ResolvedSource<EntityMap extends Record<string, unknown> = DefaultEntityMap> =
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
    }
  | ResolvedJsonSource
  | ResolvedRecordSource<EntityMap>;

/**
 * JSON-serializable mirror of {@link ResolvedSource} for logs / JSONL / wire transfer.
 * `blob` is base64-encoded bytes, not a {@link Blob}.
 */
export type ResolvedSourceWire =
  | { kind: "string"; string: string }
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: string; mimeType?: string }
  | { kind: "json"; body: string }
  | { kind: "record"; domain: string; entityId: string; json: string };

/**
 * One line in a file-backed store (e.g. JSONL): {@link SourceMapRef} plus a {@link ResolvedSourceWire} body.
 */
export type ResolvedSourceMapLine = SourceMapRef & ResolvedSourceWire;

export interface Store<EntityMap extends Record<string, unknown> = DefaultEntityMap> {
  resolve(sourcemap: SourceMap): Promise<ResolvedSource<EntityMap>>;
  /**
   * When implemented (e.g. {@code JsonlStore}), called after {@link MemoriesClient.mergeMemory} to mirror
   * lexical rows keyed like {@link SourceMap} addresses into a file-backed store.
   */
  syncFromTextExportRows?(rows: readonly TextFeatureExportRow[]): void;
}

export async function resolveSourcemap<
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
>(sourcemap: SourceMap, store: Store<EntityMap>): Promise<ResolvedSource<EntityMap>> {
  return store.resolve(sourcemap);
}
