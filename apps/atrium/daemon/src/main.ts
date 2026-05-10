#!/usr/bin/env bun
import { runInboxDaemon } from "./run-inbox-daemon.ts";

const baseUrl = process.env.ATRIUM_BASE_URL?.trim() || "http://127.0.0.1:8787";
const did = process.env.ATRIUM_AGENT_DID?.trim();
const json =
  process.argv.includes("--json") ||
  process.env.ATRIUM_DAEMON_JSON === "1" ||
  process.env.ATRIUM_DAEMON_JSON === "true";

if (did === undefined || did.length === 0) {
  console.error("Set ATRIUM_AGENT_DID to the agent DID (same as used with the CLI).");
  process.exit(1);
}

const handle = runInboxDaemon({ baseUrl, did, json });

process.on("SIGINT", () => {
  handle.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  handle.close();
  process.exit(0);
});
