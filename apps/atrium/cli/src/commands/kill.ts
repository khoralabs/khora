import { unlinkSync } from "node:fs";
import {
  type DaemonPidPathConfig,
  findRegistryEntriesByPid,
  listRegisteredDaemons,
  readDaemonStatus,
} from "@khoralabs/atrium-daemon";
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

async function signalUntilStopped(
  pid: number,
  timeoutMs: number,
  force: boolean,
  io: KillCommandIo,
): Promise<void> {
  try {
    io.signal(pid, force ? "SIGKILL" : "SIGTERM");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return;
    throw e;
  }
  if (!force) {
    const exited = await waitForExit(pid, timeoutMs);
    if (!exited) {
      try {
        io.signal(pid, "SIGKILL");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
      }
      await waitForExit(pid, 1000);
    }
  } else {
    await waitForExit(pid, 1000);
  }
}

async function killInboxOnly(
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
  const force = boolFlag(flags, "force", "f");
  try {
    await signalUntilStopped(status.pid, timeoutMs, force, io);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") {
      safeUnlink(status.pidPath);
      io.log(`cleared stale pid file (was pid=${status.pid})`);
      return;
    }
    throw e;
  }
  safeUnlink(status.pidPath);
  io.log(`stopped pid=${status.pid}`);
}

async function killAllRegistered(
  flags: FlagMap,
  cfg: DaemonPidPathConfig,
  io: KillCommandIo,
): Promise<void> {
  const entries = listRegisteredDaemons(cfg);
  const timeoutMs = parseTimeout(flags);
  const force = boolFlag(flags, "force", "f");
  let didSomething = false;
  const runningByPid = new Map<number, string[]>();

  for (const e of entries) {
    if (e.state === "stale" && e.pid !== undefined) {
      safeUnlink(e.pidPath);
      io.log(`cleared stale ${e.kind} pid file (was pid=${e.pid})`);
      didSomething = true;
      continue;
    }
    if (e.state !== "running" || e.pid === undefined) continue;
    const paths = runningByPid.get(e.pid) ?? [];
    paths.push(e.pidPath);
    runningByPid.set(e.pid, paths);
  }

  for (const [pid, paths] of runningByPid) {
    try {
      await signalUntilStopped(pid, timeoutMs, force, io);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
    for (const p of paths) safeUnlink(p);
    io.log(`stopped pid=${pid}`);
    didSomething = true;
  }

  if (!didSomething) io.log("no atrium daemons to stop");
}

async function killKnownPid(
  flags: FlagMap,
  cfg: DaemonPidPathConfig,
  pid: number,
  io: KillCommandIo,
): Promise<void> {
  const matches = findRegistryEntriesByPid(cfg, pid);
  if (matches.length === 0) {
    throw new Error(`pid ${pid} is not a registered atrium inbox daemon`);
  }
  const timeoutMs = parseTimeout(flags);
  const force = boolFlag(flags, "force", "f");
  const paths = matches.map((m) => m.pidPath);
  const state = matches[0]?.state;
  if (state === "not-running") {
    io.log("not running");
    return;
  }
  if (state === "stale") {
    for (const p of paths) safeUnlink(p);
    io.log(`cleared stale pid file (was pid=${pid})`);
    return;
  }
  try {
    await signalUntilStopped(pid, timeoutMs, force, io);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") {
      for (const p of paths) safeUnlink(p);
      io.log(`cleared stale pid file (was pid=${pid})`);
      return;
    }
    throw e;
  }
  for (const p of paths) safeUnlink(p);
  io.log(`stopped pid=${pid}`);
}

/** Pure entry point for tests. `cfg` and `io` injected so the singleton is not required. */
export async function runKillWith(
  flags: FlagMap,
  cfg: DaemonPidPathConfig,
  io: KillCommandIo,
): Promise<void> {
  const all = boolFlag(flags, "all");
  const pidRaw = strFlag(flags, "pid");
  if (all && pidRaw !== undefined) {
    throw new Error("atrium kill: use either --all or --pid, not both");
  }
  if (pidRaw !== undefined) {
    const pid = Number.parseInt(pidRaw, 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error("atrium kill: --pid must be a positive integer");
    }
    await killKnownPid(flags, cfg, pid, io);
    return;
  }
  if (all) {
    await killAllRegistered(flags, cfg, io);
    return;
  }
  await killInboxOnly(flags, cfg, io);
}

export async function runKillCommand(flags: FlagMap): Promise<void> {
  await runKillWith(flags, cliAppConfig, DEFAULT_IO);
}
