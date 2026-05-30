import { describe, expect, test } from "bun:test";
import path from "node:path";
import { envMemoriesBootstrapConfig, envMemoriesEnabled } from "./memories-env.ts";
import { resolveKhoraPersistencePaths } from "./persistence-paths.ts";

const MEM_ENV = "KHORA_MEMORIES";

function restoreMem(v: string | undefined): void {
  if (v === undefined) delete process.env[MEM_ENV];
  else process.env[MEM_ENV] = v;
}

describe("envMemoriesEnabled", () => {
  test("enabled by default when unset", () => {
    const prev = process.env[MEM_ENV];
    delete process.env[MEM_ENV];
    try {
      expect(envMemoriesEnabled()).toBe(true);
    } finally {
      restoreMem(prev);
    }
  });

  test("disabled when KHORA_MEMORIES=0", () => {
    const prev = process.env[MEM_ENV];
    process.env[MEM_ENV] = "0";
    try {
      expect(envMemoriesEnabled()).toBe(false);
    } finally {
      restoreMem(prev);
    }
  });
});

describe("envMemoriesBootstrapConfig", () => {
  test("returns config with derived dbPath when enabled", () => {
    const prev = process.env[MEM_ENV];
    delete process.env[MEM_ENV];
    try {
      const paths = resolveKhoraPersistencePaths({ KHORA_DATA_DIR: "./data" }, "/w");
      const cfg = envMemoriesBootstrapConfig(paths);
      expect(cfg).toBeDefined();
      expect(cfg?.dbPath).toBe(path.join("/w", "data", "khora-memories.sqlite"));
    } finally {
      restoreMem(prev);
    }
  });

  test("returns undefined when disabled", () => {
    const prev = process.env[MEM_ENV];
    process.env[MEM_ENV] = "off";
    try {
      const paths = resolveKhoraPersistencePaths({ KHORA_DATA_DIR: "./data" }, "/w");
      expect(envMemoriesBootstrapConfig(paths)).toBeUndefined();
    } finally {
      restoreMem(prev);
    }
  });
});
