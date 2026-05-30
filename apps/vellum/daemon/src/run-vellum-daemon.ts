import fs from "node:fs";
import path from "node:path";

import type { PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
import { KhoraClient } from "@khoralabs/khora-client";
import type { JsonDocument } from "@khoralabs/obp-v2-model";
import {
  createObpV2SqlitePersistenceClient,
  openObpV2Database,
} from "@khoralabs/obp-v2-sqlite-persistence";
import { validateVellumBindPayloadForPort } from "@khoralabs/vellum-bind-policy";
import { cfgDataDir, roomObpSqlitePath, type VellumPathConfig } from "@khoralabs/vellum-contracts";

import { removeVellumControlFile, writeVellumControlFile } from "./control-pid";
import { startVellumControlServer, type VellumControlServerState } from "./control-server";
import { createFrameSignerFromPersistableAgent } from "./frame-signer";
import { ensureVellumMetaSchema, upsertChainRow } from "./vellum-sqlite-meta";

export type RunVellumDaemonOptions = {
  baseUrl: string;
  signer: PersistableAgentSigner;
  roomId: string;
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
 * Hold an Khora room WebSocket with durable OBP v2 graph in SQLite and a local HTTP control plane.
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
    const sqlitePath = roomObpSqlitePath(cfgDataDir(opts.cfg), opts.roomId);
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

    const db = openObpV2Database(sqlitePath);
    ensureVellumMetaSchema(db);
    const persistence = createObpV2SqlitePersistenceClient(db);

    const state: VellumControlServerState = {
      conn: undefined,
      handles: new Map(),
    };

    const frameSigner = await createFrameSignerFromPersistableAgent(opts.signer);
    const client = new KhoraClient({
      baseUrl: opts.baseUrl,
      signer: opts.signer,
    });

    try {
      logLine(json, "vellum_open", { roomId: opts.roomId, sqlitePath });
      await client.connectRoom(
        {
          webSocketUrl: opts.webSocketUrl,
          signer: frameSigner,
          client: persistence,
          validateBindPayload: (bindPolicy, bindPayload) =>
            validateVellumBindPayloadForPort(bindPolicy, bindPayload) as JsonDocument,
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
          const server = startVellumControlServer({ state, db });
          serverStop = server.stop;
          writeVellumControlFile(opts.cfg, opts.roomId, {
            pid: process.pid,
            controlPort: server.port,
            roomId: opts.roomId,
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
        logLine(json, "vellum_error", { roomId: opts.roomId, error: msg });
        console.error(msg);
      }
    } finally {
      serverStop?.();
      removeVellumControlFile(opts.cfg, opts.roomId);
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
