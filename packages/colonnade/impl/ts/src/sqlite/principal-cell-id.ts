import { createHash } from "node:crypto";

/** Pool shard logical id (`colonnade-shard-{index}`). */
export function poolShardCellId(shardIndex: number): string {
  return `colonnade-shard-${shardIndex}`;
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
