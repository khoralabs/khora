import path from "node:path";

/** Same semantics as `@khoralabs/atrium-daemon` `DaemonPidPathConfig` (`dataDir`, `ATRIUM_OBP_STORE_ROOT`, `~/.atrium`). */
export type VellumPathConfig = {
  dataDir?: string | undefined;
};

export function cfgDataDir(cfg: VellumPathConfig): string | undefined {
  const d = cfg.dataDir?.trim();
  return d !== undefined && d.length > 0 ? d : undefined;
}

/** Filesystem-safe segment for `roomId` (aligned with `@khoralabs/atrium-daemon`). */
export function encodeRoomIdForPath(roomId: string): string {
  return encodeURIComponent(roomId);
}

/** `~/<data>/obp` or `ATRIUM_OBP_STORE_ROOT`. */
export function obpStoreRoot(
  dataDir: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const o = env.ATRIUM_OBP_STORE_ROOT?.trim();
  if (o !== undefined && o.length > 0) return path.resolve(o);
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const root = home.length > 0 ? path.join(home, ".atrium") : path.join(process.cwd(), ".atrium");
  const base = dataDir?.trim()?.length ? path.resolve(dataDir.trim()) : root;
  return path.join(base, "obp");
}

export function roomObpDir(
  dataDir: string | undefined,
  roomId: string,
  env?: NodeJS.ProcessEnv,
): string {
  const enc = encodeRoomIdForPath(roomId);
  return path.join(obpStoreRoot(dataDir, env), "rooms", enc);
}

export function roomObpSqlitePath(
  dataDir: string | undefined,
  roomId: string,
  env?: NodeJS.ProcessEnv,
): string {
  return path.join(roomObpDir(dataDir, roomId, env), "obp.sqlite");
}

export function roomVellumControlPath(
  dataDir: string | undefined,
  roomId: string,
  env?: NodeJS.ProcessEnv,
): string {
  return path.join(roomObpDir(dataDir, roomId, env), "vellum.json");
}
