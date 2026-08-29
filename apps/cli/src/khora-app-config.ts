import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "@khoralabs/cli-kit";

import {
  type KhoraAppConfigBase,
  khoraAppConfigFromEnv,
  loadKhoraAppConfig,
  resolveKhoraConfigPath,
  zKhoraAppConfigBase,
} from "@khoralabs/khora-client";
import { configPathFromFlags } from "./lib/flags";

function khoraCliDefaultConfigPaths(env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return [path.join(home, ".khora", "cli.config.json")];
}

export function khoraCliResolvedConfig(
  flags: FlagMap,
  env: NodeJS.ProcessEnv = process.env,
): KhoraAppConfigBase {
  const resolved = resolveKhoraConfigPath({
    flag: configPathFromFlags(flags),
    env,
    defaultPaths: khoraCliDefaultConfigPaths(env),
  });
  const { config } = loadKhoraAppConfig({
    schema: zKhoraAppConfigBase,
    layers: [khoraAppConfigFromEnv(env)],
    filePath: resolved?.path ?? null,
    filePathExplicit: resolved?.explicit ?? false,
  });
  return config;
}
