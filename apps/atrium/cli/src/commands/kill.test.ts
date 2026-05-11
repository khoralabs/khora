import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type KillCommandIo, runKillWith } from "./kill.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "atrium-kill-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeIo(opts?: { signal?: KillCommandIo["signal"] }): {
  lines: string[];
  signals: Array<{ pid: number; sig: NodeJS.Signals }>;
  io: KillCommandIo;
} {
  const lines: string[] = [];
  const signals: Array<{ pid: number; sig: NodeJS.Signals }> = [];
  const io: KillCommandIo = {
    log: (l) => lines.push(l),
    signal:
      opts?.signal ??
      ((pid, sig) => {
        signals.push({ pid, sig });
      }),
  };
  return { lines, signals, io };
}

describe("runKillWith", () => {
  test("not running: prints message, no signal", async () => {
    const { lines, signals, io } = makeIo();
    await runKillWith({}, { dataDir: tmpDir }, io);
    expect(lines).toEqual(["not running"]);
    expect(signals).toEqual([]);
  });

  test("stale pid file is cleared without signaling", async () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), "999999999\n");
    const { lines, signals, io } = makeIo();
    await runKillWith({}, { dataDir: tmpDir }, io);
    expect(lines[0]).toContain("cleared stale pid file");
    expect(signals).toEqual([]);
    expect(existsSync(path.join(tmpDir, "daemon.pid"))).toBe(false);
  });

  test("--force sends SIGKILL once", async () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    let killed = false;
    const { lines, signals, io } = makeIo({
      signal: (pid, sig) => {
        signals.push({ pid, sig });
        killed = true;
      },
    });
    // Simulate the process exiting on first signal by patching readDaemonStatus is hard;
    // instead rely on process.kill(0) returning ESRCH for `killed` after our shim runs.
    void killed;
    await runKillWith({ force: true }, { dataDir: tmpDir }, io);
    expect(signals).toEqual([{ pid: process.ppid, sig: "SIGKILL" }]);
    expect(lines[0]).toBe(`stopped pid=${process.ppid}`);
    expect(existsSync(path.join(tmpDir, "daemon.pid"))).toBe(false);
  });

  test("graceful path: SIGTERM, escalates to SIGKILL when timeout exceeded", async () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { lines, signals, io } = makeIo();
    await runKillWith({ timeout: "100" }, { dataDir: tmpDir }, io);
    // The fake `signal` is a no-op so the process never actually dies; we expect both signals.
    expect(signals[0]).toEqual({ pid: process.ppid, sig: "SIGTERM" });
    expect(signals[1]).toEqual({ pid: process.ppid, sig: "SIGKILL" });
    expect(lines[0]).toBe(`stopped pid=${process.ppid}`);
  });

  test("--timeout must be a positive integer", async () => {
    writeFileSync(path.join(tmpDir, "daemon.pid"), `${process.ppid}\n`);
    const { io } = makeIo();
    await expect(runKillWith({ timeout: "0" }, { dataDir: tmpDir }, io)).rejects.toThrow(
      /positive integer/,
    );
  });
});
