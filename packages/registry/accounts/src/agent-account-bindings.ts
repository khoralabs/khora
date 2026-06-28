import type { AgentAccountBinding } from "@khoralabs/registry-accounts-contracts";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";
import type { AgentAccountBindingRow } from "./types-internal";

function mapBinding(row: AgentAccountBindingRow): AgentAccountBinding {
  return {
    agentDid: row.agent_did,
    accountId: row.account_id,
    boundAtMs: row.bound_at_ms,
    boundViaHostId: row.bound_via_host_id,
  };
}

export async function findBindingByAgentDid(
  db: RegistryDatabase,
  agentDid: string,
): Promise<AgentAccountBinding | null> {
  const row = await db.queryOne<AgentAccountBindingRow>(
    `SELECT agent_did, account_id, bound_at_ms, bound_via_host_id
     FROM agent_account_bindings WHERE agent_did = ? LIMIT 1`,
    [agentDid],
  );
  return row === undefined ? null : mapBinding(row);
}

export async function bindAgentToAccount(
  db: RegistryDatabase,
  params: { agentDid: string; accountId: string; boundViaHostId?: string; boundAtMs?: number },
): Promise<AgentAccountBinding> {
  const existing = await findBindingByAgentDid(db, params.agentDid);
  if (existing !== null) {
    if (existing.accountId !== params.accountId) {
      throw new Error("agent already bound to another account");
    }
    return existing;
  }

  const now = params.boundAtMs ?? Date.now();
  await db.exec(
    `INSERT INTO agent_account_bindings (agent_did, account_id, bound_at_ms, bound_via_host_id)
     VALUES (?, ?, ?, ?)`,
    [params.agentDid, params.accountId, now, params.boundViaHostId ?? null],
  );

  const created = await findBindingByAgentDid(db, params.agentDid);
  if (created === null) {
    throw new Error("agent account binding insert failed");
  }
  return created;
}

export async function countAgentLinksForAgentDid(
  db: RegistryDatabase,
  agentDid: string,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM account_agent_links WHERE agent_did = ?`,
    [agentDid],
  );
  return row?.n ?? 0;
}

export async function clearBindingIfNoHostLinks(
  db: RegistryDatabase,
  agentDid: string,
): Promise<boolean> {
  if ((await countAgentLinksForAgentDid(db, agentDid)) > 0) {
    return false;
  }
  const existing = await db.queryOne<{ agent_did: string }>(
    `SELECT agent_did FROM agent_account_bindings WHERE agent_did = ? LIMIT 1`,
    [agentDid],
  );
  if (existing === undefined) {
    return false;
  }
  await db.exec(`DELETE FROM agent_account_bindings WHERE agent_did = ?`, [agentDid]);
  return true;
}
