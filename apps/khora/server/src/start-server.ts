import { mkdirSync } from "node:fs";
import path from "node:path";

import type { KhoraWsData } from "@khoralabs/khora-transport";
import { bootstrapKhoraHost } from "./bootstrap-khora";
import { bootstrapKhoraEncryption } from "./encryption-bootstrap";
import type { HostRouteDeps } from "./http/deps";
import { route } from "./http/router";
import { createV2HostRateLimiters } from "./rate-limit-buckets";
import { createInboxDrainWebSocketHandlers } from "./ws/inbox";

const DEFAULT_CIPHER_KEY = "harness-test-cipher-key-32chars!";
const DEFAULT_OUTBOX_KEY_HEX = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

export type StartKhoraServerOptions = {
  dataDir: string;
  port?: number;
  sqlCipherKey?: string;
  /** 64-char hex string encoding 32 bytes of outbox field encryption key. */
  outboxKeyHex?: string;
  cellPoolCount?: number;
  useCellWorkers?: boolean;
};

export type KhoraServerHandle = {
  readonly port: number;
  readonly baseUrl: string;
  close(): void;
};

export async function startKhoraServer(opts: StartKhoraServerOptions): Promise<KhoraServerHandle> {
  process.env.KHORA_SQLCIPHER_KEY = opts.sqlCipherKey ?? DEFAULT_CIPHER_KEY;
  process.env.KHORA_OUTBOX_ENCRYPTION_KEY = opts.outboxKeyHex ?? DEFAULT_OUTBOX_KEY_HEX;

  const encryption = await bootstrapKhoraEncryption();

  const catalogPath = path.join(opts.dataDir, "khora-catalog.sqlite");
  const cellsDir = path.join(opts.dataDir, "cells");
  mkdirSync(opts.dataDir, { recursive: true });
  mkdirSync(cellsDir, { recursive: true });

  const ctx = await bootstrapKhoraHost({
    catalogPath,
    cellsDir,
    cellPoolCount: opts.cellPoolCount ?? 2,
    useCellWorkers: opts.useCellWorkers ?? false,
    encryption,
    startPrincipalTeardownWorker: false,
  });

  const deps: HostRouteDeps = {
    ctx,
    rateLimiters: createV2HostRateLimiters(),
    consoleAuth: null,
  };
  const inboxWsHandlers = createInboxDrainWebSocketHandlers({ ctx });

  const server = Bun.serve<KhoraWsData>({
    port: opts.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      const res = await route(req, url, server, deps);
      return res ?? new Response("Not found", { status: 404 });
    },
    websocket: inboxWsHandlers,
  });

  const port = server.port ?? opts.port ?? 0;
  return {
    port,
    baseUrl: `http://localhost:${port}`,
    close() {
      try {
        ctx.principalTeardownWorker.stop();
      } catch {
        /* ignore */
      }
      try {
        ctx.cluster.close();
      } catch {
        /* ignore */
      }
      try {
        ctx.memories?.close();
      } catch {
        /* ignore */
      }
      try {
        server.stop(false);
      } catch {
        /* ignore */
      }
    },
  };
}
