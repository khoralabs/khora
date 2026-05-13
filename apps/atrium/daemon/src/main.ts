#!/usr/bin/env bun
import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/atrium-auth";
import { daemonAppConfig, daemonJsonOutput } from "./app-config.ts";
import { acquireDaemonLock, DaemonAlreadyRunningError } from "./daemon-pid.ts";
import { acquireRoomDaemonLock } from "./room-daemon-pid.ts";
import { runInboxDaemon } from "./run-inbox-daemon.ts";
import { runRoomDaemon } from "./run-room-daemon.ts";

async function loadSigner(): Promise<PersistableAgentSigner> {
  const p = daemonAppConfig.agentKeyPath ?? defaultIdentityPath();
  const signer = await loadIdentity(p);
  if (signer === undefined) {
    console.error(`No agent identity at ${p}. Run 'atrium key generate' first.`);
    process.exit(1);
  }
  return signer;
}

const kind = (process.env.ATRIUM_DAEMON_KIND ?? "inbox").trim().toLowerCase();
const baseUrl = daemonAppConfig.baseUrl ?? "http://127.0.0.1:8787";
const signer = await loadSigner();

let lock: { release(): void };
let handle: { close(): void };

if (kind === "room") {
  const roomId = process.env.ATRIUM_ROOM_ID?.trim();
  const webSocketUrl = process.env.ATRIUM_ROOM_WS_URL?.trim();
  if (roomId === undefined || roomId.length === 0) {
    console.error("Room daemon requires ATRIUM_ROOM_ID");
    process.exit(1);
  }
  if (webSocketUrl === undefined || webSocketUrl.length === 0) {
    console.error("Room daemon requires ATRIUM_ROOM_WS_URL");
    process.exit(1);
  }
  try {
    lock = acquireRoomDaemonLock(daemonAppConfig, roomId);
  } catch (e) {
    if (e instanceof DaemonAlreadyRunningError) {
      console.error(
        `${e.message} — another room handler holds this room; use 'atrium status' or 'atrium kill --pid ${e.pid}' (pid file: ${e.pidPath})`,
      );
      process.exit(1);
    }
    throw e;
  }
  handle = runRoomDaemon({
    baseUrl,
    signer,
    roomId,
    webSocketUrl,
    json: daemonJsonOutput,
    dataDir: daemonAppConfig.dataDir,
  });
} else {
  try {
    lock = acquireDaemonLock(daemonAppConfig);
  } catch (e) {
    if (e instanceof DaemonAlreadyRunningError) {
      console.error(`${e.message} — use 'atrium kill' to stop it (pid file: ${e.pidPath})`);
      process.exit(1);
    }
    throw e;
  }
  handle = runInboxDaemon({ baseUrl, signer, json: daemonJsonOutput });
}

function shutdown(): void {
  handle.close();
  lock.release();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
