import { AT2_BUILTIN_PLUGIN_ID } from "../at2-plugins.ts";
import type { At2AppConfigBase, At2AppPluginMap } from "./schema.ts";

const DEFAULT_TELEMETRY_MAX_BYTES = 4 * 1024 * 1024;

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Translate `AT2_*` env vars into a partial `At2AppConfigBase`. Hosts compose by spreading this and
 * adding their own keys before feeding the result into `loadAt2AppConfig`.
 */
export function at2AppConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<At2AppConfigBase> {
  const out: Partial<At2AppConfigBase> = {};

  const baseUrl = trimmed(env.AT2_BASE_URL);
  if (baseUrl !== undefined) out.baseUrl = baseUrl;

  const agentKeyPath = trimmed(env.AT2_AGENT_KEY_PATH);
  if (agentKeyPath !== undefined) out.agentKeyPath = agentKeyPath;

  const dataDir = trimmed(env.AT2_DATA_DIR);
  if (dataDir !== undefined) out.dataDir = dataDir;

  const jsonRaw = trimmed(env.AT2_DAEMON_JSON);
  if (jsonRaw === "1" || jsonRaw === "true") out.daemonJson = true;

  const plugins: At2AppPluginMap = {};

  const profilePath = trimmed(env.AT2_PROFILE_SYNC_PATH);
  if (profilePath !== undefined) {
    plugins[AT2_BUILTIN_PLUGIN_ID.profileSync] = { filePath: profilePath };
  }

  const telDir = trimmed(env.AT2_TELEMETRY_DIR);
  if (telDir !== undefined) {
    const maxRaw = trimmed(env.AT2_TELEMETRY_MAX_BYTES);
    const maxFileBytes =
      maxRaw !== undefined ? Number.parseInt(maxRaw, 10) : DEFAULT_TELEMETRY_MAX_BYTES;
    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error("AT2_TELEMETRY_MAX_BYTES must be a positive number");
    }
    plugins[AT2_BUILTIN_PLUGIN_ID.telemetry] = { dir: telDir, maxFileBytes };
  }

  const inboxDb = trimmed(env.AT2_INBOX_BUFFER_DB);
  if (inboxDb !== undefined) {
    plugins[AT2_BUILTIN_PLUGIN_ID.inboxBuffer] = { dbPath: inboxDb };
  }

  if (Object.keys(plugins).length > 0) out.plugins = plugins;

  return out;
}
