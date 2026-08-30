/**
 * Permanent host memories identity for the Khora host.
 * Used by the in-process memories-service stack.
 */
export const KHORA_HOST_MEMORIES_DATABASE_ID = {
  kind: "host",
  ownerKey: "khora",
} as const;

export type KhoraHostMemoriesDatabaseId = typeof KHORA_HOST_MEMORIES_DATABASE_ID;
