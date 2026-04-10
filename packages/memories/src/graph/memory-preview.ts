import type { MutationCtx } from "../api/merge-memory";

/**
 * Concatenates all text chunks for a memory (source order), truncated for UI.
 * Returns `null` when the memory has no text features (e.g. vector-only).
 */
export function loadMemoryTextPreview(
  ctx: MutationCtx,
  namespace: string,
  key: string,
  maxChars = 8000,
): string | null {
  const rows = ctx.db
    .query<{ text: string }, [string, string]>(
      `SELECT tf.text AS text
       FROM text_features tf
       JOIN memories m ON m._id = tf.memory_id
       WHERE m.namespace = ? AND m.key = ?
       ORDER BY tf._ts_created ASC, tf._id ASC`,
    )
    .all(namespace, key);
  if (rows.length === 0) return null;
  const joined = rows.map((r) => r.text).join("\n\n");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars - 1)}…`;
}
