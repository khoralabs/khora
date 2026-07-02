import path from "node:path";

import { loadIdentity } from "@khoralabs/agent-persisted-signer";
import { type AgentHandle, AgentStore, ManagedAgentPool } from "@khoralabs/khora-managed-agents";
import { startKhoraServer } from "@khoralabs/khora-server/start-server";
import { createNoAuthProvider, MemoriesServiceClient } from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";
import {
  type AgentChatClient,
  createSignedChatService,
  type HarnessChat,
  type SignedChatBackend,
} from "./chat";
import { startMemoriesService } from "./memories";
import {
  emitNetworkEvent,
  getNetworkLogContext,
  networkEventId,
} from "./observability/network-log.ts";
import { startRelayServer } from "./relay";

export type NetworkHarnessOptions = {
  dataDir: string;
  /** Override the port the khora server binds to. Defaults to a random free port. */
  serverPort?: number;
  /** Override the port the memories service binds to. Defaults to a random free port. */
  memoriesPort?: number;
  /** Override the port the relay server binds to. Defaults to a random free port. */
  relayPort?: number;
  sqlCipherKey?: string;
  outboxKeyHex?: string;
  cellPoolCount?: number;
};

export type NetworkHarnessHandle = {
  /** Base URL of the running khora server. */
  readonly serverBaseUrl: string;
  /** Base URL of the relay server (for vellum channel operations). */
  readonly relayBaseUrl: string;
  /** Base URL of the shared memories service. */
  readonly memoriesBaseUrl: string;
  /** All agent DIDs currently in the pool. */
  readonly agentDids: readonly string[];
  /**
   * Client for the memories management API. Use this to open, close, delete,
   * or inspect any agent's database by passing their `MemoriesDatabaseId`.
   */
  readonly memoriesClient: MemoriesServiceClient;
  /** The underlying managed agent pool — use for `focus`, `spawn`, `remove`. */
  readonly pool: ManagedAgentPool;
  /** Shared chat interface — each agent gets a scoped client via `forAgent(did)`. */
  readonly chat: HarnessChat;
  /** Underlying signed chat backend (service + db). */
  readonly signedChat: SignedChatBackend;
  /** Tear down the server and memories service. Does not unregister agents. */
  stop(): void;
};

/** A bound memories client scoped to a single agent's database. */
export type AgentMemoriesClient = {
  /** The `MemoriesDatabaseId` for this agent. Pass to `MemoriesServiceClient` for raw access. */
  readonly database: MemoriesDatabaseId;
  open(): Promise<void>;
  close(): Promise<void>;
  checkpoint(): Promise<void>;
  exists(): Promise<boolean>;
  delete(): Promise<void>;
  /** The underlying service client, for operations not covered by the shortcuts above. */
  readonly serviceClient: MemoriesServiceClient;
};

/** An `AgentHandle` paired with pre-bound memories and chat clients. */
export type AgentWithMemories = {
  readonly did: string;
  readonly agentHandle: AgentHandle;
  readonly memories: AgentMemoriesClient;
  readonly chat: AgentChatClient;
};

export async function startNetworkHarness(
  opts: NetworkHarnessOptions,
): Promise<NetworkHarnessHandle> {
  const serverDataDir = path.join(opts.dataDir, "server");
  const memoriesDataDir = path.join(opts.dataDir, "memories");
  const agentsDataDir = path.join(opts.dataDir, "agents");
  const relayDataDir = path.join(opts.dataDir, "relay");

  // Memories must start first — it calls Database.setCustomSQLite which must
  // run before any bun:sqlite Database is opened by the khora or relay servers.
  const memories = startMemoriesService({
    dataDir: memoriesDataDir,
    sqlCipherKey: opts.sqlCipherKey ?? "harness-memories-key",
    port: opts.memoriesPort,
  });

  const server = await startKhoraServer({
    dataDir: serverDataDir,
    port: opts.serverPort,
    sqlCipherKey: opts.sqlCipherKey,
    outboxKeyHex: opts.outboxKeyHex,
    cellPoolCount: opts.cellPoolCount,
    useCellWorkers: false,
    enableMemories: true,
  });

  const relay = await startRelayServer({
    dataDir: relayDataDir,
    port: opts.relayPort,
    sqlCipherKey: opts.sqlCipherKey,
  });

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memories.baseUrl,
    auth: createNoAuthProvider(),
  });

  const pool = await ManagedAgentPool.create({
    dataDir: agentsDataDir,
    baseUrl: server.baseUrl,
  });

  const signedChat = createSignedChatService(opts.dataDir, {
    resolveSigner: (did) => loadIdentity(AgentStore.keyPath(agentsDataDir, did)),
  });
  const chat: HarnessChat = {
    forAgent(did: string) {
      return signedChat.forAgent(did);
    },
  };

  const logContext = getNetworkLogContext();
  if (logContext !== undefined && logContext.dataDir === opts.dataDir) {
    void emitNetworkEvent({
      dataDir: opts.dataDir,
      eventId: networkEventId({
        sessionId: logContext.sessionId,
        kind: "harness.started",
      }),
      sessionId: logContext.sessionId,
      tsMs: Date.now(),
      source: "harness",
      kind: "harness.started",
      message: "Network harness started",
      payload: {
        serverBaseUrl: server.baseUrl,
        relayBaseUrl: relay.baseUrl,
        memoriesBaseUrl: memories.baseUrl,
      },
    });
  }

  return {
    serverBaseUrl: server.baseUrl,
    relayBaseUrl: relay.baseUrl,
    memoriesBaseUrl: memories.baseUrl,
    get agentDids() {
      return pool.list();
    },
    memoriesClient,
    pool,
    chat,
    signedChat,
    stop() {
      const ctx = getNetworkLogContext();
      if (ctx !== undefined && ctx.dataDir === opts.dataDir) {
        void emitNetworkEvent({
          dataDir: opts.dataDir,
          eventId: networkEventId({
            sessionId: ctx.sessionId,
            kind: "harness.stopped",
          }),
          sessionId: ctx.sessionId,
          tsMs: Date.now(),
          source: "harness",
          kind: "harness.stopped",
          message: "Network harness stopped",
        });
      }
      memories.stop();
      relay.stop();
      server.close();
    },
  };
}

/**
 * Spawn a new agent and open a memories database for it in one step.
 * Returns the agent handle alongside a pre-bound memories client so the
 * caller never has to manually construct a `MemoriesDatabaseId`.
 */
export async function spawnWithMemories(harness: NetworkHarnessHandle): Promise<AgentWithMemories> {
  let capturedHandle: AgentHandle | undefined;

  const did = await harness.pool.spawn(async (handle) => {
    capturedHandle = handle;
    await harness.memoriesClient.openDatabase({ kind: "account", ownerKey: handle.did });
  });

  const agentHandle = capturedHandle;
  const database: MemoriesDatabaseId = { kind: "account", ownerKey: did };
  const { memoriesClient } = harness;

  if (!agentHandle) {
    throw new Error("Failed to capture agent handle during spawn");
  }

  return {
    did,
    agentHandle,
    chat: harness.chat.forAgent(did),
    memories: {
      database,
      open: () => memoriesClient.openDatabase(database),
      close: () => memoriesClient.closeDatabase(database),
      checkpoint: () => memoriesClient.checkpointDatabase(database),
      exists: () => memoriesClient.databaseExists(database),
      delete: () => memoriesClient.deleteDatabase(database),
      serviceClient: memoriesClient,
    },
  };
}
