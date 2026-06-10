import fs from "node:fs";
import path from "node:path";

import type { PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
import { KhoraClient } from "@khoralabs/khora-client";
import { validateNbcBindPayloadForPort } from "@khoralabs/nbc-bind-policy";
import type { JsonDocument } from "@khoralabs/obp-model";
import {
  createObpV2SqlitePersistenceClient,
  openObpV2Database,
} from "@khoralabs/obp-sqlite-persistence";
import { VellumChannelClient } from "@khoralabs/vellum-channel-client";
import {
  cfgDataDir,
  channelSqlitePath,
  type VellumPathConfig,
  vellumWsUpgradeProtocol,
} from "@khoralabs/vellum-contracts";

import { removeVellumControlFile, writeVellumControlFile } from "./control-pid";
import { startVellumControlServer, type VellumControlServerState } from "./control-server";
import { createFrameSignerFromPersistableAgent } from "./frame-signer";
import { ensureVellumMetaSchema, upsertChainRow } from "./vellum-sqlite-meta";

export type RunVellumDaemonOptions = {
  relayBaseUrl: string;
  signer: PersistableAgentSigner;
  channelId: string;
  webSocketUrl: string;
  json?: boolean;
  cfg: VellumPathConfig;
};

function logLine(json: boolean, label: string, payload: unknown): void {
  if (json) {
    console.log(JSON.stringify({ t: label, payload }));
  } else {
    console.log(`[${label}] ${JSON.stringify(payload)}`);
  }
}

/**
 * Hold a Vellum channel WebSocket with durable OBP v2 graph in SQLite and a local HTTP control plane.
 */
export function runVellumDaemon(opts: RunVellumDaemonOptions): {
  close(): void;
} {
  const json = opts.json === true;
  const ac = new AbortController();
  let disposed = false;
  let serverStop: (() => void) | undefined;

  const hold = new Promise<void>((resolve) => {
    ac.signal.addEventListener("abort", () => resolve(), { once: true });
  });

  void (async () => {
    const sqlitePath = channelSqlitePath(cfgDataDir(opts.cfg), opts.channelId);
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

    const db = openObpV2Database(sqlitePath);
    ensureVellumMetaSchema(db);
    const persistence = createObpV2SqlitePersistenceClient(db);

    const state: VellumControlServerState = {
      conn: undefined,
      handles: new Map(),
    };

    const frameSigner = await createFrameSignerFromPersistableAgent(opts.signer);
    const channelClient = new VellumChannelClient({
      relayBaseUrl: opts.relayBaseUrl,
      signer: opts.signer,
    });
    const client = new KhoraClient({
      baseUrl: opts.relayBaseUrl,
      signer: opts.signer,
    });

    try {
      logLine(json, "vellum_open", { channelId: opts.channelId, sqlitePath });
      const wsNonce = process.env.VELLUM_CHANNEL_WS_NONCE?.trim();
      const webSocketProtocols =
        wsNonce !== undefined && wsNonce.length > 0
          ? [vellumWsUpgradeProtocol(wsNonce)]
          : undefined;
      await client.connectRoom(
        {
          webSocketUrl: opts.webSocketUrl,
          webSocketProtocols,
          signer: frameSigner,
          client: persistence,
          validateBindPayload: (bindPolicy, bindPayload) =>
            validateNbcBindPayloadForPort(bindPolicy, bindPayload) as JsonDocument,
          handlers: {
            onSessionReady: async (handle) => {
              state.handles.set(handle.sessionId, handle);
              upsertChainRow(db, handle.sessionId, handle.init.genesis_hash, Date.now());
              logLine(json, "vellum_chain_ready", {
                sessionId: handle.sessionId,
              });
            },
          },
        },
        async (conn) => {
          state.conn = conn;
          const server = startVellumControlServer({
            state,
            db,
            isChainAllocated: (sessionId) =>
              channelClient.isChainAllocated(opts.channelId, sessionId),
          });
          serverStop = server.stop;
          writeVellumControlFile(opts.cfg, opts.channelId, {
            pid: process.pid,
            controlPort: server.port,
            channelId: opts.channelId,
          });
          logLine(json, "vellum_control", {
            hostname: server.hostname,
            port: server.port,
          });
          await hold;
        },
      );
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : String(e);
        logLine(json, "vellum_error", { channelId: opts.channelId, error: msg });
        console.error(msg);
      }
    } finally {
      serverStop?.();
      removeVellumControlFile(opts.cfg, opts.channelId);
      client.dispose();
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  })();

  return {
    close(): void {
      if (disposed) return;
      disposed = true;
      ac.abort();
    },
  };
}
