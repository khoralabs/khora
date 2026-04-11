import type { MemoriesVisualizationRuntimeCtx } from "../persistence/types";

/**
 * Concatenates all text chunks for a memory (source order), truncated for UI.
 * Returns `null` when the memory has no text features (e.g. vector-only).
 */
export function loadMemoryTextPreview(
  ctx: MemoriesVisualizationRuntimeCtx,
  namespace: string,
  key: string,
  maxChars = 8000,
): string | null {
  return ctx.persistence.loadMemoryTextPreview(namespace, key, maxChars);
}
