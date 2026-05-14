import path from "node:path";
import { type DaemonPidPathConfig, daemonDataRoot } from "./daemon-pid.ts";
import { encodeRoomIdForPath } from "./room-daemon-pid.ts";

/**
 * Shared on-disk root for OBP SQLite files. Override with `ATRIUM_OBP_STORE_ROOT`.
 * Layout: `inbox/obp.sqlite`, `rooms/<encodedRoomId>/obp.sqlite` (later: `chains/<chainId>.sqlite`).
 */
export function obpStoreRoot(
  cfg: DaemonPidPathConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const o = env.ATRIUM_OBP_STORE_ROOT?.trim();
  if (o !== undefined && o.length > 0) return path.resolve(o);
  return path.join(daemonDataRoot(cfg), "obp");
}

export function inboxObpSqlitePath(cfg: DaemonPidPathConfig, env?: NodeJS.ProcessEnv): string {
  return path.join(obpStoreRoot(cfg, env), "inbox", "obp.sqlite");
}

export function roomObpSqlitePath(
  cfg: DaemonPidPathConfig,
  roomId: string,
  env?: NodeJS.ProcessEnv,
): string {
  const enc = encodeRoomIdForPath(roomId);
  return path.join(obpStoreRoot(cfg, env), "rooms", enc, "obp.sqlite");
}
