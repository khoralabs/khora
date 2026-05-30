import type { Database } from "bun:sqlite";
import type { AgentAccountBinding, AgentAccountBindingRow } from "./types.ts";

function mapBinding(row: AgentAccountBindingRow): AgentAccountBinding {
  return {
    agentDid: row.agent_did,
    accountId: row.account_id,
    boundAtMs: row.bound_at_ms,
    boundViaHostId: row.bound_via_host_id,
  };
}

export function findBindingByAgentDid(db: Database, agentDid: string): AgentAccountBinding | null {
  const row = db
    .prepare(
      `SELECT agent_did, account_id, bound_at_ms, bound_via_host_id
       FROM agent_account_bindings WHERE agent_did = ? LIMIT 1`,
    )
    .get(agentDid) as AgentAccountBindingRow | null;
  return row === null ? null : mapBinding(row);
}

export function bindAgentToAccount(
  db: Database,
  params: { agentDid: string; accountId: string; boundViaHostId?: string; boundAtMs?: number },
): AgentAccountBinding {
  const existing = findBindingByAgentDid(db, params.agentDid);
  if (existing !== null) {
    if (existing.accountId !== params.accountId) {
      throw new Error("agent already bound to another account");
    }
    return existing;
  }

  const now = params.boundAtMs ?? Date.now();
  db.prepare(
    `INSERT INTO agent_account_bindings (agent_did, account_id, bound_at_ms, bound_via_host_id)
     VALUES (?, ?, ?, ?)`,
  ).run(
    params.agentDid,
    params.accountId,
    now,
    params.boundViaHostId ?? null,
  );

  const created = findBindingByAgentDid(db, params.agentDid);
  if (created === null) {
    throw new Error("agent account binding insert failed");
  }
  return created;
}

export function countAgentLinksForAgentDid(db: Database, agentDid: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM account_agent_links WHERE agent_did = ?`)
    .get(agentDid) as { n: number };
  return row.n;
}

export function clearBindingIfNoHostLinks(db: Database, agentDid: string): boolean {
  if (countAgentLinksForAgentDid(db, agentDid) > 0) {
    return false;
  }
  const result = db
    .prepare(`DELETE FROM agent_account_bindings WHERE agent_did = ?`)
    .run(agentDid);
  return result.changes > 0;
}
