import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createAt2Host, type At2HostContext } from "@khoralabs/at2-host";
import type { At2WsData } from "@khoralabs/at2-transport";
import { route, at2FrameChannelWsHandlers } from "./http/router.ts";
import { createInboxDrainWebSocketHandlers } from "./ws/inbox.ts";
import type { HostRouteDeps } from "./http/deps.ts";
import {
  envCatalogPath,
  envFramesDbPath,
  envHostDuplexIngress,
  envHostDuplexUnixPath,
  envHostUnaryIngress,
  envPort,
  envTenantKey,
} from "./env.ts";
import { createV2HostRateLimiters } from "./rate-limit-buckets.ts";
import { startDuplexUnixIngress } from "./server/duplex-unix-listener.ts";
import { startStdioUnaryIngress } from "./server/stdio-unary-listener.ts";

const catalogPath = envCatalogPath();
const framesDbPath = envFramesDbPath();
mkdirSync(dirname(catalogPath), { recursive: true });
mkdirSync(dirname(framesDbPath), { recursive: true });

const tenantKey = envTenantKey();
const ctx: At2HostContext = await createAt2Host({
  catalogPath,
  framesDbPath,
  ...(tenantKey !== undefined ? { tenantKey } : {}),
});

const deps: HostRouteDeps = { ctx, rateLimiters: createV2HostRateLimiters() };
const inboxWsHandlers = createInboxDrainWebSocketHandlers({ ctx });
const roomWsHandlers = at2FrameChannelWsHandlers(ctx);

const server = Bun.serve<At2WsData>({
  port: envPort(),
  async fetch(req) {
    const url = new URL(req.url);
    const res = await route(req, url, server, deps);
    return res ?? new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      if (ws.data.kind === "inbox") {
        inboxWsHandlers.open?.(ws as never);
      } else {
        roomWsHandlers.open(ws as never);
      }
    },
    close(ws, code, reason) {
      if (ws.data.kind === "inbox") {
        inboxWsHandlers.close?.(ws as never, code, reason);
      } else {
        roomWsHandlers.close(ws as never);
      }
    },
    message(ws, msg) {
      if (ws.data.kind === "inbox") {
        inboxWsHandlers.message(ws as never, msg);
      } else {
        roomWsHandlers.message(ws as never, msg);
      }
    },
  },
});

console.error(`[atrium-v2-server] listening on http://localhost:${server.port}`);

const unaryIngress = envHostUnaryIngress();
if (unaryIngress === "stdio") {
  console.warn("[atrium-v2-server] Unary ingress: stdio (NDJSON lines); parallel to HTTP.");
  void startStdioUnaryIngress(deps).catch((e) => {
    console.error("[atrium-v2-server] stdio unary ingress failed", e);
    process.exit(1);
  });
}

let duplexIngress: ReturnType<typeof startDuplexUnixIngress> | undefined;
const duplexMode = envHostDuplexIngress();
if (duplexMode === "unix") {
  const duplexUnixPath = envHostDuplexUnixPath();
  mkdirSync(dirname(duplexUnixPath), { recursive: true });
  try {
    unlinkSync(duplexUnixPath);
  } catch {
    /* stale socket may not exist */
  }
  duplexIngress = startDuplexUnixIngress({ deps, unixPath: duplexUnixPath });
}

function shutdown(signal: NodeJS.Signals): void {
  console.error(`[atrium-v2-server] received ${signal}; shutting down`);
  try {
    server.stop();
  } catch {
    /* already stopped */
  }
  try {
    duplexIngress?.stop(true);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
