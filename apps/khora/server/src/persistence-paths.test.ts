import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { KHORA_PERSISTENCE_REL, resolveKhoraPersistencePaths } from "./persistence-paths";

const ENV_KEYS = [
  "KHORA_DATA_DIR",
  "KHORA_CATALOG_PATH",
  "KHORA_FRAMES_DB_PATH",
  "KHORA_CELLS_DIR",
  "KHORA_MEMORIES_DB_PATH",
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

afterEach(() => {
  /* tests restore in finally */
});

describe("resolveKhoraPersistencePaths", () => {
  test("KHORA_DATA_DIR alone derives all four paths", () => {
    const prev = snapshotEnv();
    try {
      delete process.env.KHORA_CATALOG_PATH;
      delete process.env.KHORA_FRAMES_DB_PATH;
      delete process.env.KHORA_CELLS_DIR;
      delete process.env.KHORA_MEMORIES_DB_PATH;
      process.env.KHORA_DATA_DIR = "./my-data";
      const cwd = "/app";
      const p = resolveKhoraPersistencePaths(process.env, cwd);
      expect(p.dataDir).toBe(path.join(cwd, "my-data"));
      expect(p.catalogPath).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.catalog));
      expect(p.framesDbPath).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.frames));
      expect(p.cellsDir).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.cellsDir));
      expect(p.memoriesDbPath).toBe(path.join(cwd, "my-data", KHORA_PERSISTENCE_REL.memories));
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
      expect(p.catalogPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.catalog));
    } finally {
      restoreEnv(prev);
    }
  });

  test("per-path overrides under KHORA_DATA_DIR", () => {
    const prev = snapshotEnv();
    try {
      process.env.KHORA_DATA_DIR = "./data";
      process.env.KHORA_CELLS_DIR = "/custom/cells";
      delete process.env.KHORA_CATALOG_PATH;
      delete process.env.KHORA_FRAMES_DB_PATH;
      delete process.env.KHORA_MEMORIES_DB_PATH;
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.cellsDir).toBe("/custom/cells");
      expect(p.catalogPath).toBe(path.join("/w", "data", KHORA_PERSISTENCE_REL.catalog));
    } finally {
      restoreEnv(prev);
    }
  });

  test("legacy three paths without KHORA_DATA_DIR", () => {
    const prev = snapshotEnv();
    try {
      delete process.env.KHORA_DATA_DIR;
      process.env.KHORA_CATALOG_PATH = "/legacy/cat.sqlite";
      process.env.KHORA_FRAMES_DB_PATH = "/legacy/frames.sqlite";
      process.env.KHORA_CELLS_DIR = "/legacy/cells";
      delete process.env.KHORA_MEMORIES_DB_PATH;
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.catalogPath).toBe("/legacy/cat.sqlite");
      expect(p.framesDbPath).toBe("/legacy/frames.sqlite");
      expect(p.cellsDir).toBe("/legacy/cells");
      expect(p.dataDir).toBe("/legacy");
      expect(p.memoriesDbPath).toBe(path.join("/legacy", KHORA_PERSISTENCE_REL.memories));
    } finally {
      restoreEnv(prev);
    }
  });

  test("KHORA_MEMORIES_DB_PATH override when legacy layout", () => {
    const prev = snapshotEnv();
    try {
      delete process.env.KHORA_DATA_DIR;
      process.env.KHORA_CATALOG_PATH = "/legacy/cat.sqlite";
      process.env.KHORA_FRAMES_DB_PATH = "/legacy/frames.sqlite";
      process.env.KHORA_CELLS_DIR = "/legacy/cells";
      process.env.KHORA_MEMORIES_DB_PATH = "/else/mem.sqlite";
      const p = resolveKhoraPersistencePaths(process.env, "/w");
      expect(p.memoriesDbPath).toBe("/else/mem.sqlite");
    } finally {
      restoreEnv(prev);
    }
  });
});
