import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import { resolveKhoraConfigPath } from "@khoralabs/khora-client";

function defaultCliConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".khora", "cli.config.json");
}

export function resolveCliConfigWritePath(
  flags: FlagMap,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const resolved = resolveKhoraConfigPath({
    flag: strFlag(flags, "config"),
    env,
    defaultPaths: [defaultCliConfigPath(env)],
  });
  return resolved?.path ?? defaultCliConfigPath(env);
}

export function patchCliConfigFile(configPath: string, patch: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const merged = { ...existing, ...patch };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
}
