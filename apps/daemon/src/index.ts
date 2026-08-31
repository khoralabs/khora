#!/usr/bin/env bun
import { loadIdentity, type PersistableSigner } from "@khoralabs/did-key-identity";
import {
  DEFAULT_KHORA_BASE_URL,
  defaultIdentityPath,
  resolveKhoraDataDir,
} from "@khoralabs/khora-client";
import { daemonJsonOutput, loadDaemonLayeredConfig } from "./daemon-config";
import { printDaemonHelp } from "./daemon-help";
import { pluginsFromDaemonConfig } from "./plugins-from-config";
import { runKhoraInboxDaemon } from "./run-khora-inbox-daemon";

async function loadSigner(agentKeyPath: string | undefined): Promise<PersistableSigner> {
  const p =
    process.env.KHORA_AGENT_KEY_PATH?.trim() ?? agentKeyPath?.trim() ?? defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Run 'khora keygen' first.`);
    process.exit(1);
  }
  return signer;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printDaemonHelp();
    process.exit(argv.length === 0 ? 1 : 0);
    return;
  }

  const cfg = loadDaemonLayeredConfig();
  const json =
    daemonJsonOutput(cfg) || process.argv.includes("--json") || process.argv.includes("-j");
  const baseUrl = cfg.baseUrl?.trim() || DEFAULT_KHORA_BASE_URL;
  const dataDir = resolveKhoraDataDir(cfg);
  const signer = await loadSigner(cfg.agentKeyPath);
  const plugins = pluginsFromDaemonConfig(cfg);

  const handle = runKhoraInboxDaemon({
    baseUrl,
    signer,
    dataDir,
    json,
    plugins,
  });

  function shutdown(): void {
    handle.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await main();
