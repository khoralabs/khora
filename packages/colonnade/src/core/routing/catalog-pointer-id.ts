import { randomBytes } from "node:crypto";

const PREFIX = "cptr_";

/** Encodes catalog shard index (0..65535) into pointer ids for routing **`resolveCatalogPointer`**. */
export function encodeCatalogPointerId(shardIndex: number): string {
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex > 65535) {
    throw new Error(`encodeCatalogPointerId: shardIndex must be 0..65535, got ${shardIndex}`);
  }
  const hexShard = shardIndex.toString(16).padStart(4, "0");
  return `${PREFIX}${hexShard}_${randomBytes(16).toString("hex")}`;
}

/** Returns shard index from a `cptr_HHHH_…` id, or **`null`** if the id is not encoded. */
export function parseCatalogPointerShardIndex(catalogPointerId: string): number | null {
  if (!catalogPointerId.startsWith(PREFIX)) {
    return null;
  }
  const rest = catalogPointerId.slice(PREFIX.length);
  const underscore = rest.indexOf("_");
  if (underscore !== 4) {
    return null;
  }
  const shardHex = rest.slice(0, 4);
  const n = Number.parseInt(shardHex, 16);
  return Number.isFinite(n) && n >= 0 && n <= 65535 ? n : null;
}
