import type { Database } from "bun:sqlite";
import { bindAgentToAccount, findBindingByAgentDid } from "./agent-account-bindings";
import { deleteMembershipIfEmpty, findMembershipById, upsertMembership } from "./memberships";
import type { AccountAgentLink, AccountAgentLinkRow, HostLinkPropagationResult } from "./types";

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

export function findAgentLinkOnHost(
  db: Database,
  hostId: string,
  agentDid: string,
): AccountAgentLink | null {
  const row = db
    .prepare(
      `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
       FROM account_agent_links WHERE host_id = ? AND agent_did = ? LIMIT 1`,
    )
    .get(hostId, agentDid) as AccountAgentLinkRow | null;
  return row === null ? null : mapLink(row);
}

export function listAgentLinksForMembership(
  db: Database,
  membershipId: string,
): AccountAgentLink[] {
  const rows = db
    .prepare(
      `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
       FROM account_agent_links WHERE membership_id = ? ORDER BY linked_at_ms ASC`,
    )
    .all(membershipId) as AccountAgentLinkRow[];
  return rows.map(mapLink);
}

export function listAgentLinksForAccount(db: Database, accountId: string): AccountAgentLink[] {
  const rows = db
    .prepare(
      `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
       FROM account_agent_links WHERE account_id = ? ORDER BY linked_at_ms ASC`,
    )
    .all(accountId) as AccountAgentLinkRow[];
  return rows.map(mapLink);
}

export function linkAgentToMembership(
  db: Database,
  params: { membershipId: string; agentDid: string; linkedAtMs?: number },
): AccountAgentLink {
  const membership = findMembershipById(db, params.membershipId);
  if (membership === null) {
    throw new Error("membership not found");
  }

  const binding = findBindingByAgentDid(db, params.agentDid);
  if (binding !== null && binding.accountId !== membership.accountId) {
    throw new Error("agent already bound to another account");
  }

  const existingOnMembership = db
    .prepare(
      `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
       FROM account_agent_links WHERE membership_id = ? AND agent_did = ? LIMIT 1`,
    )
    .get(params.membershipId, params.agentDid) as AccountAgentLinkRow | null;
  if (existingOnMembership !== null) {
    return mapLink(existingOnMembership);
  }

  const existingOnHost = findAgentLinkOnHost(db, membership.hostId, params.agentDid);
  if (existingOnHost !== null && existingOnHost.accountId !== membership.accountId) {
    throw new Error("agent already linked to another account on this host");
  }

  const now = params.linkedAtMs ?? Date.now();
  const id = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO account_agent_links (
         id, membership_id, account_id, host_id, agent_did, linked_at_ms
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, membership.id, membership.accountId, membership.hostId, params.agentDid, now);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed") && msg.includes("host_id")) {
      throw new Error("agent already linked to another account on this host");
    }
    throw err;
  }

  const created = db
    .prepare(
      `SELECT id, membership_id, account_id, host_id, agent_did, linked_at_ms
       FROM account_agent_links WHERE id = ? LIMIT 1`,
    )
    .get(id) as AccountAgentLinkRow | null;
  if (created === null) {
    throw new Error("account agent link insert failed");
  }
  return mapLink(created);
}

export function unlinkAgentFromMembership(
  db: Database,
  membershipId: string,
  agentDid: string,
): boolean {
  const result = db
    .prepare(`DELETE FROM account_agent_links WHERE membership_id = ? AND agent_did = ?`)
    .run(membershipId, agentDid);
  if (result.changes > 0) {
    deleteMembershipIfEmpty(db, membershipId);
  }
  return result.changes > 0;
}

export function unlinkAllAgentsFromMembership(db: Database, membershipId: string): number {
  const result = db
    .prepare(`DELETE FROM account_agent_links WHERE membership_id = ?`)
    .run(membershipId);
  if (result.changes > 0) {
    deleteMembershipIfEmpty(db, membershipId);
  }
  return result.changes;
}

export function ensureAgentLinkedOnHost(
  db: Database,
  params: { accountId: string; agentDid: string; hostId: string },
): AccountAgentLink {
  const binding = findBindingByAgentDid(db, params.agentDid);
  if (binding === null) {
    throw new Error("no agent account binding");
  }
  if (binding.accountId !== params.accountId) {
    throw new Error("agent already bound to another account");
  }

  const membership = upsertMembership(db, {
    accountId: params.accountId,
    hostId: params.hostId,
  });
  return linkAgentToMembership(db, {
    membershipId: membership.id,
    agentDid: params.agentDid,
  });
}

export function linkAgentToAccountOnHost(
  db: Database,
  params: {
    accountId: string;
    agentDid: string;
    hostId: string;
    boundViaHostId?: string;
  },
): AccountAgentLink {
  bindAgentToAccount(db, {
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

export function propagateAgentLinksToHosts(
  db: Database,
  params: { accountId: string; agentDid: string; hostIds: string[] },
): HostLinkPropagationResult[] {
  const results: HostLinkPropagationResult[] = [];
  for (const hostId of params.hostIds) {
    try {
      const link = ensureAgentLinkedOnHost(db, {
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
