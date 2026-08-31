import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FlagMap } from "@khoralabs/cli-kit";
import { resolveKhoraDataDir } from "@khoralabs/khora-client";
import {
  type KhoraDaemonControlFile,
  readKhoraDaemonControlFile,
} from "@khoralabs/khora-daemon/control-pid";

import { agentIdentityPath, cliBaseUrl } from "./flows/context";
import { khoraCliResolvedConfig } from "./khora-app-config";
import { dataDirFromFlags } from "./lib/flags";

const MONOREPO_DAEMON_ENTRY = fileURLToPath(new URL("../../daemon/src/index.ts", import.meta.url));

function findExecutableOnPath(name: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function siblingDaemonBinary(): string | undefined {
  const execBase = path.basename(process.execPath);
  if (execBase === "bun" || execBase === "bun.exe") return undefined;
  const sibling = path.join(path.dirname(process.execPath), "khora-daemon");
  return existsSync(sibling) ? sibling : undefined;
}

/** Resolve a packaged `khora-daemon` binary (env, sibling, or PATH). */
export function resolveDaemonBinary(): string | undefined {
  const fromEnv = process.env.KHORA_DAEMON_BIN?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return siblingDaemonBinary() ?? findExecutableOnPath("khora-daemon");
}

export function daemonEntryPath(): string {
  return resolveDaemonBinary() ?? MONOREPO_DAEMON_ENTRY;
}

export function daemonSpawnCmd(flags?: FlagMap): string[] {
  const bin = resolveDaemonBinary();
  if (bin !== undefined) return [bin];
  void flags;
  return ["bun", "run", MONOREPO_DAEMON_ENTRY];
}

export function resolveCliDataDir(flags: FlagMap): string {
  const fromFlag = dataDirFromFlags(flags);
  if (fromFlag !== undefined) return fromFlag;
  const cfg = khoraCliResolvedConfig(flags);
  return resolveKhoraDataDir(cfg);
}

export function spawnDaemonEnv(flags: FlagMap): Record<string, string | undefined> {
  const cfg = khoraCliResolvedConfig(flags);
  const dataDir = resolveKhoraDataDir(cfg);
  return {
    ...process.env,
    KHORA_BASE_URL: cliBaseUrl(flags),
    KHORA_DATA_DIR: dataDir,
    KHORA_AGENT_KEY_PATH: agentIdentityPath(flags),
  };
}

export async function waitForDaemonPidFile(
  dataDir: string,
  timeoutMs = 15_000,
): Promise<KhoraDaemonControlFile> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readKhoraDaemonControlFile(dataDir);
    if (state !== undefined) return state;
    await Bun.sleep(50);
  }
  throw new Error(`timed out waiting for khora-daemon.json in ${dataDir}`);
}
