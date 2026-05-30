import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type CellPoolManifest,
  cellPoolManifestPath,
  ensureCellPoolManifest,
} from "./cell-pool-manifest";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function tempCellsDir(): string {
  const d = mkdtempSync(join(tmpdir(), "colonnade-pool-manifest-"));
  dirs.push(d);
  return d;
}

describe("ensureCellPoolManifest", () => {
  test("writes manifest on first run", () => {
    const cellsDir = tempCellsDir();
    ensureCellPoolManifest(cellsDir, 16);
    const path = cellPoolManifestPath(cellsDir);
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CellPoolManifest;
    expect(parsed.cell_pool_count).toBe(16);
    expect(typeof parsed.written_at_ms).toBe("number");
  });

  test("accepts matching manifest on subsequent runs", () => {
    const cellsDir = tempCellsDir();
    ensureCellPoolManifest(cellsDir, 8);
    expect(() => ensureCellPoolManifest(cellsDir, 8)).not.toThrow();
  });

  test("throws on pool count mismatch", () => {
    const cellsDir = tempCellsDir();
    ensureCellPoolManifest(cellsDir, 16);
    expect(() => ensureCellPoolManifest(cellsDir, 32)).toThrow(/cell_pool_count mismatch/);
  });

  test("throws on invalid manifest shape", () => {
    const cellsDir = tempCellsDir();
    writeFileSync(cellPoolManifestPath(cellsDir), '{"wrong":true}\n', "utf8");
    expect(() => ensureCellPoolManifest(cellsDir, 16)).toThrow(/invalid.*shape/);
  });

  test("throws on invalid pool count argument", () => {
    const cellsDir = tempCellsDir();
    expect(() => ensureCellPoolManifest(cellsDir, 0)).toThrow(/positive integer/);
  });
});
