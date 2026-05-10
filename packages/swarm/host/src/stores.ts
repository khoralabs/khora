import type { ResolvedSource, SearchHit, SourceMapRef, Store } from "@cfd/memories-core";

/**
 * Maps a memory record address (same as {@link Store.resolve}) to app persistence—typed entity,
 * raw {@link ResolvedSource}, or any handle the app defines.
 */
export type SwarmEntityResolver<TPersistence> = {
  resolve(ref: SourceMapRef): Promise<TPersistence | undefined>;
};

/** Per-aggregate resolvers; each may target different persistence shapes. */
export type SwarmHostStores<TProfile, TPost, TTopic> = {
  profile?: SwarmEntityResolver<TProfile>;
  post?: SwarmEntityResolver<TPost>;
  topic?: SwarmEntityResolver<TTopic>;
};

/** Narrow a lexical search hit to the source-map address used by {@link Store.resolve}. */
export function searchHitToSourceMapRef(
  hit: Pick<SearchHit, "memory_id" | "source_key">,
): SourceMapRef {
  return { memory_id: hit.memory_id, source_key: hit.source_key };
}

export async function resolveFromMemoriesStore(
  store: Store,
  ref: SourceMapRef,
): Promise<ResolvedSource | undefined> {
  try {
    return await store.resolve(ref as Parameters<Store["resolve"]>[0]);
  } catch {
    return undefined;
  }
}

/** Parse JSON from a string or UTF-8 blob body; returns undefined on failure. */
export async function parseJsonEntity<T>(resolved: ResolvedSource): Promise<T | undefined> {
  try {
    let raw: string;
    if (resolved.kind === "string") {
      raw = resolved.string;
    } else if (resolved.kind === "blob") {
      raw = await resolved.blob.text();
    } else {
      return undefined;
    }
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
