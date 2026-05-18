#!/usr/bin/env bun
import { existsSync } from "node:fs";

import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/agent-persisted-signer";
import {
  defaultVellumDaemonConfigPath,
  loadVellumAppConfig,
  VELLUM_CANONICAL_BASE_URL,
  vellumAppConfigBuiltinDefaults,
  vellumAppConfigFromEnv,
  zVellumAppConfigBase,
} from "@khoralabs/vellum-client";
import type { VellumPathConfig } from "@khoralabs/vellum-contracts";

import { runVellumDaemon } from "./run-vellum-daemon.ts";

function daemonJsonOutput(vcfg: { daemonJson?: boolean }): boolean {
  return (
    process.env.VELLUM_DAEMON_JSON === "1" ||
    process.argv.includes("--json") ||
    process.argv.includes("-j") ||
    vcfg.daemonJson === true
  );
}

function daemonPathConfig(vcfg: { dataDir?: string }): VellumPathConfig {
  const dataDir =
    process.env.AT2_DATA_DIR?.trim() ??
    process.env.ATRIUM_DATA_DIR?.trim() ??
    vcfg.dataDir?.trim();
  return { dataDir: dataDir !== undefined && dataDir.length > 0 ? dataDir : undefined };
}

function loadDaemonLayeredConfig() {
  const p = defaultVellumDaemonConfigPath();
  return loadVellumAppConfig({
    schema: zVellumAppConfigBase,
    layers: [vellumAppConfigBuiltinDefaults(), vellumAppConfigFromEnv()],
    filePath: existsSync(p) ? p : null,
    filePathExplicit: false,
  }).config;
}

async function loadSigner(vcfg: { agentKeyPath?: string }): Promise<PersistableAgentSigner> {
  const p =
    process.env.AT2_AGENT_KEY_PATH?.trim() ??
    process.env.ATRIUM_AGENT_KEY_PATH?.trim() ??
    process.env.VELLUM_AGENT_KEY_PATH?.trim() ??
    vcfg.agentKeyPath?.trim() ??
    defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Generate an Ed25519 identity first.`);
    process.exit(1);
  }
  return signer;
}

const vcfg = loadDaemonLayeredConfig();

const json = daemonJsonOutput(vcfg);
const roomId =
  process.env.VELLUM_ROOM_ID?.trim() ?? vcfg.defaultRoomId?.trim() ?? "";
const webSocketUrl =
  process.env.VELLUM_ROOM_WS_URL?.trim() ?? vcfg.defaultRoomWebSocketUrl?.trim() ?? "";
const baseUrl = vcfg.baseUrl?.trim() ?? VELLUM_CANONICAL_BASE_URL;

if (roomId.length === 0) {
  console.error("VELLUM_ROOM_ID is required (or set defaultRoomId in ~/.vellum/daemon.config.json)");
  process.exit(1);
}
if (webSocketUrl.length === 0) {
  console.error(
    "VELLUM_ROOM_WS_URL is required (or set defaultRoomWebSocketUrl in ~/.vellum/daemon.config.json)",
  );
  process.exit(1);
}

const signer = await loadSigner(vcfg);
const handle = runVellumDaemon({
  baseUrl,
  signer,
  roomId,
  webSocketUrl,
  json,
  cfg: daemonPathConfig(vcfg),
});

function shutdown(): void {
  handle.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
