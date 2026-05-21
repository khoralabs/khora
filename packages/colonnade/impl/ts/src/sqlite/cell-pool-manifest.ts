import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_FILENAME = ".colonnade-pool.json";

export type CellPoolManifest = {
  readonly cell_pool_count: number;
  readonly written_at_ms: number;
};

export function cellPoolManifestPath(cellsDirectory: string): string {
  return join(cellsDirectory, MANIFEST_FILENAME);
}

/** Pin `cellPoolCount` to `cellsDirectory`; throw if an existing manifest disagrees. */
export function ensureCellPoolManifest(cellsDirectory: string, cellPoolCount: number): void {
  if (!Number.isInteger(cellPoolCount) || cellPoolCount < 1) {
    throw new Error(
      `Colonnade: cell_pool_count must be a positive integer (got ${String(cellPoolCount)})`,
    );
  }
  const path = cellPoolManifestPath(cellsDirectory);
  if (!existsSync(path)) {
    const manifest: CellPoolManifest = {
      cell_pool_count: cellPoolCount,
      written_at_ms: Date.now(),
    };
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Colonnade: invalid ${MANIFEST_FILENAME} at ${path}: ${msg}`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("cell_pool_count" in parsed) ||
    typeof (parsed as CellPoolManifest).cell_pool_count !== "number"
  ) {
    throw new Error(`Colonnade: invalid ${MANIFEST_FILENAME} shape at ${path}`);
  }
  const stored = (parsed as CellPoolManifest).cell_pool_count;
  if (stored !== cellPoolCount) {
    throw new Error(
      `Colonnade: cell_pool_count mismatch — configured ${cellPoolCount}, manifest ${stored} at ${path}. ` +
        `Use a new ATRIUM_CELLS_DIR or restore the original pool size.`,
    );
  }
}
