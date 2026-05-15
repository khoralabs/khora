import { ATRIUM_BUILTIN_PLUGIN_ID } from "../atrium-plugins.ts";
import type { AtriumAppConfigBase, AtriumAppPluginMap } from "./schema.ts";

const DEFAULT_TELEMETRY_MAX_BYTES = 4 * 1024 * 1024;

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Translate today's `ATRIUM_*` env vars into a partial `AtriumAppConfigBase`. Hosts compose by
 * spreading this and adding their own keys before feeding the result into `loadAtriumAppConfig`.
 */
export function atriumAppConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<AtriumAppConfigBase> {
  const out: Partial<AtriumAppConfigBase> = {};

  const baseUrl = trimmed(env.ATRIUM_BASE_URL);
  if (baseUrl !== undefined) out.baseUrl = baseUrl;

  const agentKeyPath = trimmed(env.ATRIUM_AGENT_KEY_PATH);
  if (agentKeyPath !== undefined) out.agentKeyPath = agentKeyPath;

  const dataDir = trimmed(env.ATRIUM_DATA_DIR);
  if (dataDir !== undefined) out.dataDir = dataDir;

  const jsonRaw = trimmed(env.ATRIUM_DAEMON_JSON);
  if (jsonRaw === "1" || jsonRaw === "true") out.daemonJson = true;

  const plugins: AtriumAppPluginMap = {};

  const profilePath = trimmed(env.ATRIUM_PROFILE_SYNC_PATH);
  if (profilePath !== undefined) {
    plugins[ATRIUM_BUILTIN_PLUGIN_ID.profileSync] = { filePath: profilePath };
  }

  const telDir = trimmed(env.ATRIUM_TELEMETRY_DIR);
  if (telDir !== undefined) {
    const maxRaw = trimmed(env.ATRIUM_TELEMETRY_MAX_BYTES);
    const maxFileBytes =
      maxRaw !== undefined ? Number.parseInt(maxRaw, 10) : DEFAULT_TELEMETRY_MAX_BYTES;
    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error("ATRIUM_TELEMETRY_MAX_BYTES must be a positive number");
    }
    plugins[ATRIUM_BUILTIN_PLUGIN_ID.telemetry] = { dir: telDir, maxFileBytes };
  }

  const inboxDb = trimmed(env.ATRIUM_INBOX_BUFFER_DB);
  if (inboxDb !== undefined) {
    plugins[ATRIUM_BUILTIN_PLUGIN_ID.inboxBuffer] = { dbPath: inboxDb };
  }

  if (Object.keys(plugins).length > 0) out.plugins = plugins;

  return out;
}
