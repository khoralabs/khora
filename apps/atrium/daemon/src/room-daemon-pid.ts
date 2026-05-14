import fs from "node:fs";
import path from "node:path";
import {
  DaemonAlreadyRunningError,
  type DaemonLockHandle,
  type DaemonPidPathConfig,
  daemonDataRoot,
} from "./daemon-pid.ts";

const MAX_STALE_RETRIES = 3;

/** Filesystem-safe segment for `roomId` (reversible via decode). */
export function encodeRoomIdForPath(roomId: string): string {
  return encodeURIComponent(roomId);
}

export function decodeRoomIdFromPathSegment(segment: string): string {
  return decodeURIComponent(segment);
}

export function roomDaemonsDir(cfg: DaemonPidPathConfig): string {
  return path.join(daemonDataRoot(cfg), "daemons", "rooms");
}

export function roomDaemonPidPath(cfg: DaemonPidPathConfig, roomId: string): string {
  return path.join(roomDaemonsDir(cfg), `${encodeRoomIdForPath(roomId)}.pid`);
}

export function roomDaemonLogPath(cfg: DaemonPidPathConfig, roomId: string): string {
  return path.join(roomDaemonsDir(cfg), `${encodeRoomIdForPath(roomId)}.log`);
}

export function roomDaemonMetaPath(cfg: DaemonPidPathConfig, roomId: string): string {
  return path.join(roomDaemonsDir(cfg), `${encodeRoomIdForPath(roomId)}.meta.json`);
}

export type RoomDaemonMeta = { kind: "room"; roomId: string };

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

export type RoomDaemonStatus =
  | { state: "running"; pid: number; pidPath: string; logPath: string; roomId: string }
  | { state: "stale"; pid: number; pidPath: string; logPath: string; roomId: string }
  | { state: "not-running"; pidPath: string; logPath: string; roomId: string };

export function readRoomDaemonStatus(cfg: DaemonPidPathConfig, roomId: string): RoomDaemonStatus {
  const pidPath = roomDaemonPidPath(cfg, roomId);
  const logPath = roomDaemonLogPath(cfg, roomId);
  const pid = readPidFile(pidPath);
  if (pid === undefined) return { state: "not-running", pidPath, logPath, roomId };
  return {
    state: isProcessAlive(pid) ? "running" : "stale",
    pid,
    pidPath,
    logPath,
    roomId,
  };
}

function readRoomMeta(metaPath: string): RoomDaemonMeta | undefined {
  try {
    const raw = fs.readFileSync(metaPath, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (
      j !== null &&
      typeof j === "object" &&
      (j as RoomDaemonMeta).kind === "room" &&
      typeof (j as RoomDaemonMeta).roomId === "string"
    ) {
      return { kind: "room", roomId: (j as RoomDaemonMeta).roomId };
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** Resolve `roomId` for a `.pid` basename without extension (encoded segment). */
export function roomIdFromRoomPidBasename(
  cfg: DaemonPidPathConfig,
  encodedBasename: string,
): string {
  const metaPath = path.join(roomDaemonsDir(cfg), `${encodedBasename}.meta.json`);
  const fromMeta = readRoomMeta(metaPath);
  if (fromMeta !== undefined) return fromMeta.roomId;
  return decodeRoomIdFromPathSegment(encodedBasename);
}

function makeHandle(pid: number, pidPath: string): DaemonLockHandle {
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    try {
      const current = readPidFile(pidPath);
      if (current === pid) {
        fs.unlinkSync(pidPath);
        const metaPath = pidPath.replace(/\.pid$/, ".meta.json");
        try {
          fs.unlinkSync(metaPath);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            // best-effort
          }
        }
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        // best-effort
      }
    }
  };
  process.on("exit", release);
  return { pid, pidPath, release };
}

/**
 * Exclusive lock for one room daemon per `roomId` (same semantics as {@link acquireDaemonLock}).
 */
export function acquireRoomDaemonLock(cfg: DaemonPidPathConfig, roomId: string): DaemonLockHandle {
  const pidPath = roomDaemonPidPath(cfg, roomId);
  const metaPath = roomDaemonMetaPath(cfg, roomId);
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
      try {
        fs.writeFileSync(
          metaPath,
          `${JSON.stringify({ kind: "room", roomId } satisfies RoomDaemonMeta)}\n`,
        );
      } catch {
        try {
          fs.unlinkSync(pidPath);
        } catch {
          // ignore
        }
        throw new Error(`failed to write room daemon meta at ${metaPath}`);
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
      try {
        fs.unlinkSync(metaPath);
      } catch (unlinkMeta) {
        if ((unlinkMeta as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkMeta;
      }
      attempt++;
      if (attempt >= MAX_STALE_RETRIES) {
        throw new Error(
          `failed to acquire room daemon lock at ${pidPath} after ${attempt} retries`,
        );
      }
    }
  }
}
