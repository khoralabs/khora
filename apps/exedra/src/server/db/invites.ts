import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

import {
  type InviteEffects,
  inviteKind,
  parseInviteEffects,
  sessionIdFromEffects,
  sessionParticipantInviteEffects,
  teamIdFromEffects,
  teamMemberInviteEffects,
} from "@shared/invites/effects";
import { avatarUrlFromS3Key } from "../avatars/urls";
import { getInvitePepper } from "../env";

export function hashInviteToken(plaintext: string): string {
  const pepper = getInvitePepper();
  return createHash("sha256")
    .update(pepper, "utf8")
    .update("\0", "utf8")
    .update(plaintext, "utf8")
    .digest("hex");
}

export function generateInvitePlaintext(): string {
  return randomBytes(24).toString("base64url");
}

export type InvitePublic = {
  token: string;
  kind: "team" | "session";
  status: "pending" | "accepted";
  teamName?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  topic?: string;
  sessionId?: string;
};

type InviteRow = {
  effects: string;
  consumed_at_ms: number | null;
};

function serializeEffects(effects: InviteEffects): string {
  return JSON.stringify(effects);
}

function loadInviteRow(db: Database, plaintext: string): InviteRow | null {
  const tokenHash = hashInviteToken(plaintext);
  return db
    .query<InviteRow, [string]>(
      `SELECT effects, consumed_at_ms FROM invites WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash);
}

export function getInviteEffects(db: Database, plaintext: string): InviteEffects | null {
  const row = loadInviteRow(db, plaintext);
  if (row === null) return null;
  return parseInviteEffects(row.effects);
}

export function mintInvite(
  db: Database,
  params: { createdByUserId: string | null; effects: InviteEffects },
): string {
  const plaintext = generateInvitePlaintext();
  const tokenHash = hashInviteToken(plaintext);
  db.prepare(
    `INSERT INTO invites (token_hash, created_by_user_id, created_at_ms, consumed_at_ms, consumed_by_user_id, effects)
     VALUES (?, ?, ?, NULL, NULL, ?)`,
  ).run(tokenHash, params.createdByUserId, Date.now(), serializeEffects(params.effects));
  return plaintext;
}

export function mintTeamMemberInvite(
  db: Database,
  params: { teamId: string; createdByUserId: string },
): string {
  return mintInvite(db, {
    createdByUserId: params.createdByUserId,
    effects: teamMemberInviteEffects(params.teamId),
  });
}

export function mintSessionParticipantInvite(
  db: Database,
  params: { sessionId: string; teamId: string; createdByUserId: string | null },
): string {
  return mintInvite(db, {
    createdByUserId: params.createdByUserId,
    effects: sessionParticipantInviteEffects(params.sessionId, params.teamId),
  });
}

/** @deprecated Use mintSessionParticipantInvite */
export function mintSessionInvite(db: Database, sessionId: string, teamId: string): string {
  return mintSessionParticipantInvite(db, { sessionId, teamId, createdByUserId: null });
}

function loadTeamOrgPublicDetails(
  db: Database,
  teamId: string,
): { teamName: string; orgName: string; orgAvatarUrl: string | null } | null {
  const nowMs = Date.now();
  const teamRow = db
    .query<
      { team_name: string; org_name: string; org_id: string; avatar_s3_key: string | null },
      [number, string]
    >(
      `SELECT t.name AS team_name, o.name AS org_name, o.id AS org_id, o.avatar_s3_key
       FROM teams t
       JOIN authz_grants g ON g.scope_type = 'team' AND g.scope_id = t.id
         AND g.resource_type = 'org' AND g.feature = 'member'
         AND g.revoked_at_ms IS NULL
         AND (g.expired_at_ms IS NULL OR g.expired_at_ms > ?)
       JOIN orgs o ON o.id = g.resource_id
       WHERE t.id = ?
       LIMIT 1`,
    )
    .get(nowMs, teamId);
  if (teamRow === null) return null;
  return {
    teamName: teamRow.team_name,
    orgName: teamRow.org_name,
    orgAvatarUrl: avatarUrlFromS3Key("org", teamRow.org_id, teamRow.avatar_s3_key),
  };
}

export function getInvitePublicInfo(db: Database, plaintext: string): InvitePublic | null {
  const row = loadInviteRow(db, plaintext);
  if (row === null) return null;

  const effects = parseInviteEffects(row.effects);
  const kind = inviteKind(effects);
  if (kind === "unknown") return null;

  const status: InvitePublic["status"] = row.consumed_at_ms !== null ? "accepted" : "pending";

  const base: InvitePublic = { token: plaintext, kind, status };

  if (kind === "team") {
    const teamId = teamIdFromEffects(effects);
    if (teamId === null) return null;
    const orgDetails = loadTeamOrgPublicDetails(db, teamId);
    if (orgDetails === null) return null;
    return { ...base, ...orgDetails };
  }

  const sessionId = sessionIdFromEffects(effects);
  if (sessionId === null) return null;
  const sessionRow = db
    .query<{ topic: string }, [string]>(`SELECT topic FROM sessions WHERE id = ? LIMIT 1`)
    .get(sessionId);
  if (sessionRow === null) return null;

  const teamId = teamIdFromEffects(effects);
  const orgDetails = teamId === null ? null : loadTeamOrgPublicDetails(db, teamId);

  return {
    ...base,
    topic: sessionRow.topic,
    sessionId,
    ...(orgDetails ?? {}),
  };
}

export function consumeInvite(
  db: Database,
  plaintext: string,
  userId: string,
): InviteEffects | null {
  const tokenHash = hashInviteToken(plaintext);
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE invites
       SET consumed_at_ms = ?, consumed_by_user_id = ?
       WHERE token_hash = ? AND consumed_at_ms IS NULL`,
    )
    .run(now, userId, tokenHash);

  if (result.changes !== 1) return null;

  const row = db
    .query<{ effects: string }, [string]>(
      `SELECT effects FROM invites WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash);

  if (row === null) return null;
  return parseInviteEffects(row.effects);
}

export function getInviteSessionId(db: Database, plaintext: string): string | null {
  const effects = getInviteEffects(db, plaintext);
  if (effects === null) return null;
  return sessionIdFromEffects(effects);
}

export function getInviteTeamId(db: Database, plaintext: string): string | null {
  const effects = getInviteEffects(db, plaintext);
  if (effects === null) return null;
  return teamIdFromEffects(effects);
}

/** @deprecated Use consumeInvite */
export function consumeSessionInvite(
  db: Database,
  plaintext: string,
  userId: string,
): { sessionId: string } | null {
  const effects = consumeInvite(db, plaintext, userId);
  if (effects === null) return null;
  const sessionId = sessionIdFromEffects(effects);
  if (sessionId === null) return null;
  return { sessionId };
}

export function listInvitesForSession(
  db: Database,
  sessionId: string,
): { consumed: boolean; createdAtMs: number }[] {
  const rows = db
    .query<{ effects: string; consumed_at_ms: number | null; created_at_ms: number }, []>(
      `SELECT effects, consumed_at_ms, created_at_ms FROM invites ORDER BY created_at_ms ASC`,
    )
    .all();

  return rows
    .filter((row) => sessionIdFromEffects(parseInviteEffects(row.effects)) === sessionId)
    .map((row) => ({
      consumed: row.consumed_at_ms !== null,
      createdAtMs: row.created_at_ms,
    }));
}

export function userAcceptedSessionInvite(
  db: Database,
  sessionId: string,
  userId: string,
): boolean {
  const rows = db
    .query<{ effects: string; consumed_by_user_id: string | null }, [string]>(
      `SELECT effects, consumed_by_user_id FROM invites
       WHERE consumed_at_ms IS NOT NULL AND consumed_by_user_id = ?`,
    )
    .all(userId);

  return rows.some((row) => {
    const effects = parseInviteEffects(row.effects);
    return sessionIdFromEffects(effects) === sessionId;
  });
}
