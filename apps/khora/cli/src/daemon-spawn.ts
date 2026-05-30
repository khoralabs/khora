import { fileURLToPath } from "node:url";
import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import {
  type KhoraDaemonControlFile,
  readKhoraDaemonControlFile,
} from "@khoralabs/khora-daemon/control-pid";
import { resolveKhoraDataDir } from "@khoralabs/khora-daemon/daemon-config";

import { agentIdentityPath, cliBaseUrl } from "./flows/context";
import { khoraCliResolvedConfig } from "./khora-app-config";

export function daemonEntryPath(): string {
  const fromEnv = process.env.KHORA_DAEMON_BIN?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  return fileURLToPath(new URL("../../daemon/src/index.ts", import.meta.url));
}

export function daemonSpawnCmd(flags?: FlagMap): string[] {
  const bin = process.env.KHORA_DAEMON_BIN?.trim();
  if (bin !== undefined && bin.length > 0) return [bin];
  void flags;
  return ["bun", "run", daemonEntryPath()];
}

export function resolveCliDataDir(flags: FlagMap): string {
  const fromFlag = strFlag(flags, "data-dir") ?? strFlag(flags, "dataDir");
  if (fromFlag !== undefined && fromFlag.trim().length > 0) return fromFlag.trim();
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
