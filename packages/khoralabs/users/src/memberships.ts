import type { Database } from "bun:sqlite";
import type { Membership, MembershipRow } from "./types";

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    accountId: row.account_id,
    hostId: row.host_id,
    createdAtMs: row.created_at_ms,
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
      `SELECT id, account_id, host_id, created_at_ms
       FROM memberships WHERE account_id = ? AND host_id = ? LIMIT 1`,
    )
    .get(accountId, hostId) as MembershipRow | null;
  return row === null ? null : mapMembership(row);
}

export function findMembershipById(db: Database, membershipId: string): Membership | null {
  const row = db
    .prepare(
      `SELECT id, account_id, host_id, created_at_ms
       FROM memberships WHERE id = ? LIMIT 1`,
    )
    .get(membershipId) as MembershipRow | null;
  return row === null ? null : mapMembership(row);
}

export function listMembershipsForAccount(db: Database, accountId: string): Membership[] {
  const rows = db
    .prepare(
      `SELECT id, account_id, host_id, created_at_ms
       FROM memberships WHERE account_id = ? ORDER BY created_at_ms ASC`,
    )
    .all(accountId) as MembershipRow[];
  return rows.map(mapMembership);
}

export function upsertMembership(
  db: Database,
  params: { accountId: string; hostId: string },
): Membership {
  const existing = findMembershipByAccountAndHost(db, params.accountId, params.hostId);
  if (existing !== null) {
    return existing;
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO memberships (id, account_id, host_id, created_at_ms)
     VALUES (?, ?, ?, ?)`,
  ).run(id, params.accountId, params.hostId, now);
  const created = findMembershipById(db, id);
  if (created === null) {
    throw new Error("membership insert failed");
  }
  return created;
}

export function deleteMembershipIfEmpty(db: Database, membershipId: string): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM account_agent_links WHERE membership_id = ?`)
    .get(membershipId) as { n: number };
  if (row.n > 0) {
    return false;
  }
  const result = db.prepare(`DELETE FROM memberships WHERE id = ?`).run(membershipId);
  return result.changes > 0;
}
