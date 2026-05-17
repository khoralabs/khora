#!/usr/bin/env bun
import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/agent-persisted-signer";

import type { VellumPathConfig } from "@khoralabs/vellum-contracts";

import { runVellumDaemon } from "./run-vellum-daemon.ts";

function daemonJsonOutput(): boolean {
  return (
    process.env.VELLUM_DAEMON_JSON === "1" ||
    process.argv.includes("--json") ||
    process.argv.includes("-j")
  );
}

function daemonPathConfig(): VellumPathConfig {
  const dataDir =
    process.env.AT2_DATA_DIR?.trim() ?? process.env.ATRIUM_DATA_DIR?.trim();
  return { dataDir: dataDir !== undefined && dataDir.length > 0 ? dataDir : undefined };
}

async function loadSigner(): Promise<PersistableAgentSigner> {
  const p =
    process.env.AT2_AGENT_KEY_PATH?.trim() ??
    process.env.ATRIUM_AGENT_KEY_PATH?.trim() ??
    process.env.VELLUM_AGENT_KEY_PATH?.trim() ??
    defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Generate an Ed25519 identity first.`);
    process.exit(1);
  }
  return signer;
}

const json = daemonJsonOutput();
const roomId = process.env.VELLUM_ROOM_ID?.trim();
const webSocketUrl = process.env.VELLUM_ROOM_WS_URL?.trim();
const baseUrl = process.env.VELLUM_BASE_URL?.trim() ?? "http://127.0.0.1:8787";

if (roomId === undefined || roomId.length === 0) {
  console.error("VELLUM_ROOM_ID is required");
  process.exit(1);
}
if (webSocketUrl === undefined || webSocketUrl.length === 0) {
  console.error("VELLUM_ROOM_WS_URL is required");
  process.exit(1);
}

const signer = await loadSigner();
const handle = runVellumDaemon({
  baseUrl,
  signer,
  roomId,
  webSocketUrl,
  json,
  cfg: daemonPathConfig(),
});

function shutdown(): void {
  handle.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
