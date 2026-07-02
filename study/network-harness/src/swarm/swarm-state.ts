import { mkdirSync } from "node:fs";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { type Client, createClient } from "@libsql/client";

import { buildNetworkAttribution } from "../observability/attribution-digest";
import { emitNetworkEvent } from "../observability/network-log";
import { workflowDbPath } from "../workflow/paths";
import type { AgentLoopState, NetworkEvent, SwarmConfig, SwarmState, TurnTelemetry } from "./types";

export type InboxEntry = {
  id: string;
  did: string;
  event: KhoraClientEvent;
  receivedAtMs: number;
};

let schemaReadyByDataDir = new Map<string, Promise<void>>();
const clients = new Map<string, Client>();

function getClient(dataDir: string): Client {
  mkdirSync(dataDir, { recursive: true });
  let existing = clients.get(dataDir);
  if (existing === undefined) {
    existing = createClient({ url: `file:${workflowDbPath(dataDir)}` });
    clients.set(dataDir, existing);
  }
  return existing;
}

async function ensureSchema(dataDir: string): Promise<void> {
  const pending = schemaReadyByDataDir.get(dataDir);
  if (pending !== undefined) return pending;
  const ready = (async () => {
    const db = getClient(dataDir);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS swarm_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        config_json TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        max_token_budget INTEGER NOT NULL,
        agents_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS swarm_turn_telemetry (
        id TEXT PRIMARY KEY,
        swarm_state_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS swarm_inbox_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_did TEXT NOT NULL,
        event_json TEXT NOT NULL,
        received_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS swarm_inbox_cursors (
        session_id TEXT NOT NULL,
        agent_did TEXT NOT NULL,
        last_entry_id TEXT,
        PRIMARY KEY (session_id, agent_did)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS swarm_network_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        ts_ms INTEGER NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        agent_did TEXT,
        payload_json TEXT NOT NULL
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_swarm_network_events_session_seq
        ON swarm_network_events (session_id, seq)
    `);
  })();
  schemaReadyByDataDir.set(dataDir, ready);
  return ready;
}

export async function createSwarmState(
  dataDir: string,
  config: SwarmConfig,
  agents: AgentLoopState[],
): Promise<SwarmState> {
  await ensureSchema(dataDir);
  const id = crypto.randomUUID();
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO swarm_sessions (id, session_id, config_json, tokens_used, max_token_budget, agents_json, created_at_ms)
          VALUES (?, ?, ?, 0, ?, ?, ?)`,
    args: [
      id,
      config.sessionId,
      JSON.stringify(config),
      config.maxTokenBudget,
      JSON.stringify(agents),
      Date.now(),
    ],
  });
  return { id, sessionId: config.sessionId, config, tokensUsed: 0, agents };
}

export async function loadSwarmStateBySessionId(
  dataDir: string,
  sessionId: string,
): Promise<SwarmState | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT id, session_id, config_json, tokens_used, agents_json FROM swarm_sessions WHERE session_id = ?`,
    args: [sessionId],
  });
  const record = row.rows[0];
  if (!record) return null;
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    config: JSON.parse(String(record.config_json)) as SwarmConfig,
    tokensUsed: Number(record.tokens_used),
    agents: JSON.parse(String(record.agents_json)) as AgentLoopState[],
  };
}

export async function appendInboxEntry(
  dataDir: string,
  sessionId: string,
  did: string,
  event: KhoraClientEvent,
): Promise<InboxEntry> {
  await ensureSchema(dataDir);
  const entry: InboxEntry = {
    id: crypto.randomUUID(),
    did,
    event,
    receivedAtMs: Date.now(),
  };
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO swarm_inbox_entries (id, session_id, agent_did, event_json, received_at_ms)
          VALUES (?, ?, ?, ?, ?)`,
    args: [entry.id, sessionId, did, JSON.stringify(event), entry.receivedAtMs],
  });

  await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId,
      kind: "inbox.received",
      agentDid: did,
      extra: entry.id,
    }),
    sessionId,
    tsMs: entry.receivedAtMs,
    source: "inbox",
    kind: "inbox.received",
    agentDid: did,
    payload: {
      inboxEntryId: entry.id,
      eventType: event.type,
      event,
    },
  });

  return entry;
}

export async function listInboxEntriesSince(
  dataDir: string,
  sessionId: string,
  did: string,
  afterEntryId?: string,
): Promise<InboxEntry[]> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const result = await db.execute({
    sql: `SELECT id, agent_did, event_json, received_at_ms
          FROM swarm_inbox_entries
          WHERE session_id = ? AND agent_did = ?
          ORDER BY received_at_ms ASC`,
    args: [sessionId, did],
  });
  const entries = result.rows.map((row) => ({
    id: String(row.id),
    did: String(row.agent_did),
    event: JSON.parse(String(row.event_json)) as KhoraClientEvent,
    receivedAtMs: Number(row.received_at_ms),
  }));
  if (afterEntryId === undefined) return entries;
  const index = entries.findIndex((entry) => entry.id === afterEntryId);
  if (index === -1) return entries;
  return entries.slice(index + 1);
}

export async function getInboxCursor(
  dataDir: string,
  sessionId: string,
  did: string,
): Promise<string | undefined> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT last_entry_id FROM swarm_inbox_cursors WHERE session_id = ? AND agent_did = ?`,
    args: [sessionId, did],
  });
  const value = row.rows[0]?.last_entry_id;
  return value === null || value === undefined ? undefined : String(value);
}

export async function setInboxCursor(
  dataDir: string,
  sessionId: string,
  did: string,
  entryId: string | undefined,
): Promise<void> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO swarm_inbox_cursors (session_id, agent_did, last_entry_id)
          VALUES (?, ?, ?)
          ON CONFLICT(session_id, agent_did) DO UPDATE SET last_entry_id = excluded.last_entry_id`,
    args: [sessionId, did, entryId ?? null],
  });
}

export async function loadSwarmState(dataDir: string, swarmStateId: string): Promise<SwarmState> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT id, session_id, config_json, tokens_used, agents_json FROM swarm_sessions WHERE id = ?`,
    args: [swarmStateId],
  });
  const record = row.rows[0];
  if (!record) throw new Error(`swarm state ${swarmStateId} not found`);
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    config: JSON.parse(String(record.config_json)) as SwarmConfig,
    tokensUsed: Number(record.tokens_used),
    agents: JSON.parse(String(record.agents_json)) as AgentLoopState[],
  };
}

export async function checkTokenBudgetRemainingStep(
  dataDir: string,
  swarmStateId: string,
): Promise<boolean> {
  const state = await loadSwarmState(dataDir, swarmStateId);
  return state.tokensUsed < state.config.maxTokenBudget;
}

export async function incrementTokensUsedStep(
  dataDir: string,
  swarmStateId: string,
  delta: number,
): Promise<number> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `UPDATE swarm_sessions SET tokens_used = tokens_used + ? WHERE id = ?`,
    args: [delta, swarmStateId],
  });
  const state = await loadSwarmState(dataDir, swarmStateId);
  return state.tokensUsed;
}

export async function persistNetworkEvent(
  dataDir: string,
  event: NetworkEvent,
): Promise<NetworkEvent | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const maxRow = await db.execute({
    sql: `SELECT COALESCE(MAX(seq), 0) AS max_seq FROM swarm_network_events WHERE session_id = ?`,
    args: [event.sessionId],
  });
  const nextSeq = Number(maxRow.rows[0]?.max_seq ?? 0) + 1;
  const stored: NetworkEvent = { ...event, seq: nextSeq };
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO swarm_network_events
          (event_id, session_id, seq, ts_ms, source, kind, agent_did, payload_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      stored.eventId,
      stored.sessionId,
      nextSeq,
      stored.tsMs,
      stored.source,
      stored.kind,
      stored.agentDid ?? null,
      JSON.stringify(stored),
    ],
  });
  if (result.rowsAffected === 0) return null;
  return stored;
}

export type ListNetworkEventsOptions = {
  kind?: string;
  agentDid?: string;
  sinceSeq?: number;
};

export async function queryNetworkEvents(
  dataDir: string,
  sessionId: string,
  opts: ListNetworkEventsOptions = {},
): Promise<NetworkEvent[]> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const conditions = ["session_id = ?"];
  const args: Array<string | number> = [sessionId];
  if (opts.kind !== undefined) {
    conditions.push("kind = ?");
    args.push(opts.kind);
  }
  if (opts.agentDid !== undefined) {
    conditions.push("agent_did = ?");
    args.push(opts.agentDid);
  }
  if (opts.sinceSeq !== undefined) {
    conditions.push("seq > ?");
    args.push(opts.sinceSeq);
  }
  const result = await db.execute({
    sql: `SELECT payload_json FROM swarm_network_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY seq ASC`,
    args,
  });
  return result.rows.map((row) => JSON.parse(String(row.payload_json)) as NetworkEvent);
}

export async function recordTurnTelemetryStep(
  dataDir: string,
  _swarmStateId: string,
  telemetry: TurnTelemetry,
): Promise<void> {
  await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId: telemetry.sessionId,
      kind: "agent.turn.completed",
      runId: telemetry.runId,
      agentDid: telemetry.agentDid,
      turnIndex: telemetry.agentTurnIndex,
    }),
    sessionId: telemetry.sessionId,
    tsMs: Date.now(),
    source: "agent",
    kind: "agent.turn.completed",
    agentDid: telemetry.agentDid,
    agentRole: telemetry.agentRole,
    runId: telemetry.runId,
    payload: {
      agentTurnIndex: telemetry.agentTurnIndex,
      usage: telemetry.usage,
      inboxEntryIds: telemetry.inboxEntryIds,
      capabilities: telemetry.capabilities,
    },
    attribution: buildNetworkAttribution({
      capabilities: telemetry.capabilities,
      memoriesProvenanceRootHex: telemetry.memoriesProvenanceRootHex,
      threadHashes: telemetry.threadHashes,
    }),
  });
}

export function networkEventId(input: {
  sessionId: string;
  kind: string;
  runId?: string;
  agentDid?: string;
  turnIndex?: number;
  extra?: string;
}): string {
  return [
    input.sessionId,
    input.kind,
    input.runId ?? "",
    input.agentDid ?? "",
    input.turnIndex !== undefined ? String(input.turnIndex) : "",
    input.extra ?? "",
  ].join(":");
}

export async function listTurnTelemetry(
  dataDir: string,
  sessionId: string,
): Promise<TurnTelemetry[]> {
  const events = await queryNetworkEvents(dataDir, sessionId, {
    kind: "agent.turn.completed",
  });
  return events.map((event) => {
    const payload = event.payload ?? {};
    const attribution = event.attribution;
    const capabilities = (payload.capabilities ?? {
      staticHash: attribution?.staticHash ?? "",
      runtimeHash: attribution?.runtimeHash ?? "",
      invocationHash: attribution?.invocationHash,
      toolRefs: attribution?.toolRefs ?? [],
    }) as TurnTelemetry["capabilities"];
    return {
      sessionId: event.sessionId,
      agentTurnIndex: Number(payload.agentTurnIndex ?? 0),
      agentDid: event.agentDid ?? "",
      agentRole: event.agentRole ?? "",
      runId: event.runId ?? "",
      usage: payload.usage as TurnTelemetry["usage"],
      capabilities,
      memoriesProvenanceRootHex: attribution?.memoriesProvenanceRootHex ?? "",
      threadHashes: attribution?.threadHashes ?? [],
      inboxEntryIds: (payload.inboxEntryIds as string[]) ?? [],
    };
  });
}

export async function summarizeSwarmState(
  dataDir: string,
  swarmStateId: string,
  agentResults: Array<{ did: string; turns: number }>,
): Promise<{
  sessionId: string;
  tokensUsed: number;
  maxTokenBudget: number;
  agentResults: Array<{ did: string; turns: number }>;
}> {
  const state = await loadSwarmState(dataDir, swarmStateId);
  return {
    sessionId: state.sessionId,
    tokensUsed: state.tokensUsed,
    maxTokenBudget: state.config.maxTokenBudget,
    agentResults,
  };
}

export function resetSwarmStateClientForTests(): void {
  clients.clear();
  schemaReadyByDataDir = new Map();
}
