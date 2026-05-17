import { createHash } from "node:crypto";

/** Pool shard logical id (`colonnade-shard-{index}`). */
export function poolShardCellId(shardIndex: number): string {
  return `colonnade-shard-${shardIndex}`;
}

/** Stable shard index for **`principal_id`** in **`[0, cellCount)`** (no catalog persistence). */
export function stablePrincipalShardIndex(principalId: string, cellCount: number): number {
  if (cellCount < 1) {
    throw new Error("stablePrincipalShardIndex: cellCount must be >= 1");
  }
  const h = createHash("sha256").update(principalId, "utf8").digest();
  const n = h.readUInt32BE(0);
  return n % cellCount;
}

/** Deterministic home cell for pool mode (pure function of principal + topology). */
export function derivePoolHomeCell(principalId: string, cellCount: number): string {
  return poolShardCellId(stablePrincipalShardIndex(principalId, cellCount));
}

/** Deterministic filesystem-safe cell id for per-principal isolation. */
export function perPrincipalCellId(principalId: string): string {
  const h = createHash("sha256").update(principalId, "utf8").digest("hex");
  return `colonnade-p-${h}`;
}

/** Filename stem for `cellsDirectory/<stem>.sqlite` (logical ids are already safe). */
export function cellDbFilenameStem(cellId: string): string {
  return cellId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}
