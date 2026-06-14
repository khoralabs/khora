import type { Database } from "bun:sqlite";

import { generateInvitePlaintext, hashInviteToken } from "./invites";

export type TeamInvitePublic = {
  token: string;
  teamName: string;
  orgName: string;
  status: "pending" | "revoked";
};

type TeamInviteRow = {
  team_id: string;
  team_name: string;
  org_name: string;
  revoked_at_ms: number | null;
};

export function mintTeamInvite(
  db: Database,
  params: { teamId: string; createdByUserId: string },
): string {
  const plaintext = generateInvitePlaintext();
  const tokenHash = hashInviteToken(plaintext);
  db.prepare(
    `INSERT INTO team_invites (token_hash, team_id, created_by_user_id, created_at_ms)
     VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, params.teamId, params.createdByUserId, Date.now());
  return plaintext;
}

export function getTeamInvitePublicInfo(db: Database, plaintext: string): TeamInvitePublic | null {
  const tokenHash = hashInviteToken(plaintext);
  const row = db
    .query<TeamInviteRow, [string]>(
      `SELECT ti.team_id, t.name AS team_name, o.name AS org_name, ti.revoked_at_ms
       FROM team_invites ti
       JOIN teams t ON t.id = ti.team_id
       JOIN orgs o ON o.id = t.org_id
       WHERE ti.token_hash = ?
       LIMIT 1`,
    )
    .get(tokenHash);

  if (row === null) return null;

  return {
    token: plaintext,
    teamName: row.team_name,
    orgName: row.org_name,
    status: row.revoked_at_ms !== null ? "revoked" : "pending",
  };
}

export function getTeamIdForInvite(db: Database, plaintext: string): string | null {
  const tokenHash = hashInviteToken(plaintext);
  const row = db
    .query<{ team_id: string; revoked_at_ms: number | null }, [string]>(
      `SELECT team_id, revoked_at_ms FROM team_invites WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash);
  if (row === null || row.revoked_at_ms !== null) return null;
  return row.team_id;
}
