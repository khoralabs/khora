import type { PersistableAgentSigner } from "@khoralabs/atrium-auth";
import { AtriumClient } from "@khoralabs/atrium-client";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { createFrameSignerFromPersistableAgent } from "./agent-frame-signer.ts";
import { daemonAppConfig } from "./app-config.ts";

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
 * Hold an Atrium room WebSocket with in-memory OBP graph state for the v2 wire session
 * (relay envelopes supply NBC timing; no client-side ledger counter).
 */
export function runRoomDaemon(opts: RunRoomDaemonOptions): { close(): void } {
  const json = opts.json === true;
  const dataDir = opts.dataDir ?? daemonAppConfig.dataDir;
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
      logLine(json, "room_open", { roomId: opts.roomId });
      await client.connectAtriumRoom(
        {
          webSocketUrl: opts.webSocketUrl,
          signer: frameSigner,
          client: obpPersistence,
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
