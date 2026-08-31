import { homedir } from "node:os";
import path from "node:path";

import type { KhoraAppConfigBase } from "./config/schema";

/** Default local host base URL when config/env omit `baseUrl`. */
export const DEFAULT_KHORA_BASE_URL = "http://127.0.0.1:8787";

/** Khora operator identity path: `KHORA_AGENT_KEY_PATH`, else `~/.khora/identity.json`. */
export function defaultIdentityPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.KHORA_AGENT_KEY_PATH?.trim();
  if (override !== undefined && override.length > 0) return override;
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "identity.json");
}

/** Default operator data directory: `~/.khora/data` (respects HOME / USERPROFILE). */
export function defaultKhoraDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "data");
}

/**
 * Resolve data dir: config `dataDir` → `KHORA_DATA_DIR` → {@link defaultKhoraDataDir}.
 */
export function resolveKhoraDataDir(
  cfg: Pick<KhoraAppConfigBase, "dataDir">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromCfg = cfg.dataDir?.trim();
  if (fromCfg !== undefined && fromCfg.length > 0) return fromCfg;
  const fromEnv = env.KHORA_DATA_DIR?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return defaultKhoraDataDir(env);
}
