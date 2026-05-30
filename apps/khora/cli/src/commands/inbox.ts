import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, style } from "@khoralabs/cli-kit";
import {
  isProcessAlive,
  readKhoraDaemonControlFile,
  removeKhoraDaemonControlFile,
} from "@khoralabs/khora-daemon/control-pid";
import {
  DEFAULT_KHORA_BASE_URL,
  daemonJsonOutput,
  loadDaemonLayeredConfig,
  resolveKhoraDataDir,
} from "@khoralabs/khora-daemon/daemon-config";
import { pluginsFromDaemonConfig } from "@khoralabs/khora-daemon/plugins-from-config";
import { runKhoraInboxDaemon } from "@khoralabs/khora-daemon/run";
import {
  daemonSpawnCmd,
  resolveCliDataDir,
  spawnDaemonEnv,
  waitForDaemonPidFile,
} from "../daemon-spawn";
import { cliBaseUrl, loadSigner } from "../flows/context";
import { khoraCliResolvedConfig } from "../khora-app-config";

export async function handleInboxListen(flags: FlagMap): Promise<void> {
  const background = boolFlag(flags, "b") || boolFlag(flags, "background");

  if (background) {
    const dataDir = resolveCliDataDir(flags);
    const existing = readKhoraDaemonControlFile(dataDir);
    if (existing !== undefined && isProcessAlive(existing.pid)) {
      console.error(
        style.error(
          `Inbox daemon already running (pid ${existing.pid}). Run 'khora inbox stop' first.`,
        ),
      );
      process.exit(1);
    }
    Bun.spawn({
      cmd: daemonSpawnCmd(flags),
      env: spawnDaemonEnv(flags),
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });
    const state = await waitForDaemonPidFile(dataDir);
    console.log(`Inbox daemon started (pid ${state.pid}, did ${state.did})`);
    return;
  }

  const cfg = loadDaemonLayeredConfig();
  const json = daemonJsonOutput(cfg) || boolFlag(flags, "json") || process.argv.includes("--json");
  const baseUrl = cliBaseUrl(flags) || cfg.baseUrl?.trim() || DEFAULT_KHORA_BASE_URL;
  const dataDir = resolveKhoraDataDir(khoraCliResolvedConfig(flags));
  const signer = await loadSigner(flags);
  const plugins = pluginsFromDaemonConfig(cfg);

  const handle = runKhoraInboxDaemon({
    baseUrl,
    signer,
    dataDir,
    json,
    plugins,
  });

  await new Promise<void>((resolve) => {
    const onSignal = () => {
      handle.close();
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

export function handleInboxStop(flags: FlagMap): void {
  const dataDir = resolveCliDataDir(flags);
  const state = readKhoraDaemonControlFile(dataDir);
  if (state === undefined) {
    console.log("No inbox daemon pid file found.");
    return;
  }
  if (!isProcessAlive(state.pid)) {
    removeKhoraDaemonControlFile(dataDir);
    console.log(`Removed stale pid file (pid ${state.pid} not running).`);
    return;
  }
  process.kill(state.pid, "SIGTERM");
  removeKhoraDaemonControlFile(dataDir);
  console.log(`Stopped inbox daemon (pid ${state.pid}).`);
}

export function handleInboxStatus(flags: FlagMap): void {
  const json = boolFlag(flags, "json");
  const dataDir = resolveCliDataDir(flags);
  const state = readKhoraDaemonControlFile(dataDir);
  if (state === undefined) {
    if (json) {
      console.log(JSON.stringify({ status: "none", dataDir }));
    } else {
      console.log("Inbox daemon: not running (no pid file)");
    }
    return;
  }
  const alive = isProcessAlive(state.pid);
  const status = alive ? "running" : "stale";
  if (json) {
    console.log(JSON.stringify({ status, dataDir, ...state }));
    return;
  }
  console.log(`Inbox daemon: ${status}`);
  console.log(`  pid:      ${state.pid}`);
  console.log(`  did:      ${state.did}`);
  console.log(`  baseUrl:  ${state.baseUrl}`);
  console.log(`  started:  ${new Date(state.startedAtMs).toISOString()}`);
  if (!alive) {
    console.log("  (process not alive — run 'khora inbox stop' to clear pid file)");
  }
}
