import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { createRelayCardStore, type RelayCardStore } from "./card-store.ts";
import { createRelayFrameQueue } from "./frame-queue.ts";
import { createIntentFanout, type IntentFanout } from "./intent-fanout.ts";
import { createRelayRoomHub, type RelayRoomHub } from "./room.ts";
import { createRelayFetchHandler, relayWebSocketHandlers } from "./routes.ts";

export type { AgentCard, RelayCardStore } from "./card-store.ts";
export { RELAY_CARD_NAMESPACE } from "./card-store.ts";
export type { RelayFrameQueue } from "./frame-queue.ts";
export type { IntentFanout, IntentMessage, InviteResponse } from "./intent-fanout.ts";
export type { RelayRoomHub } from "./room.ts";
export type { RelayWsData } from "./routes.ts";
export { ensureRelaySchema } from "./schema.ts";

export type RelayServerOptions = {
  hostname?: string;
  port?: number;
  /** Directory for relay.db, relay-memories.db, and lexical JSONL. */
  dataDir: string;
  /** Optional embedding model for semantic card search; omit for lexical-only. */
  embeddingModel?: EmbeddingModel;
  /** Interval for pruning expired rooms (ms). Default 3_600_000. Set 0 to disable. */
  pruneIntervalMs?: number;
};

export type RelayServer = {
  hostname: string;
  port: number;
  url: string;
  stop(): Promise<void>;
  cardStore: RelayCardStore;
  intents: IntentFanout;
  rooms: RelayRoomHub;
  /** Open SQLite handles (card store opens memories DB before state DB). */
  stateDb: Database;
  memoriesDb: Database;
};

function pruneExpiredRooms(db: Database): void {
  const now = Date.now();
  const rows = db.query(`SELECT session_id FROM rooms WHERE expires_at <= ?`).all(now) as {
    session_id: string;
  }[];
  for (const r of rows) {
    db.run(`DELETE FROM room_messages WHERE session_id = ?`, [r.session_id]);
    db.run(`DELETE FROM rooms WHERE session_id = ?`, [r.session_id]);
  }
}

/** Starts Bun.serve with cards, intents, rooms, and WebSocket frame relay. */
export function startRelayServer(options: RelayServerOptions): RelayServer {
  const dataDir = options.dataDir;
  mkdirSync(dataDir, { recursive: true });

  const statePath = join(dataDir, "relay.db");
  const memoriesPath = join(dataDir, "relay-memories.db");
  const memoriesRoot = join(dataDir, "memories");

  const { cardStore, stateDb, memoriesDb } = createRelayCardStore({
    stateDbPath: statePath,
    memoriesDbPath: memoriesPath,
    memoriesRoot,
    embeddingModel: options.embeddingModel,
  });

  const frameQueue = createRelayFrameQueue(stateDb);
  const intents = createIntentFanout();
  const rooms = createRelayRoomHub({ db: stateDb, frameQueue });

  const deps = { cardStore, intents, rooms };
  const fetch = createRelayFetchHandler(deps);
  const websocket = relayWebSocketHandlers(deps);

  const pruneMs = options.pruneIntervalMs ?? 3_600_000;
  let pruneTimer: Timer | undefined;
  if (pruneMs > 0) {
    pruneTimer = setInterval(() => {
      pruneExpiredRooms(stateDb);
    }, pruneMs);
  }

  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = Bun.serve({
    hostname,
    port,
    fetch,
    websocket,
  });

  const url = `http://${server.hostname}:${server.port}`;

  return {
    hostname: server.hostname,
    port: server.port,
    url,
    cardStore,
    intents,
    rooms,
    stateDb,
    memoriesDb,
    async stop() {
      if (pruneTimer !== undefined) {
        clearInterval(pruneTimer);
      }
      server.stop();
      stateDb.close();
      memoriesDb.close();
    },
  };
}

/** Default export runs a relay from `RELAY_DATA_DIR` or `./data/relay`. */
export default function main(): void {
  const dataDir = process.env.RELAY_DATA_DIR?.trim() || join(process.cwd(), "data", "relay");
  const portEnv = process.env.RELAY_PORT?.trim();
  const port = portEnv !== undefined && portEnv.length > 0 ? Number(portEnv) : 8787;
  const server = startRelayServer({
    dataDir,
    port: Number.isFinite(port) ? port : 8787,
    hostname: process.env.RELAY_HOST?.trim() || "127.0.0.1",
  });
  console.error(`[relay-server] listening ${server.url}`);
}

// Run when executed directly
if (import.meta.main) {
  main();
}
