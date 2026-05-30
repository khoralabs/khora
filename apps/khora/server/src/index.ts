import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { createConsoleAuthFromEnv } from "@khoralabs/khora-console";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import type { KhoraWsData } from "@khoralabs/khora-transport";
import { bootstrapKhoraHost } from "./bootstrap-khora.ts";
import { bootstrapKhoraEncryption } from "./encryption-bootstrap.ts";
import {
  envCellPoolCount,
  envColonnadeUseCellWorkers,
  envHostDuplexIngress,
  envHostDuplexUnixPath,
  envHostUnaryIngress,
  envPort,
  envTenantKey,
  resolveKhoraPersistencePaths,
  validateEnv,
} from "./env.ts";
import type { HostRouteDeps } from "./http/deps.ts";
import { khoraFrameChannelWsHandlers, route } from "./http/router.ts";
import { logger } from "./logger.ts";
import { envMemoriesBootstrapConfig } from "./memories-env.ts";
import { createV2HostRateLimiters } from "./rate-limit-buckets.ts";
import { maybeRegistryOptInOnStartup } from "./registry-opt-in.ts";
import adminPage from "./routes/admin/index.html";
import adminLoginPage from "./routes/admin/login/index.html";
import { startDuplexUnixIngress } from "./server/duplex-unix-listener.ts";
import { startStdioUnaryIngress } from "./server/stdio-unary-listener.ts";
import { createInboxDrainWebSocketHandlers } from "./ws/inbox.ts";

validateEnv();

const persistencePaths = resolveKhoraPersistencePaths();
const { catalogPath, framesDbPath, cellsDir, dataDir } = persistencePaths;
const cellPoolCount = envCellPoolCount();
const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);
mkdirSync(dataDir, { recursive: true });
mkdirSync(dirname(catalogPath), { recursive: true });
mkdirSync(dirname(framesDbPath), { recursive: true });
mkdirSync(cellsDir, { recursive: true });
if (memoriesConfig !== undefined) {
  mkdirSync(dirname(memoriesConfig.dbPath), { recursive: true });
}

const tenantKey = envTenantKey();
const encryption = await bootstrapKhoraEncryption();
const ctx: KhoraHostContext = await bootstrapKhoraHost({
  catalogPath,
  framesDbPath,
  cellsDir,
  cellPoolCount,
  useCellWorkers: envColonnadeUseCellWorkers(),
  encryption,
  ...(tenantKey !== undefined ? { tenantKey } : {}),
  ...(memoriesConfig !== undefined ? { memories: memoriesConfig } : {}),
});

const consoleAuth = createConsoleAuthFromEnv();
if (consoleAuth === null) {
  logger.info("Admin console disabled (set KHORA_CONSOLE_ROOT_TOKEN to enable)");
} else {
  logger.info("Admin console enabled at /admin");
}

const deps: HostRouteDeps = {
  ctx,
  rateLimiters: createV2HostRateLimiters(),
  consoleAuth,
};
const inboxWsHandlers = createInboxDrainWebSocketHandlers({ ctx });
const roomWsHandlers = khoraFrameChannelWsHandlers(ctx);

const server = Bun.serve<KhoraWsData>({
  port: envPort(),
  routes: {
    "/admin": adminPage,
    "/admin/": adminPage,
    "/admin/login": adminLoginPage,
    "/admin/login/": adminLoginPage,
  },
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
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
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

maybeRegistryOptInOnStartup();

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

  setTimeout(() => {
    logger.error("shutdown timeout; forcing exit");
    process.exit(1);
  }, 10_000).unref();

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
