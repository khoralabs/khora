import path from "node:path";

/** Relative paths under `KHORA_DATA_DIR` (default layout). */
export const KHORA_PERSISTENCE_REL = {
  catalog: "khora-catalog.sqlite",
  frames: "khora-frames.sqlite",
  cellsDir: "cells",
  memories: "khora-memories.sqlite",
} as const;

export const DEFAULT_KHORA_DATA_DIR = "./data";

export type KhoraPersistencePaths = {
  dataDir: string;
  catalogPath: string;
  framesDbPath: string;
  cellsDir: string;
  memoriesDbPath: string;
};

function trimEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v !== undefined && v.length > 0 ? v : undefined;
}

function resolvePath(cwd: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

/**
 * Resolve host persistence paths from env.
 * Primary: `KHORA_DATA_DIR` (defaults to `./data` when unset).
 * Per-component overrides: `KHORA_CATALOG_PATH`, `KHORA_FRAMES_DB_PATH`, `KHORA_CELLS_DIR`, `KHORA_MEMORIES_DB_PATH`.
 * Legacy: if `KHORA_DATA_DIR` is explicitly empty and all three colonnade paths are set, use those only.
 */
export function resolveKhoraPersistencePaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): KhoraPersistencePaths {
  const dataDirRaw = trimEnv(env, "KHORA_DATA_DIR");
  const catalogOverride = trimEnv(env, "KHORA_CATALOG_PATH");
  const framesOverride = trimEnv(env, "KHORA_FRAMES_DB_PATH");
  const cellsOverride = trimEnv(env, "KHORA_CELLS_DIR");
  const memoriesOverride = trimEnv(env, "KHORA_MEMORIES_DB_PATH");

  const useLegacyOnly =
    dataDirRaw === undefined &&
    catalogOverride !== undefined &&
    framesOverride !== undefined &&
    cellsOverride !== undefined;

  if (useLegacyOnly) {
    const catalogPath = resolvePath(cwd, catalogOverride);
    const dataDir = path.dirname(catalogPath);
    return {
      dataDir,
      catalogPath,
      framesDbPath: resolvePath(cwd, framesOverride),
      cellsDir: resolvePath(cwd, cellsOverride),
      memoriesDbPath:
        memoriesOverride !== undefined
          ? resolvePath(cwd, memoriesOverride)
          : path.join(dataDir, KHORA_PERSISTENCE_REL.memories),
    };
  }

  const dataDir = resolvePath(cwd, dataDirRaw ?? DEFAULT_KHORA_DATA_DIR);
  return {
    dataDir,
    catalogPath:
      catalogOverride !== undefined
        ? resolvePath(cwd, catalogOverride)
        : path.join(dataDir, KHORA_PERSISTENCE_REL.catalog),
    framesDbPath:
      framesOverride !== undefined
        ? resolvePath(cwd, framesOverride)
        : path.join(dataDir, KHORA_PERSISTENCE_REL.frames),
    cellsDir:
      cellsOverride !== undefined
        ? resolvePath(cwd, cellsOverride)
        : path.join(dataDir, KHORA_PERSISTENCE_REL.cellsDir),
    memoriesDbPath:
      memoriesOverride !== undefined
        ? resolvePath(cwd, memoriesOverride)
        : path.join(dataDir, KHORA_PERSISTENCE_REL.memories),
  };
}
