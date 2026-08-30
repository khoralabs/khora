import path from "node:path";

/** Relative paths under `KHORA_DATA_DIR` (default layout). */
export const KHORA_PERSISTENCE_REL = {
  hostDb: "khora-host.sqlite",
  authNoncesDb: "khora-auth-nonces.sqlite",
  percolatorDb: "khora-percolator.sqlite",
  cellsDir: "cells",
  /** memories-service `dataDir` (encoded DB under `v1/…/database.db`). */
  memoriesDir: "memories",
} as const;

export const DEFAULT_KHORA_DATA_DIR = "./data";

export type KhoraPersistencePaths = {
  dataDir: string;
  hostDbPath: string;
  authNoncesDbPath: string;
  percolatorDbPath: string;
  cellsDir: string;
  /** memories-service local SQLite `dataDir`. */
  memoriesDataDir: string;
};

function trimEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v !== undefined && v.length > 0 ? v : undefined;
}

function resolvePath(cwd: string, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

function joinUnderDataDir(
  dataDir: string,
  cwd: string,
  override: string | undefined,
  rel: string,
): string {
  return override !== undefined ? resolvePath(cwd, override) : path.join(dataDir, rel);
}

/**
 * Resolve host persistence paths from env.
 * Primary: `KHORA_DATA_DIR` (defaults to `./data` when unset).
 * Per-component overrides: `KHORA_HOST_DB_PATH`, `KHORA_AUTH_NONCES_DB_PATH`,
 * `KHORA_PERCOLATOR_DB_PATH`, `KHORA_CELLS_DIR`.
 * Host memories live under `{KHORA_DATA_DIR}/memories` (id `host`/`khora`).
 * Legacy: if `KHORA_DATA_DIR` is unset and host DB + cells paths are set, use those only.
 */
export function resolveKhoraPersistencePaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): KhoraPersistencePaths {
  const dataDirRaw = trimEnv(env, "KHORA_DATA_DIR");
  const hostDbOverride = trimEnv(env, "KHORA_HOST_DB_PATH");
  const authNoncesOverride = trimEnv(env, "KHORA_AUTH_NONCES_DB_PATH");
  const percolatorOverride = trimEnv(env, "KHORA_PERCOLATOR_DB_PATH");
  const cellsOverride = trimEnv(env, "KHORA_CELLS_DIR");

  const useLegacyOnly =
    dataDirRaw === undefined && hostDbOverride !== undefined && cellsOverride !== undefined;

  if (useLegacyOnly) {
    const hostDbPath = resolvePath(cwd, hostDbOverride);
    const dataDir = path.dirname(hostDbPath);
    return {
      dataDir,
      hostDbPath,
      authNoncesDbPath: joinUnderDataDir(
        dataDir,
        cwd,
        authNoncesOverride,
        KHORA_PERSISTENCE_REL.authNoncesDb,
      ),
      percolatorDbPath: joinUnderDataDir(
        dataDir,
        cwd,
        percolatorOverride,
        KHORA_PERSISTENCE_REL.percolatorDb,
      ),
      cellsDir: resolvePath(cwd, cellsOverride),
      memoriesDataDir: path.join(dataDir, KHORA_PERSISTENCE_REL.memoriesDir),
    };
  }

  const dataDir = resolvePath(cwd, dataDirRaw ?? DEFAULT_KHORA_DATA_DIR);
  return {
    dataDir,
    hostDbPath: joinUnderDataDir(dataDir, cwd, hostDbOverride, KHORA_PERSISTENCE_REL.hostDb),
    authNoncesDbPath: joinUnderDataDir(
      dataDir,
      cwd,
      authNoncesOverride,
      KHORA_PERSISTENCE_REL.authNoncesDb,
    ),
    percolatorDbPath: joinUnderDataDir(
      dataDir,
      cwd,
      percolatorOverride,
      KHORA_PERSISTENCE_REL.percolatorDb,
    ),
    cellsDir: joinUnderDataDir(dataDir, cwd, cellsOverride, KHORA_PERSISTENCE_REL.cellsDir),
    memoriesDataDir: path.join(dataDir, KHORA_PERSISTENCE_REL.memoriesDir),
  };
}
