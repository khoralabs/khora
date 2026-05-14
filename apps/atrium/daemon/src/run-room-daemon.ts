import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { PersistableAgentSigner } from "@khoralabs/atrium-auth";
import { AtriumClient } from "@khoralabs/atrium-client";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { createFrameSignerFromPersistableAgent } from "./agent-frame-signer.ts";
import { daemonAppConfig } from "./app-config.ts";
import { createDurableLedgerSeq } from "./obp-ledger-seq.ts";
import { roomObpSqlitePath } from "./obp-store.ts";

export type RunRoomDaemonOptions = {
  baseUrl: string;
  signer: PersistableAgentSigner;
  roomId: string;
  webSocketUrl: string;
  json?: boolean;
  /** Overrides `ATRIUM_DATA_DIR` / config when set. */
  dataDir?: string;
};

function logLine(json: boolean, label: string, payload: unknown): void {
  if (json) {
    console.log(JSON.stringify({ t: label, payload }));
  } else {
    console.log(`[${label}] ${JSON.stringify(payload)}`);
  }
}

/**
 * Hold an Atrium negotiation-room WebSocket with durable `ledgerSeq` in SQLite (same path as the
 * legacy OBP store) and in-memory graph state for the v2 wire session.
 */
export function runRoomDaemon(opts: RunRoomDaemonOptions): { close(): void } {
  const json = opts.json === true;
  const dataDir = opts.dataDir ?? daemonAppConfig.dataDir;
  const cfg = { dataDir };
  const sqlitePath = roomObpSqlitePath(cfg, opts.roomId);
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath, { create: true });
  const ledgerSeq = createDurableLedgerSeq(db);
  const obpPersistence = createInMemoryObpPersistenceClient();

  const ac = new AbortController();
  let disposed = false;
  const hold = new Promise<void>((_, reject) => {
    ac.signal.addEventListener(
      "abort",
      () => {
        reject(new Error("room daemon closed"));
      },
      { once: true },
    );
  });

  void (async () => {
    const frameSigner = await createFrameSignerFromPersistableAgent(opts.signer);
    const client = new AtriumClient({
      baseUrl: opts.baseUrl,
      signer: opts.signer,
      ...(dataDir !== undefined ? { dataDir } : {}),
    });
    try {
      logLine(json, "room_open", { roomId: opts.roomId, ledgerSqlite: sqlitePath });
      await client.connectAtriumRoomNegotiation(
        {
          webSocketUrl: opts.webSocketUrl,
          signer: frameSigner,
          client: obpPersistence,
          ledgerSeq,
        },
        async () => {
          await hold;
        },
      );
    } catch (e) {
      if (ac.signal.aborted) {
        // Expected when the process is shutting down.
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        logLine(json, "room_error", { roomId: opts.roomId, error: msg });
        console.error(msg);
      }
    } finally {
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
