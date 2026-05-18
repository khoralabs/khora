import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AtriumHostContext,
  createAtriumHost,
  RELAY_INBOX_SOURCE_MAP_ID,
} from "@khoralabs/at2-host";
import type { AtriumWsData } from "@khoralabs/at2-transport";
import { startPrincipalTeardownWorker } from "@khoralabs/relay-colonnade";
import {
  envCatalogPath,
  envFramesDbPath,
  envHostDuplexIngress,
  envHostDuplexUnixPath,
  envHostUnaryIngress,
  envPort,
  envTenantKey,
  validateEnv,
} from "./env.ts";
import type { HostRouteDeps } from "./http/deps.ts";
import { logger } from "./logger.ts";
import { at2FrameChannelWsHandlers, route } from "./http/router.ts";
import { createV2HostRateLimiters } from "./rate-limit-buckets.ts";
import { startDuplexUnixIngress } from "./server/duplex-unix-listener.ts";
import { startStdioUnaryIngress } from "./server/stdio-unary-listener.ts";
import { createInboxDrainWebSocketHandlers } from "./ws/inbox.ts";

validateEnv();

const catalogPath = envCatalogPath();
const framesDbPath = envFramesDbPath();
mkdirSync(dirname(catalogPath), { recursive: true });
mkdirSync(dirname(framesDbPath), { recursive: true });

const tenantKey = envTenantKey();
const ctx: AtriumHostContext = await createAtriumHost({
  catalogPath,
  framesDbPath,
  ...(tenantKey !== undefined ? { tenantKey } : {}),
});

const teardownWorker = startPrincipalTeardownWorker({
  catalogDb: ctx.catalogDb,
  framesDb: ctx.framesDb,
  store: ctx.store,
  persistence: ctx.host.persistence,
  tenantKey: ctx.tenantKey,
  relayInboxSourceMapId: RELAY_INBOX_SOURCE_MAP_ID,
});

const deps: HostRouteDeps = { ctx, rateLimiters: createV2HostRateLimiters() };
const inboxWsHandlers = createInboxDrainWebSocketHandlers({ ctx });
const roomWsHandlers = at2FrameChannelWsHandlers(ctx);

const server = Bun.serve<AtriumWsData>({
  port: envPort(),
  async fetch(req) {
    const url = new URL(req.url);
    try {
      const res = await route(req, url, server, deps);
      return res ?? new Response("Not found", { status: 404 });
    } catch (err) {
      logger.error({ err }, "unhandled fetch error");
      return new Response("Internal server error", { status: 500 });
    }
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

logger.info({ port: server.port }, "listening");

const unaryIngress = envHostUnaryIngress();
if (unaryIngress === "stdio") {
  logger.info("Unary ingress: stdio (NDJSON lines); parallel to HTTP.");
  void startStdioUnaryIngress(deps).catch((e) => {
    logger.fatal({ err: e }, "stdio unary ingress failed");
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
  logger.info({ signal }, "draining and shutting down");

  // Force-exit if graceful drain takes too long.
  setTimeout(() => {
    logger.error("shutdown timeout; forcing exit");
    process.exit(1);
  }, 10_000).unref();

  try {
    teardownWorker.stop();
  } catch {
    /* ignore */
  }
  try {
    // false = finish in-flight requests before closing
    server.stop(false);
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

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandledRejection");
  process.exit(1);
});
