import fs from "node:fs";
import path from "node:path";
import type { PersistableAgentSigner } from "@khoralabs/atrium-auth";
import { AtriumClient } from "@khoralabs/atrium-client";
import { createObpSqlitePersistence, openObpDatabase } from "@khoralabs/obp-sqlite";
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
 * Hold an Atrium OBP room WebSocket with SQLite-backed persistence under {@link roomObpSqlitePath}.
 * Runner is intentionally idle (waits until {@link close}) so the relay stays open for future agents.
 */
export function runRoomDaemon(opts: RunRoomDaemonOptions): { close(): void } {
  const json = opts.json === true;
  const dataDir = opts.dataDir ?? daemonAppConfig.dataDir;
  const cfg = { dataDir };
  const sqlitePath = roomObpSqlitePath(cfg, opts.roomId);
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = openObpDatabase(sqlitePath);
  const ledgerSeq = createDurableLedgerSeq(db);
  const persistence = createObpSqlitePersistence(db, { ledgerSeq });

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
      logLine(json, "room_open", { roomId: opts.roomId, obpSqlite: sqlitePath });
      await client.connectAtriumRoomNegotiation(
        {
          webSocketUrl: opts.webSocketUrl,
          signer: frameSigner,
          persistence,
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
