#!/usr/bin/env bun
import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/agent-persisted-signer";

import {
  DEFAULT_KHORA_BASE_URL,
  daemonJsonOutput,
  loadDaemonLayeredConfig,
  resolveKhoraDataDir,
} from "./daemon-config";
import { pluginsFromDaemonConfig } from "./plugins-from-config";
import { runKhoraInboxDaemon } from "./run-khora-inbox-daemon";

async function loadSigner(agentKeyPath: string | undefined): Promise<PersistableAgentSigner> {
  const p =
    process.env.KHORA_AGENT_KEY_PATH?.trim() ?? agentKeyPath?.trim() ?? defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Run 'khora keygen' first.`);
    process.exit(1);
  }
  return signer;
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
