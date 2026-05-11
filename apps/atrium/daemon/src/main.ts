#!/usr/bin/env bun
import { defaultIdentityPath, loadIdentity, type PersistableAgentSigner } from "@cfd/atrium-auth";
import { daemonAppConfig, daemonJsonOutput } from "./app-config.ts";
import { runInboxDaemon } from "./run-inbox-daemon.ts";

async function loadSigner(): Promise<PersistableAgentSigner> {
  const p = daemonAppConfig.agentKeyPath ?? defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Run 'atrium key generate' first.`);
    process.exit(1);
  }
  return signer;
}

const baseUrl = daemonAppConfig.baseUrl ?? "http://127.0.0.1:8787";
const signer = await loadSigner();
const handle = runInboxDaemon({ baseUrl, signer, json: daemonJsonOutput });

process.on("SIGINT", () => {
  handle.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  handle.close();
  process.exit(0);
});
