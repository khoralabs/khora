import type {
  AccountAgentLink,
  HostLinkPropagationResult,
} from "@khoralabs/khora-registry/contracts";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import { bindAgentToAccount, findBindingByAgentDid } from "./agent-account-bindings";
import { deleteMembershipIfEmpty, findMembershipById, upsertMembership } from "./memberships";
import type { AccountAgentLinkRow } from "./types-internal";

function mapLink(row: AccountAgentLinkRow): AccountAgentLink {
  return {
    id: row.id,
    membershipId: row.membership_id,
    accountId: row.account_id,
    hostId: row.host_id,
    agentDid: row.agent_did,
    linkedAtMs: row.linked_at_ms,
  };
}

export async function findAgentLinkOnHost(
  db: RegistryDatabase,
  hostId: string,
  agentDid: string,
): Promise<AccountAgentLink | null> {
  const row = await db.queryOne<AccountAgentLinkRow>(
    `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
     FROM account_agent_links WHERE host_id = ? AND agent_did = ? LIMIT 1`,
    [hostId, agentDid],
  );
  return row === undefined ? null : mapLink(row);
}

export async function listAgentLinksForMembership(
  db: RegistryDatabase,
  membershipId: string,
): Promise<AccountAgentLink[]> {
  const rows = await db.queryAll<AccountAgentLinkRow>(
    `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
     FROM account_agent_links WHERE membership_id = ? ORDER BY linked_at_ms ASC`,
    [membershipId],
  );
  return rows.map(mapLink);
}

export async function listAgentLinksForAccount(
  db: RegistryDatabase,
  accountId: string,
): Promise<AccountAgentLink[]> {
  const rows = await db.queryAll<AccountAgentLinkRow>(
    `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
     FROM account_agent_links WHERE account_id = ? ORDER BY linked_at_ms ASC`,
    [accountId],
  );
  return rows.map(mapLink);
}

export async function linkAgentToMembership(
  db: RegistryDatabase,
  params: { membershipId: string; agentDid: string; linkedAtMs?: number },
): Promise<AccountAgentLink> {
  const membership = await findMembershipById(db, params.membershipId);
  if (membership === null) {
    throw new Error("membership not found");
  }

  const binding = await findBindingByAgentDid(db, params.agentDid);
  if (binding !== null && binding.accountId !== membership.accountId) {
    throw new Error("agent already bound to another account");
  }

  const existingOnMembership = await db.queryOne<AccountAgentLinkRow>(
    `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
     FROM account_agent_links WHERE membership_id = ? AND agent_did = ? LIMIT 1`,
    [params.membershipId, params.agentDid],
  );
  if (existingOnMembership !== undefined) {
    return mapLink(existingOnMembership);
  }

  const existingOnHost = await findAgentLinkOnHost(db, membership.hostId, params.agentDid);
  if (existingOnHost !== null && existingOnHost.accountId !== membership.accountId) {
    throw new Error("agent already linked to another account on this host");
  }

  const now = params.linkedAtMs ?? Date.now();
  const id = crypto.randomUUID();
  try {
    await db.exec(
      `INSERT INTO account_agent_links (
         id, membership_id, account_id, host_id, agent_did, linked_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, membership.id, membership.accountId, membership.hostId, params.agentDid, now],
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("host_id")) {
      throw new Error("agent already linked to another account on this host");
    }
    throw err;
  }

  const created = await db.queryOne<AccountAgentLinkRow>(
    `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
     FROM account_agent_links WHERE id = ? LIMIT 1`,
    [id],
  );
  if (created === undefined) {
    throw new Error("account agent link insert failed");
  }
  return mapLink(created);
}

export async function unlinkAgentFromMembership(
  db: RegistryDatabase,
  membershipId: string,
  agentDid: string,
): Promise<boolean> {
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM account_agent_links WHERE membership_id = ? AND agent_did = ? LIMIT 1`,
    [membershipId, agentDid],
  );
  if (existing === undefined) {
    return false;
  }
  await db.exec(`DELETE FROM account_agent_links WHERE membership_id = ? AND agent_did = ?`, [
    membershipId,
    agentDid,
  ]);
  await deleteMembershipIfEmpty(db, membershipId);
  return true;
}

export async function unlinkAllAgentsFromMembership(
  db: RegistryDatabase,
  membershipId: string,
): Promise<number> {
  const rows = await db.queryAll<{ id: string }>(
    `SELECT id FROM account_agent_links WHERE membership_id = ?`,
    [membershipId],
  );
  if (rows.length === 0) {
    return 0;
  }
  await db.exec(`DELETE FROM account_agent_links WHERE membership_id = ?`, [membershipId]);
  await deleteMembershipIfEmpty(db, membershipId);
  return rows.length;
}

export async function ensureAgentLinkedOnHost(
  db: RegistryDatabase,
  params: { accountId: string; agentDid: string; hostId: string },
): Promise<AccountAgentLink> {
  const binding = await findBindingByAgentDid(db, params.agentDid);
  if (binding === null) {
    throw new Error("no agent account binding");
  }
  if (binding.accountId !== params.accountId) {
    throw new Error("agent already bound to another account");
  }

  const membership = await upsertMembership(db, {
    accountId: params.accountId,
    hostId: params.hostId,
  });
  return linkAgentToMembership(db, {
    membershipId: membership.id,
    agentDid: params.agentDid,
  });
}

export async function linkAgentToAccountOnHost(
  db: RegistryDatabase,
  params: {
    accountId: string;
    agentDid: string;
    hostId: string;
    boundViaHostId?: string;
  },
): Promise<AccountAgentLink> {
  await bindAgentToAccount(db, {
    agentDid: params.agentDid,
    accountId: params.accountId,
    ...(params.boundViaHostId !== undefined ? { boundViaHostId: params.boundViaHostId } : {}),
  });
  return ensureAgentLinkedOnHost(db, {
    accountId: params.accountId,
    agentDid: params.agentDid,
    hostId: params.hostId,
  });
}

export async function propagateAgentLinksToHosts(
  db: RegistryDatabase,
  params: { accountId: string; agentDid: string; hostIds: string[] },
): Promise<HostLinkPropagationResult[]> {
  const results: HostLinkPropagationResult[] = [];
  for (const hostId of params.hostIds) {
    try {
      const link = await ensureAgentLinkedOnHost(db, {
        accountId: params.accountId,
        agentDid: params.agentDid,
        hostId,
      });
      results.push({ hostId, ok: true, linkId: link.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "propagation failed";
      results.push({ hostId, ok: false, error: msg });
    }
  }
  return results;
}
