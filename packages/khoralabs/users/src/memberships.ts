import type { Database } from "bun:sqlite";
import type { Membership, MembershipStatus } from "./types.ts";

type MembershipRow = {
  id: string;
  account_id: string;
  host_id: string;
  invite_token_hash: string | null;
  agent_did: string | null;
  status: string;
  created_at_ms: number;
  updated_at_ms: number;
};

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    accountId: row.account_id,
    hostId: row.host_id,
    inviteTokenHash: row.invite_token_hash,
    agentDid: row.agent_did,
    status: row.status as MembershipStatus,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

export function countMembershipsForAccount(db: Database, accountId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM memberships WHERE account_id = ?`)
    .get(accountId) as { n: number };
  return row.n;
}

export function findMembershipByAccountAndHost(
  db: Database,
  accountId: string,
  hostId: string,
): Membership | null {
  const row = db
    .prepare(
      `SELECT id, account_id, host_id, invite_token_hash, agent_did, status, created_at_ms, updated_at_ms
       FROM memberships WHERE account_id = ? AND host_id = ? LIMIT 1`,
    )
    .get(accountId, hostId) as MembershipRow | null;
  return row === null ? null : mapMembership(row);
}

export function findMembershipById(db: Database, membershipId: string): Membership | null {
  const row = db
    .prepare(
      `SELECT id, account_id, host_id, invite_token_hash, agent_did, status, created_at_ms, updated_at_ms
       FROM memberships WHERE id = ? LIMIT 1`,
    )
    .get(membershipId) as MembershipRow | null;
  return row === null ? null : mapMembership(row);
}

export function listMembershipsForAccount(db: Database, accountId: string): Membership[] {
  const rows = db
    .prepare(
      `SELECT id, account_id, host_id, invite_token_hash, agent_did, status, created_at_ms, updated_at_ms
       FROM memberships WHERE account_id = ? ORDER BY created_at_ms ASC`,
    )
    .all(accountId) as MembershipRow[];
  return rows.map(mapMembership);
}

export function upsertMembership(
  db: Database,
  params: { accountId: string; hostId: string; status?: MembershipStatus },
): Membership {
  const existing = findMembershipByAccountAndHost(db, params.accountId, params.hostId);
  if (existing !== null) {
    return existing;
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const status = params.status ?? "active";
  db.prepare(
    `INSERT INTO memberships (id, account_id, host_id, status, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, params.accountId, params.hostId, status, now, now);
  const created = findMembershipById(db, id);
  if (created === null) {
    throw new Error("membership insert failed");
  }
  return created;
}

export function setMembershipAgentDid(
  db: Database,
  membershipId: string,
  agentDid: string,
): Membership {
  const existing = findMembershipById(db, membershipId);
  if (existing === null) {
    throw new Error("membership not found");
  }
  if (existing.agentDid !== null && existing.agentDid !== agentDid) {
    throw new Error("membership already linked to a different agent; unlink first");
  }
  const now = Date.now();
  db.prepare(
    `UPDATE memberships SET agent_did = ?, status = 'active', updated_at_ms = ? WHERE id = ?`,
  ).run(agentDid, now, membershipId);
  const updated = findMembershipById(db, membershipId);
  if (updated === null) {
    throw new Error("membership update failed");
  }
  return updated;
}

export function clearMembershipAgentDid(db: Database, membershipId: string): Membership {
  const existing = findMembershipById(db, membershipId);
  if (existing === null) {
    throw new Error("membership not found");
  }
  const now = Date.now();
  db.prepare(`UPDATE memberships SET agent_did = NULL, updated_at_ms = ? WHERE id = ?`).run(
    now,
    membershipId,
  );
  const updated = findMembershipById(db, membershipId);
  if (updated === null) {
    throw new Error("membership update failed");
  }
  return updated;
}
