/** Reserved `source_key` for the synthetic ontology / topology search chunk (FTS + optional vec). */
export const MEMORY_SEARCH_META_SOURCE_KEY = "__mem_search_meta__" as const;

/** True if this source key is system-reserved (UMAP exclusion, etc.). */
export function isSystemSearchMetaSourceKey(sourceKey: string): boolean {
  return sourceKey === MEMORY_SEARCH_META_SOURCE_KEY || sourceKey.startsWith("__");
}
