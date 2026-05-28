import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  type KhoraAppConfigBase,
  khoraAppConfigFromEnv,
  loadKhoraAppConfig,
  zKhoraAppConfigBase,
} from "@khoralabs/khora-client";

export const DEFAULT_KHORA_BASE_URL = "http://127.0.0.1:8787";

export function defaultKhoraDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "data");
}

export function defaultKhoraDaemonConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "daemon.config.json");
}

export function resolveKhoraDataDir(
  cfg: KhoraAppConfigBase,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromCfg = cfg.dataDir?.trim();
  if (fromCfg !== undefined && fromCfg.length > 0) return fromCfg;
  const fromEnv = env.KHORA_DATA_DIR?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return defaultKhoraDataDir(env);
}

export function loadDaemonLayeredConfig(env: NodeJS.ProcessEnv = process.env): KhoraAppConfigBase {
  const p = defaultKhoraDaemonConfigPath(env);
  return loadKhoraAppConfig({
    schema: zKhoraAppConfigBase,
    layers: [khoraAppConfigFromEnv(env)],
    filePath: existsSync(p) ? p : null,
    filePathExplicit: false,
  }).config;
}

export function daemonJsonOutput(
  cfg: KhoraAppConfigBase,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.KHORA_DAEMON_JSON === "1" || env.KHORA_DAEMON_JSON === "true" || cfg.daemonJson === true
  );
}
