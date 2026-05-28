import type { PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
import {
  isDerivedInboxKindEvent,
  KhoraClient,
  type KhoraPluginInstaller,
} from "@khoralabs/khora-client";

import { removeKhoraDaemonControlFile, writeKhoraDaemonControlFile } from "./control-pid.ts";
import { createInboxEventSink, type InboxEventSink } from "./inbox-event-sink.ts";

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export type RunKhoraInboxDaemonOptions = {
  baseUrl: string;
  signer: PersistableAgentSigner;
  dataDir: string;
  json: boolean;
  plugins?: readonly KhoraPluginInstaller[];
  /** Write khora-daemon.json after first successful WS open. Default true. */
  writePidFile?: boolean;
  sink?: InboxEventSink;
};

export type KhoraInboxDaemonHandle = {
  close(): void;
};

export function runKhoraInboxDaemon(opts: RunKhoraInboxDaemonOptions): KhoraInboxDaemonHandle {
  const sink = opts.sink ?? createInboxEventSink(opts.json);
  const writePid = opts.writePidFile !== false;
  let closed = false;
  let inboxClose: (() => void) | undefined;
  let pidWritten = false;

  const client = new KhoraClient({
    baseUrl: opts.baseUrl,
    signer: opts.signer,
    dataDir: opts.dataDir,
    plugins: opts.plugins,
  });

  const unsub = client.subscribe((event) => {
    if (!event.type.startsWith("inbox:")) return;
    if (isDerivedInboxKindEvent(event)) return;
    sink.onClientEvent(event);
  });

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  void (async () => {
    let backoffMs = MIN_BACKOFF_MS;
    while (!closed) {
      let sessionEnded = false;
      try {
        const handle = await client.connectInbox({
          onOpen: () => {
            backoffMs = MIN_BACKOFF_MS;
            sink.onLifecycle("inbox connected", { baseUrl: opts.baseUrl });
            if (writePid && !pidWritten) {
              writeKhoraDaemonControlFile(opts.dataDir, {
                pid: process.pid,
                did: opts.signer.did,
                baseUrl: opts.baseUrl,
                startedAtMs: Date.now(),
              });
              pidWritten = true;
            }
          },
          onClose: () => {
            sessionEnded = true;
            sink.onLifecycle("inbox disconnected");
          },
          onError: (err) => {
            sessionEnded = true;
            const msg = err instanceof Error ? err.message : String(err);
            sink.onLifecycle("inbox error", { error: msg });
          },
        });
        inboxClose = handle.close;
        while (!closed && !sessionEnded) {
          await sleep(200);
        }
        handle.close();
        inboxClose = undefined;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sink.onLifecycle("connect failed", { error: msg });
      }
      if (closed) break;
      sink.onLifecycle("reconnecting", { backoffMs });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  })();

  return {
    close() {
      closed = true;
      inboxClose?.();
      unsub();
      client.dispose();
      if (writePid) removeKhoraDaemonControlFile(opts.dataDir);
      sink.onLifecycle("stopped");
    },
  };
}
