import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  DEFAULT_KHORA_BASE_URL,
  defaultKhoraDataDir,
  type KhoraAppConfigBase,
  khoraAppConfigFromEnv,
  loadKhoraAppConfig,
  resolveKhoraDataDir,
  zKhoraAppConfigBase,
} from "@khoralabs/khora-client";

export { DEFAULT_KHORA_BASE_URL, defaultKhoraDataDir, resolveKhoraDataDir };

export function defaultKhoraDaemonConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "daemon.config.json");
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
