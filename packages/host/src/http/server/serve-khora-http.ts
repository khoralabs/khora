import { mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { KhoraWsData } from "@khoralabs/khora-client/transport";
import type { Logger } from "@khoralabs/observability/logger";
import type { Server } from "bun";
import { logger as defaultLogger } from "../logger";
import { runWithRequestPeerIp } from "../rate-limit";
import type { HostRouteDeps } from "../routes/deps";
import { createHostRouter } from "../routes/router";
import { createInboxDrainWebSocketHandlersForDeps } from "../ws/inbox";
import { startDuplexUnixIngress } from "./duplex-unix-listener";
import { startStdioUnaryIngress } from "./stdio-unary-listener";

export type ServeKhoraHttpFetch = (
  req: Request,
  server: Server<KhoraWsData>,
  helpers: {
    deps: HostRouteDeps;
    route: ReturnType<typeof createHostRouter>["route"];
  },
) => Response | Promise<Response>;

export type ServeKhoraHttpOpts = {
  deps: HostRouteDeps;
  port: number;
  /** Override Bun.serve fetch (e.g. app OTel). Default: peer IP + route + error handling. */
  fetch?: ServeKhoraHttpFetch;
  /** When `"stdio"`, start NDJSON unary ingress alongside HTTP. */
  unaryIngress?: "stdio";
  /** When set, start duplex Unix ingress at this path. */
  duplexUnixPath?: string;
  logger?: Logger;
  onListening?: (info: { port: number | undefined }) => void;
  shutdownTimeoutMs?: number;
};

/**
 * Serve host HTTP/WS (and optional ingress), then block until SIGTERM/SIGINT.
 * Does not resolve persistence paths, open DBs, or apply packaged-runtime branding.
 */
export async function serveKhoraHttp(opts: ServeKhoraHttpOpts): Promise<void> {
  const log = opts.logger ?? defaultLogger;
  const { deps } = opts;
  const { ctx } = deps;
  const { route } = createHostRouter({
    hostSpec: ctx.hostSpec,
  });
  const inboxWsHandlers = createInboxDrainWebSocketHandlersForDeps({
    ctx,
    rateLimiters: deps.rateLimiters,
  });

  const defaultFetch: ServeKhoraHttpFetch = async (req, server, { route: r, deps: d }) => {
    const peerIp = server.requestIP(req)?.address ?? null;
    return runWithRequestPeerIp(peerIp, async () => {
      const url = new URL(req.url);
      try {
        const res = await r(req, url, server, d);
        return res ?? new Response("Not found", { status: 404 });
      } catch (err) {
        log.error({ err }, "unhandled fetch error");
        return new Response("Internal server error", { status: 500 });
      }
    });
  };

  const fetchImpl = opts.fetch ?? defaultFetch;

  const server = Bun.serve<KhoraWsData>({
    port: opts.port,
    async fetch(req, srv) {
      return fetchImpl(req, srv, { deps, route });
    },
    websocket: inboxWsHandlers,
  });

  opts.onListening?.({ port: server.port });

  if (opts.unaryIngress === "stdio") {
    log.info("Unary ingress: stdio (NDJSON lines); parallel to HTTP.");
    void startStdioUnaryIngress(deps).catch((e) => {
      log.fatal({ err: e }, "stdio unary ingress failed");
      process.exit(1);
    });
  }

  let duplexIngress: ReturnType<typeof startDuplexUnixIngress> | undefined;
  if (opts.duplexUnixPath !== undefined) {
    const duplexUnixPath = opts.duplexUnixPath;
    mkdirSync(path.dirname(duplexUnixPath), { recursive: true });
    try {
      unlinkSync(duplexUnixPath);
    } catch {
      /* stale socket may not exist */
    }
    duplexIngress = startDuplexUnixIngress({ deps, unixPath: duplexUnixPath });
  }

  const shutdownTimeoutMs = opts.shutdownTimeoutMs ?? 10_000;

  await new Promise<void>((_resolve, reject) => {
    function shutdown(signal: NodeJS.Signals): void {
      log.info({ signal }, "draining and shutting down");

      setTimeout(() => {
        log.error("shutdown timeout; forcing exit");
        process.exit(1);
      }, shutdownTimeoutMs).unref();

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
        ctx.search?.close();
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
      log.fatal({ err }, "uncaughtException");
      reject(err);
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      log.fatal({ reason }, "unhandledRejection");
      reject(reason instanceof Error ? reason : new Error(String(reason)));
      process.exit(1);
    });
  });
}
