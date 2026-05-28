import path from "node:path";

/** Room storage layout: `${dataDir}/obp/...` unless `VELLUM_OBP_STORE_ROOT` / legacy `KHORA_OBP_STORE_ROOT` overrides. */
export type VellumPathConfig = {
  dataDir?: string | undefined;
};

export function cfgDataDir(cfg: VellumPathConfig): string | undefined {
  const d = cfg.dataDir?.trim();
  return d !== undefined && d.length > 0 ? d : undefined;
}

/** Filesystem-safe segment for `roomId` (aligned with `@khoralabs/khora-daemon`). */
export function encodeRoomIdForPath(roomId: string): string {
  return encodeURIComponent(roomId);
}

/** `<dataDir>/obp` (default data dir `~/.vellum/data`) or `VELLUM_OBP_STORE_ROOT` / `KHORA_OBP_STORE_ROOT`. */
export function obpStoreRoot(
  dataDir: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const storeOverride = env.VELLUM_OBP_STORE_ROOT?.trim() ?? env.KHORA_OBP_STORE_ROOT?.trim();
  if (storeOverride !== undefined && storeOverride.length > 0) return path.resolve(storeOverride);
  const home = env.HOME ?? env.USERPROFILE ?? "";
  const root =
    home.length > 0
      ? path.join(home, ".vellum", "data")
      : path.join(process.cwd(), ".vellum", "data");
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
