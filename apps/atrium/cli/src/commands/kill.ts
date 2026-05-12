import { unlinkSync } from "node:fs";
import { type DaemonPidPathConfig, readDaemonStatus } from "@khoralabs/atrium-daemon";
import { cliAppConfig } from "../app-config.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export type KillCommandIo = {
  log(line: string): void;
  /** Send a signal to a pid; defaults to `process.kill`. */
  signal(pid: number, sig: NodeJS.Signals): void;
};

const DEFAULT_IO: KillCommandIo = {
  log: (line) => console.log(line),
  signal: (pid, sig) => process.kill(pid, sig),
};

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_MS = 50;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await Bun.sleep(POLL_MS);
  }
  return !isAlive(pid);
}

function safeUnlink(p: string): void {
  try {
    unlinkSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

function parseTimeout(flags: FlagMap): number {
  const raw = strFlag(flags, "timeout");
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("--timeout must be a positive integer (ms)");
  }
  return n;
}

/** Pure entry point for tests. `cfg` and `io` injected so the singleton is not required. */
export async function runKillWith(
  flags: FlagMap,
  cfg: DaemonPidPathConfig,
  io: KillCommandIo,
): Promise<void> {
  const status = readDaemonStatus(cfg);
  if (status.state === "not-running") {
    io.log("not running");
    return;
  }
  if (status.state === "stale") {
    safeUnlink(status.pidPath);
    io.log(`cleared stale pid file (was pid=${status.pid})`);
    return;
  }
  const timeoutMs = parseTimeout(flags);
  const force = boolFlag(flags, "force");
  try {
    io.signal(status.pid, force ? "SIGKILL" : "SIGTERM");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") {
      safeUnlink(status.pidPath);
      io.log(`cleared stale pid file (was pid=${status.pid})`);
      return;
    }
    throw e;
  }
  if (!force) {
    const exited = await waitForExit(status.pid, timeoutMs);
    if (!exited) {
      try {
        io.signal(status.pid, "SIGKILL");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
      await waitForExit(status.pid, 1000);
    }
  } else {
    await waitForExit(status.pid, 1000);
  }
  safeUnlink(status.pidPath);
  io.log(`stopped pid=${status.pid}`);
}

export async function runKillCommand(flags: FlagMap): Promise<void> {
  await runKillWith(flags, cliAppConfig, DEFAULT_IO);
}
