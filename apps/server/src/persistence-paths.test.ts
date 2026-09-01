import { describe, expect, test } from "bun:test";
import path from "node:path";
import { KHORA_PERSISTENCE_REL, resolveKhoraPersistencePaths } from "./persistence-paths";

const ENV_KEYS = [
  "KHORA_DATA_DIR",
  "KHORA_HOST_DB_PATH",
  "KHORA_AUTH_NONCES_DB_PATH",
  "KHORA_PERCOLATOR_DB_PATH",
  "KHORA_CELLS_DIR",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    out[k] = process.env[k];
  }
  return out;
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    const v = prev[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("resolveKhoraPersistencePaths", () => {
  test("KHORA_DATA_DIR alone derives host, auth nonces, percolator, cells, and memories paths", () => {
    const prev = snapshotEnv();
    try {
      delete process.env.KHORA_HOST_DB_PATH;
      delete process.env.KHORA_AUTH_NONCES_DB_PATH;
      delete process.env.KHORA_PERCOLATOR_DB_PATH;
      delete process.env.KHORA_CELLS_DIR;
      process.env.KHORA_DATA_DIR = "./my-data";
      const cwd = "/app";
      const p = resolveKhoraPersistencePaths(process.env, cwd);
      expect(p.dataDir).toBe(path.join(cwd, "my-data"));
      expect(p.hostDbPath).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.hostDb));
      expect(p.authNoncesDbPath).toBe(
        path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.authNoncesDb),
      );
      expect(p.percolatorDbPath).toBe(
        path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.percolatorDb),
      );
      expect(p.cellsDir).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.cellsDir));
      expect(p.memoriesDataDir).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.memoriesDir));
    } finally {
      restoreEnv(prev);
    }
  });

  test("default data dir when KHORA_DATA_DIR unset", () => {
    const prev = snapshotEnv();
    try {
      for (const k of ENV_KEYS) delete process.env[k];
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.dataDir).toBe(path.join("/w", "data"));
      expect(p.hostDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.hostDb));
      expect(p.authNoncesDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.authNoncesDb));
      expect(p.percolatorDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.percolatorDb));
      expect(p.memoriesDataDir).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.memoriesDir));
    } finally {
      restoreEnv(prev);
    }
  });

  test("per-path overrides under KHORA_DATA_DIR", () => {
    const prev = snapshotEnv();
    try {
      process.env.KHORA_DATA_DIR = "./data";
      process.env.KHORA_CELLS_DIR = "/custom/cells";
      process.env.KHORA_AUTH_NONCES_DB_PATH = "/custom/nonces.sqlite";
      process.env.KHORA_PERCOLATOR_DB_PATH = "/custom/percolator.sqlite";
      delete process.env.KHORA_HOST_DB_PATH;
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.cellsDir).toBe("/custom/cells");
      expect(p.authNoncesDbPath).toBe("/custom/nonces.sqlite");
      expect(p.percolatorDbPath).toBe("/custom/percolator.sqlite");
      expect(p.hostDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.hostDb));
    } finally {
      restoreEnv(prev);
    }
  });

  test("host DB and cells overrides without KHORA_DATA_DIR still use default data dir", () => {
    const prev = snapshotEnv();
    try {
      delete process.env.KHORA_DATA_DIR;
      process.env.KHORA_HOST_DB_PATH = "/custom/host.sqlite";
      process.env.KHORA_CELLS_DIR = "/custom/cells";
      delete process.env.KHORA_AUTH_NONCES_DB_PATH;
      delete process.env.KHORA_PERCOLATOR_DB_PATH;
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.dataDir).toBe(path.join("/w", "data"));
      expect(p.hostDbPath).toBe("/custom/host.sqlite");
      expect(p.cellsDir).toBe("/custom/cells");
      expect(p.authNoncesDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.authNoncesDb));
      expect(p.percolatorDbPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.percolatorDb));
      expect(p.memoriesDataDir).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.memoriesDir));
    } finally {
      restoreEnv(prev);
    }
  });
});
