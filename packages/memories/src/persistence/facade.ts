import type { MemoriesPersistence, MemoryOpContext } from "./types";

/** Canonical multiline text derived from stored graph state (node labels + incident edges). */
export function buildCanonicalMemorySearchMetaText(
  persistence: MemoriesPersistence,
  op: MemoryOpContext,
  namespace: string,
  memoryKey: string,
): string {
  return persistence.buildCanonicalMemorySearchMetaText(op, namespace, memoryKey);
}

/** Replace vector rows for the search-meta chunk only (lexical/meta must exist). */
export function upsertMemorySearchMetaVector(
  persistence: MemoriesPersistence,
  op: MemoryOpContext,
  input: { namespace: string; memoryKey: string; vector: Float32Array },
): void {
  persistence.upsertMemorySearchMetaVector(op, input);
}
