import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { daemonSpawnCmd, resolveDaemonBinary } from "./daemon-spawn";

describe("resolveDaemonBinary", () => {
  let workspace: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), "khora-daemon-resolve-"));
    origEnv = { ...process.env };
    delete process.env.KHORA_DAEMON_BIN;
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    process.env = origEnv;
  });

  test("prefers KHORA_DAEMON_BIN", () => {
    process.env.KHORA_DAEMON_BIN = "/opt/khora/khora-daemon";
    expect(resolveDaemonBinary()).toBe("/opt/khora/khora-daemon");
  });

  test("finds khora-daemon on PATH", () => {
    const binDir = path.join(workspace, "bin");
    mkdirSync(binDir, { recursive: true });
    const daemonPath = path.join(binDir, "khora-daemon");
    writeFileSync(daemonPath, "");
    chmodSync(daemonPath, 0o755);
    process.env.PATH = binDir;
    expect(resolveDaemonBinary()).toBe(daemonPath);
  });

  test("returns undefined in monorepo dev without env or PATH match", () => {
    process.env.PATH = workspace;
    expect(resolveDaemonBinary()).toBeUndefined();
  });
});

describe("daemonSpawnCmd", () => {
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.KHORA_DAEMON_BIN = "/brew/bin/khora-daemon";
  });

  afterEach(() => {
    process.env = origEnv;
  });

  test("spawns resolved binary directly", () => {
    expect(daemonSpawnCmd()).toEqual(["/brew/bin/khora-daemon"]);
  });
});
