import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

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

export type SessionInvitePublic = {
  token: string;
  topic: string;
  status: "pending" | "accepted" | "expired";
};

type InviteRow = {
  session_id: string;
  topic: string;
  consumed_at_ms: number | null;
};

export function getInviteSessionId(db: Database, plaintext: string): string | null {
  const tokenHash = hashInviteToken(plaintext);
  const row = db
    .query<{ session_id: string }, [string]>(
      `SELECT session_id FROM session_invites WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash);
  return row?.session_id ?? null;
}

export function getInvitePublicInfo(db: Database, plaintext: string): SessionInvitePublic | null {
  const tokenHash = hashInviteToken(plaintext);
  const row = db
    .query<InviteRow, [string]>(
      `SELECT si.session_id, s.topic, si.consumed_at_ms
       FROM session_invites si
       JOIN sessions s ON s.id = si.session_id
       WHERE si.token_hash = ?
       LIMIT 1`,
    )
    .get(tokenHash);

  if (row === null) return null;

  const status: SessionInvitePublic["status"] =
    row.consumed_at_ms !== null ? "accepted" : "pending";

  return {
    token: plaintext,
    topic: row.topic,
    status,
  };
}

export function mintSessionInvite(db: Database, sessionId: string): string {
  const plaintext = generateInvitePlaintext();
  const tokenHash = hashInviteToken(plaintext);
  db.prepare(
    `INSERT INTO session_invites (token_hash, session_id, created_at_ms, consumed_at_ms, consumed_by_user_id)
     VALUES (?, ?, ?, NULL, NULL)`,
  ).run(tokenHash, sessionId, Date.now());
  return plaintext;
}

export function consumeSessionInvite(
  db: Database,
  plaintext: string,
  userId: string,
): { sessionId: string } | null {
  const tokenHash = hashInviteToken(plaintext);
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE session_invites
       SET consumed_at_ms = ?, consumed_by_user_id = ?
       WHERE token_hash = ? AND consumed_at_ms IS NULL`,
    )
    .run(now, userId, tokenHash);

  if (result.changes !== 1) return null;

  const row = db
    .query<{ session_id: string }, [string]>(
      `SELECT session_id FROM session_invites WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash);

  if (row === null) return null;
  return { sessionId: row.session_id };
}

export function listInvitesForSession(
  db: Database,
  sessionId: string,
): { consumed: boolean; createdAtMs: number }[] {
  const rows = db
    .query<{ consumed_at_ms: number | null; created_at_ms: number }, [string]>(
      `SELECT consumed_at_ms, created_at_ms FROM session_invites WHERE session_id = ? ORDER BY created_at_ms ASC`,
    )
    .all(sessionId);

  return rows.map((r) => ({
    consumed: r.consumed_at_ms !== null,
    createdAtMs: r.created_at_ms,
  }));
}

export function userAcceptedSessionInvite(
  db: Database,
  sessionId: string,
  userId: string,
): boolean {
  const row = db
    .query<{ c: number }, [string, string]>(
      `SELECT COUNT(1) AS c FROM session_invites
       WHERE session_id = ? AND consumed_by_user_id = ? AND consumed_at_ms IS NOT NULL`,
    )
    .get(sessionId, userId);
  return row !== null && row.c > 0;
}
