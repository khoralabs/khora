import type { VellumAppConfigBase } from "./schema.ts";

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

/** Map env vars into a partial config layer (overrides built-in defaults; overridden by config files — see load order in CLI/daemon). */
export function vellumAppConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<VellumAppConfigBase> {
  const out: Partial<VellumAppConfigBase> = {};

  const baseUrl =
    trimmed(env.VELLUM_BASE_URL) ??
    trimmed(env.VELLUM_ATRIUM_BASE_URL) ??
    trimmed(env.ATRIUM_BASE_URL);
  if (baseUrl !== undefined) out.baseUrl = baseUrl;

  const dataDir =
    trimmed(env.VELLUM_DATA_DIR) ?? trimmed(env.ATRIUM_DATA_DIR) ?? trimmed(env.ATRIUM_DATA_DIR);
  if (dataDir !== undefined) out.dataDir = dataDir;

  const agentKeyPath =
    trimmed(env.ATRIUM_AGENT_KEY_PATH) ??
    trimmed(env.ATRIUM_AGENT_KEY_PATH) ??
    trimmed(env.VELLUM_AGENT_KEY_PATH);
  if (agentKeyPath !== undefined) out.agentKeyPath = agentKeyPath;

  const defaultRoomId = trimmed(env.VELLUM_ROOM_ID) ?? trimmed(env.ATRIUM_ROOM_ID);
  if (defaultRoomId !== undefined) out.defaultRoomId = defaultRoomId;

  const defaultRoomWebSocketUrl = trimmed(env.VELLUM_ROOM_WS_URL);
  if (defaultRoomWebSocketUrl !== undefined) out.defaultRoomWebSocketUrl = defaultRoomWebSocketUrl;

  const jsonRaw = trimmed(env.VELLUM_DAEMON_JSON);
  if (jsonRaw === "1" || jsonRaw === "true") out.daemonJson = true;

  return out;
}
