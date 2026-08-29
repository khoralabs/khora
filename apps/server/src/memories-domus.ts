/**
 * Permanent Domus memories identity for the Khora host.
 * Used by the in-process memories-service stack and the admin graph client.
 */
export const KHORA_DOMUS_MEMORIES_DATABASE_ID = {
  kind: "host",
  ownerKey: "khora",
} as const;

export type KhoraDomusMemoriesDatabaseId = typeof KHORA_DOMUS_MEMORIES_DATABASE_ID;
