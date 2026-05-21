/** Lowercase SHA-256 hex, 64 chars. */
export type ContentHash = string;

/**
 * Address linking a derived artifact back to resolvable original content.
 * Locators are domain-specific; must not include projection/search payload fields.
 */
export type SourceRef<Locators extends object = object> = Locators;

/** Ref with mandatory content address for verify-on-read / provenance paths. */
export type ContentAddressedRef<Locators extends object = object> = SourceRef<Locators> & {
  readonly content_hash: ContentHash;
};

export function isContentAddressedRef<Locators extends object>(
  ref: SourceRef<Locators>,
): ref is ContentAddressedRef<Locators> {
  return typeof (ref as ContentAddressedRef<Locators>).content_hash === "string";
}

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
    entity_id: string;
    value: EntityMap[K];
  };
}[keyof EntityMap & string];

/** Resolved payload from a {@link Store}. */
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
  | { kind: "blob"; blob: string; mime_type?: string }
  | { kind: "json"; body: string }
  | { kind: "record"; domain: string; entity_id: string; json: string };

export interface Store<
  Ref extends SourceRef = SourceRef,
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
> {
  resolve(ref: Ref): Promise<ResolvedSource<EntityMap>>;
}

/** Store whose refs always carry `content_hash` (verify-on-read, strict provenance). */
export interface ContentAddressedStore<
  Ref extends ContentAddressedRef = ContentAddressedRef,
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
> extends Store<Ref, EntityMap> {}

export async function resolveSourcemap<
  Ref extends SourceRef,
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
>(ref: Ref, store: Store<Ref, EntityMap>): Promise<ResolvedSource<EntityMap>>;
export async function resolveSourcemap<
  Ref extends ContentAddressedRef,
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
>(ref: Ref, store: ContentAddressedStore<Ref, EntityMap>): Promise<ResolvedSource<EntityMap>>;
export async function resolveSourcemap(
  ref: SourceRef,
  store: Store<SourceRef, DefaultEntityMap>,
): Promise<ResolvedSource> {
  return store.resolve(ref);
}
