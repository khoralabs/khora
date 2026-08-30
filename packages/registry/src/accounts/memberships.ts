import type { Membership } from "@khoralabs/khora-registry/contracts";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import type { MembershipRow } from "./types-internal";

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    accountId: row.account_id,
    hostId: row.host_id,
    createdAtMs: row.created_at_ms,
  };
}

export async function countMembershipsForAccount(
  db: RegistryDatabase,
  accountId: string,
): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM memberships WHERE account_id = ?`,
    [accountId],
  );
  return row?.n ?? 0;
}

export async function findMembershipByAccountAndHost(
  db: RegistryDatabase,
  accountId: string,
  hostId: string,
): Promise<Membership | null> {
  const row = await db.queryOne<MembershipRow>(
    `SELECT id, account_id, host_id, created_at_ms
     FROM memberships WHERE account_id = ? AND host_id = ? LIMIT 1`,
    [accountId, hostId],
  );
  return row === undefined ? null : mapMembership(row);
}

export async function findMembershipById(
  db: RegistryDatabase,
  membershipId: string,
): Promise<Membership | null> {
  const row = await db.queryOne<MembershipRow>(
    `SELECT id, account_id, host_id, created_at_ms
     FROM memberships WHERE id = ? LIMIT 1`,
    [membershipId],
  );
  return row === undefined ? null : mapMembership(row);
}

export async function listMembershipsForAccount(
  db: RegistryDatabase,
  accountId: string,
): Promise<Membership[]> {
  const rows = await db.queryAll<MembershipRow>(
    `SELECT id, account_id, host_id, created_at_ms
     FROM memberships WHERE account_id = ? ORDER BY created_at_ms ASC`,
    [accountId],
  );
  return rows.map(mapMembership);
}

export async function upsertMembership(
  db: RegistryDatabase,
  params: { accountId: string; hostId: string },
): Promise<Membership> {
  const existing = await findMembershipByAccountAndHost(db, params.accountId, params.hostId);
  if (existing !== null) {
    return existing;
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO memberships (id, account_id, host_id, created_at_ms)
     VALUES (?, ?, ?, ?)`,
    [id, params.accountId, params.hostId, now],
  );
  const created = await findMembershipById(db, id);
  if (created === null) {
    throw new Error("membership insert failed");
  }
  return created;
}

export async function deleteMembershipIfEmpty(
  db: RegistryDatabase,
  membershipId: string,
): Promise<boolean> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM account_agent_links WHERE membership_id = ?`,
    [membershipId],
  );
  if ((row?.n ?? 0) > 0) {
    return false;
  }
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM memberships WHERE id = ? LIMIT 1`,
    [membershipId],
  );
  if (existing === undefined) {
    return false;
  }
  await db.exec(`DELETE FROM memberships WHERE id = ?`, [membershipId]);
  return true;
}
