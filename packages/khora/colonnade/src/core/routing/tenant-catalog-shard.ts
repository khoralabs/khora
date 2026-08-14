import { createHash } from "node:crypto";

/** Stable shard index for **`tenant_key`** in **`[0, shardCount)`**. */
export function catalogShardIndexForTenant(tenantKey: string, shardCount: number): number {
  if (shardCount < 1) {
    throw new Error("catalogShardIndexForTenant: shardCount must be >= 1");
  }
  const h = createHash("sha256").update(tenantKey, "utf8").digest();
  const n = h.readUInt32BE(0);
  return n % shardCount;
}
