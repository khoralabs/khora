import { KHORA_BUILTIN_PLUGIN_ID } from "../khora-plugins.ts";
import type { KhoraAppConfigBase, KhoraAppPluginMap } from "./schema.ts";

const DEFAULT_TELEMETRY_MAX_BYTES = 4 * 1024 * 1024;

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim();
  return v.length > 0 ? v : undefined;
}

/**
 * Translate `KHORA_*` env vars into a partial `KhoraAppConfigBase`. Hosts compose by spreading this and
 * adding their own keys before feeding the result into `loadKhoraAppConfig`.
 */
export function khoraAppConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<KhoraAppConfigBase> {
  const out: Partial<KhoraAppConfigBase> = {};

  const baseUrl = trimmed(env.KHORA_BASE_URL);
  if (baseUrl !== undefined) out.baseUrl = baseUrl;

  const registryUrl = trimmed(env.KHORA_REGISTRY_URL);
  if (registryUrl !== undefined) out.registryUrl = registryUrl;

  const registryHostSlug = trimmed(env.KHORA_REGISTRY_HOST_SLUG);
  if (registryHostSlug !== undefined) out.registryHostSlug = registryHostSlug;

  const currentHost = trimmed(env.KHORA_CURRENT_HOST);
  if (currentHost !== undefined) out.currentHost = currentHost;

  const agentKeyPath = trimmed(env.KHORA_AGENT_KEY_PATH);
  if (agentKeyPath !== undefined) out.agentKeyPath = agentKeyPath;

  const dataDir = trimmed(env.KHORA_DATA_DIR);
  if (dataDir !== undefined) out.dataDir = dataDir;

  const jsonRaw = trimmed(env.KHORA_DAEMON_JSON);
  if (jsonRaw === "1" || jsonRaw === "true") out.daemonJson = true;

  const plugins: KhoraAppPluginMap = {};

  const profilePath = trimmed(env.KHORA_PROFILE_SYNC_PATH);
  if (profilePath !== undefined) {
    plugins[KHORA_BUILTIN_PLUGIN_ID.profileSync] = { filePath: profilePath };
  }

  const telDir = trimmed(env.KHORA_TELEMETRY_DIR);
  if (telDir !== undefined) {
    const maxRaw = trimmed(env.KHORA_TELEMETRY_MAX_BYTES);
    const maxFileBytes =
      maxRaw !== undefined ? Number.parseInt(maxRaw, 10) : DEFAULT_TELEMETRY_MAX_BYTES;
    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
      throw new Error("KHORA_TELEMETRY_MAX_BYTES must be a positive number");
    }
    plugins[KHORA_BUILTIN_PLUGIN_ID.telemetry] = { dir: telDir, maxFileBytes };
  }

  const inboxDb = trimmed(env.KHORA_INBOX_BUFFER_DB);
  if (inboxDb !== undefined) {
    plugins[KHORA_BUILTIN_PLUGIN_ID.inboxBuffer] = { dbPath: inboxDb };
  }

  if (Object.keys(plugins).length > 0) out.plugins = plugins;

  return out;
}
