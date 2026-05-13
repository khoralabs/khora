import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { DaemonAppConfig } from "./app-config.ts";

export type DaemonPidPathConfig = Pick<DaemonAppConfig, "dataDir">;

export function daemonDataRoot(cfg: DaemonPidPathConfig): string {
  const dir = cfg.dataDir?.trim();
  if (dir !== undefined && dir.length > 0) return path.resolve(dir);
  return path.join(homedir(), ".atrium");
}

export function daemonPidPath(cfg: DaemonPidPathConfig): string {
  return path.join(daemonDataRoot(cfg), "daemon.pid");
}

export function daemonLogPath(cfg: DaemonPidPathConfig, override?: string): string {
  if (override !== undefined && override.trim().length > 0) return path.resolve(override.trim());
  return path.join(daemonDataRoot(cfg), "daemon.log");
}

/** Thrown when another live daemon already holds the PID lock. */
export class DaemonAlreadyRunningError extends Error {
  readonly pid: number;
  readonly pidPath: string;
  constructor(pid: number, pidPath: string) {
    super(`daemon already running (pid ${pid})`);
    this.name = "DaemonAlreadyRunningError";
    this.pid = pid;
    this.pidPath = pidPath;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // EPERM = process exists but we can't signal it.
    if (code === "EPERM") return true;
    return false;
  }
}

function readPidFile(pidPath: string): number | undefined {
  try {
    const raw = fs.readFileSync(pidPath, "utf8").trim();
    if (raw.length === 0) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export type DaemonStatus =
  | { state: "running"; pid: number; pidPath: string; logPath: string }
  | { state: "stale"; pid: number; pidPath: string; logPath: string }
  | { state: "not-running"; pidPath: string; logPath: string };

/** Pure inspector — never modifies the PID file. */
export function readDaemonStatus(cfg: DaemonPidPathConfig, logOverride?: string): DaemonStatus {
  const pidPath = daemonPidPath(cfg);
  const logPath = daemonLogPath(cfg, logOverride);
  const pid = readPidFile(pidPath);
  if (pid === undefined) return { state: "not-running", pidPath, logPath };
  return { state: isProcessAlive(pid) ? "running" : "stale", pid, pidPath, logPath };
}

export type DaemonLockHandle = {
  readonly pid: number;
  readonly pidPath: string;
  release(): void;
};

const MAX_STALE_RETRIES = 3;

/**
 * Acquire the single-instance daemon lock by atomically creating the PID file (O_EXCL). If a stale
 * file exists (PID points to a dead process), it is removed and we retry. On a live PID, throws
 * {@link DaemonAlreadyRunningError}.
 *
 * The returned handle exposes `release()`, which is also auto-invoked on `process.exit`,
 * `SIGINT`, and `SIGTERM`. Calling `release()` more than once is a no-op.
 */
export function acquireDaemonLock(cfg: DaemonPidPathConfig): DaemonLockHandle {
  const pidPath = daemonPidPath(cfg);
  fs.mkdirSync(path.dirname(pidPath), { recursive: true });
  let attempt = 0;
  while (true) {
    try {
      const fd = fs.openSync(pidPath, "wx", 0o644);
      try {
        fs.writeFileSync(fd, `${process.pid}\n`);
      } finally {
        fs.closeSync(fd);
      }
      return makeHandle(process.pid, pidPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      const existing = readPidFile(pidPath);
      if (existing !== undefined && existing !== process.pid && isProcessAlive(existing)) {
        throw new DaemonAlreadyRunningError(existing, pidPath);
      }
      try {
        fs.unlinkSync(pidPath);
      } catch (unlinkErr) {
        if ((unlinkErr as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkErr;
      }
      attempt++;
      if (attempt >= MAX_STALE_RETRIES) {
        throw new Error(`failed to acquire daemon lock at ${pidPath} after ${attempt} retries`);
      }
    }
  }
}

function makeHandle(pid: number, pidPath: string): DaemonLockHandle {
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      const current = readPidFile(pidPath);
      if (current === pid) fs.unlinkSync(pidPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        // Best-effort cleanup; ignore unlink failures so they don't mask the real exit reason.
      }
    }
  };
  process.on("exit", release);
  return { pid, pidPath, release };
}
