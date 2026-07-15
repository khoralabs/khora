import path from "node:path";

/** Relative paths under `KHORA_DATA_DIR` (default layout). */
export const KHORA_PERSISTENCE_REL = {
  hostDb: "khora-host.sqlite",
  cellsDir: "cells",
  memories: "khora-memories.sqlite",
} as const;

export const DEFAULT_KHORA_DATA_DIR = "./data";

export type KhoraPersistencePaths = {
  dataDir: string;
  hostDbPath: string;
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
 * Per-component overrides: `KHORA_HOST_DB_PATH`, `KHORA_CELLS_DIR`, `KHORA_MEMORIES_DB_PATH`.
 * Legacy: if `KHORA_DATA_DIR` is unset and host DB + cells paths are set, use those only.
 */
export function resolveKhoraPersistencePaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): KhoraPersistencePaths {
  const dataDirRaw = trimEnv(env, "KHORA_DATA_DIR");
  const hostDbOverride = trimEnv(env, "KHORA_HOST_DB_PATH");
  const cellsOverride = trimEnv(env, "KHORA_CELLS_DIR");
  const memoriesOverride = trimEnv(env, "KHORA_MEMORIES_DB_PATH");

  const useLegacyOnly =
    dataDirRaw === undefined && hostDbOverride !== undefined && cellsOverride !== undefined;

  if (useLegacyOnly) {
    const hostDbPath = resolvePath(cwd, hostDbOverride);
    const dataDir = path.dirname(hostDbPath);
    return {
      dataDir,
      hostDbPath,
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
    hostDbPath:
      hostDbOverride !== undefined
        ? resolvePath(cwd, hostDbOverride)
        : path.join(dataDir, KHORA_PERSISTENCE_REL.hostDb),
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
