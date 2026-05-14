import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AgentRelayFrameChannelWsData,
  agentRelayFrameChannelWebSocketHandlers,
} from "@khoralabs/agent-relay";
import { createAtriumDidAuth } from "@khoralabs/atrium-auth";
import type { ServerWebSocket } from "bun";
import { createAtriumHostContext } from "./create-atrium-host.ts";
import {
  envDbPath,
  envInboxSnapshotLimit,
  envIntervalMs,
  envPort,
  envPostNamespace,
  envProbeNamespace,
  envProfileNamespace,
} from "./env.ts";
import type { HostRouteDeps } from "./http/deps.ts";
import { loadPublicProfileForDid } from "./http/profile.ts";
import { route } from "./http/router.ts";
import {
  type AtriumInvitesRepo,
  createAtriumInvitesRepo,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./invites/index.ts";
import { type LitestreamHandle, maybeStartLitestream } from "./persistence/litestream/index.ts";
import { createHostRateLimiters } from "./rate-limit-buckets.ts";
import { type AtriumWsData, createInboxWsHandlers } from "./ws/inbox.ts";

const dbPath = envDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

// Restore-from-replica + start the replicator BEFORE opening the SQLite DB so
// that a fresh disk on a new Render deploy gets repopulated from S3 first.
// `maybeStartLitestream` is a no-op when LITESTREAM_S3_BUCKET is unset.
const litestream: LitestreamHandle | undefined = await maybeStartLitestream({ dbPath });

const walIntervalMs = envIntervalMs("ATRIUM_SQLITE_WAL_CHECKPOINT_INTERVAL_MS");
const analyzeIntervalMs = envIntervalMs("ATRIUM_SQLITE_ANALYZE_INTERVAL_MS");

const ctx = createAtriumHostContext({
  dbPath,
  profileNamespace: envProfileNamespace(),
  postNamespace: envPostNamespace(),
  probeNamespace: envProbeNamespace(),
  auth: (db) => createAtriumDidAuth({ db }),
  sqliteMaintenance: {
    ...(walIntervalMs !== undefined ? { walCheckpointIntervalMs: walIntervalMs } : {}),
    ...(analyzeIntervalMs !== undefined ? { analyzeIntervalMs } : {}),
  },
});

const seedInviteTokens = parseInviteSeedTokens(process.env.ATRIUM_INVITE_SEED_TOKENS);
validateInviteEnvConfig(seedInviteTokens);
const invitePepper = readInvitePepper();
const invitesRepo: AtriumInvitesRepo | undefined =
  invitePepper !== undefined ? createAtriumInvitesRepo(ctx.db, invitePepper) : undefined;
if (invitesRepo !== undefined) {
  invitesRepo.insertSeedInviteTokens(seedInviteTokens);
  const rootPlain = invitesRepo.ensureRootInviteIfAbsent();
  if (rootPlain !== undefined) {
    console.warn(
      `[atrium] Root invite token (single use; save this; not shown again): ${rootPlain}`,
    );
  }
}

const deps: HostRouteDeps = {
  ctx,
  invitesRepo,
  rateLimiters: createHostRateLimiters(),
  loadPublicProfileForDid: (did) => loadPublicProfileForDid(ctx, did),
};

const inboxWsHandlers = createInboxWsHandlers({ ctx, snapshotLimit: envInboxSnapshotLimit });
const roomWsHandlers = agentRelayFrameChannelWebSocketHandlers({
  hub: ctx.roomHub,
});

const server = Bun.serve<AtriumWsData>({
  port: envPort(),
  async fetch(req, srv) {
    const url = new URL(req.url);
    const res = await route(req, url, srv, deps);
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
        (roomWsHandlers.close as (ws: ServerWebSocket<AgentRelayFrameChannelWsData>) => void)(
          ws as never,
        );
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

console.log(`Atrium host listening on http://localhost:${server.port}`);

if (litestream !== undefined) {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[atrium-host] received ${signal}; shutting down`);
    try {
      server.stop();
    } catch {
      /* server may already be down */
    }
    await litestream.stop();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
