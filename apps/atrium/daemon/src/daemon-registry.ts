import fs from "node:fs";
import path from "node:path";
import {
  type DaemonPidPathConfig,
  daemonLogPath,
  daemonPidPath,
  readDaemonStatus,
} from "./daemon-pid.ts";
import { roomDaemonLogPath, roomDaemonsDir, roomIdFromRoomPidBasename } from "./room-daemon-pid.ts";

export type RegisteredDaemonKind = "inbox" | "room";

export type RegisteredDaemonEntry = {
  kind: RegisteredDaemonKind;
  /** Set when {@link kind} is `room`. */
  roomId?: string;
  /** Absent when no PID is recorded. */
  pid?: number;
  pidPath: string;
  logPath: string;
  state: "running" | "stale" | "not-running";
};

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

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

/**
 * Lists inbox + every `daemons/rooms/*.pid` registration with liveness state.
 * Inbox is always first when present as a row (including `not-running` with no file).
 */
export function listRegisteredDaemons(
  cfg: DaemonPidPathConfig,
  logOverride?: string,
): RegisteredDaemonEntry[] {
  const out: RegisteredDaemonEntry[] = [];

  const inbox = readDaemonStatus(cfg, logOverride);
  const inboxLog = daemonLogPath(cfg, logOverride);
  if (inbox.state === "not-running") {
    out.push({
      kind: "inbox",
      pidPath: daemonPidPath(cfg),
      logPath: inboxLog,
      state: "not-running",
    });
  } else if (inbox.state === "running") {
    out.push({
      kind: "inbox",
      pid: inbox.pid,
      pidPath: inbox.pidPath,
      logPath: inbox.logPath,
      state: "running",
    });
  } else {
    out.push({
      kind: "inbox",
      pid: inbox.pid,
      pidPath: inbox.pidPath,
      logPath: inbox.logPath,
      state: "stale",
    });
  }

  const dir = roomDaemonsDir(cfg);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }

  for (const name of names) {
    if (!name.endsWith(".pid")) continue;
    const base = name.slice(0, -".pid".length);
    const pidPath = path.join(dir, name);
    const roomId = roomIdFromRoomPidBasename(cfg, base);
    const logPath = roomDaemonLogPath(cfg, roomId);
    const pid = readPidFile(pidPath);
    if (pid === undefined) {
      out.push({ kind: "room", roomId, pidPath, logPath, state: "not-running" });
    } else {
      out.push({
        kind: "room",
        roomId,
        pid,
        pidPath,
        logPath,
        state: isProcessAlive(pid) ? "running" : "stale",
      });
    }
  }

  return out;
}

/** Map pid → registry entries (inbox + rooms) that reference that pid. */
export function findRegistryEntriesByPid(
  cfg: DaemonPidPathConfig,
  pid: number,
  logOverride?: string,
): RegisteredDaemonEntry[] {
  return listRegisteredDaemons(cfg, logOverride).filter((e) => e.pid === pid);
}
