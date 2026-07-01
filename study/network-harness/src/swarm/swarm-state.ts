import { mkdirSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";

import { workflowDbPath } from "../workflow/paths.ts";
import type { AgentLoopState, SwarmConfig, SwarmState, TurnTelemetry } from "./types.ts";

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

export async function recordTurnTelemetryStep(
  dataDir: string,
  swarmStateId: string,
  telemetry: TurnTelemetry,
): Promise<void> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO swarm_turn_telemetry (id, swarm_state_id, session_id, payload_json, created_at_ms)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      swarmStateId,
      telemetry.sessionId,
      JSON.stringify(telemetry),
      Date.now(),
    ],
  });
}

export async function listTurnTelemetry(
  dataDir: string,
  sessionId: string,
): Promise<TurnTelemetry[]> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const result = await db.execute({
    sql: `SELECT payload_json FROM swarm_turn_telemetry WHERE session_id = ? ORDER BY created_at_ms ASC`,
    args: [sessionId],
  });
  return result.rows.map((row) => JSON.parse(String(row.payload_json)) as TurnTelemetry);
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
