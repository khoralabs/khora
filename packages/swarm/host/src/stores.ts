import type {
  DefaultEntityMap,
  ResolvedSource,
  SearchHit,
  SourceMap,
  SourceMapRef,
  Store,
} from "@cfd/memories-core";

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

/**
 * Minimal {@link SourceMap} for {@link Store.resolve} when only a {@link SourceMapRef} is available.
 */
export function minimalSourceMapForResolve(ref: SourceMapRef): SourceMap {
  return {
    memory_id: ref.memory_id,
    source_key: ref.source_key,
    _id: "",
    _ts_created: 0,
  } as SourceMap;
}

export async function resolveFromMemoriesStore<
  EntityMap extends Record<string, unknown> = DefaultEntityMap,
>(store: Store<EntityMap>, ref: SourceMapRef): Promise<ResolvedSource<EntityMap> | undefined> {
  try {
    return await store.resolve(minimalSourceMapForResolve(ref));
  } catch {
    return undefined;
  }
}
