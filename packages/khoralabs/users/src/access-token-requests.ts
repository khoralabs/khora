import type { Database } from "bun:sqlite";
import { normalizeEmail } from "./normalize";
import type { AccessTokenRequest, AccessTokenRequestRow } from "./types";

function mapRequest(row: AccessTokenRequestRow): AccessTokenRequest {
  return {
    id: row.id,
    email: row.email,
    hostId: row.host_id,
    accountId: row.account_id,
    membershipId: row.membership_id,
    status: row.status as AccessTokenRequest["status"],
    inviteTokenHash: row.invite_token_hash,
    requestedAtMs: row.requested_at_ms,
    mintedAtMs: row.minted_at_ms,
    sentAtMs: row.sent_at_ms,
    redeemedAtMs: row.redeemed_at_ms,
    sourceApp: row.source_app,
  };
}

export function findAccessTokenRequest(
  db: Database,
  email: string,
  hostId: string,
): AccessTokenRequest | null {
  const row = db
    .prepare(
      `SELECT id, email, host_id, account_id, membership_id, status, invite_token_hash,
              requested_at_ms, minted_at_ms, sent_at_ms, redeemed_at_ms, source_app
       FROM access_token_requests WHERE email = ? AND host_id = ? LIMIT 1`,
    )
    .get(normalizeEmail(email), hostId) as AccessTokenRequestRow | null;
  return row === null ? null : mapRequest(row);
}

export function createAccessTokenRequest(
  db: Database,
  params: { email: string; hostId: string; sourceApp?: string },
): { request: AccessTokenRequest; inserted: boolean } {
  const email = normalizeEmail(params.email);
  const existing = findAccessTokenRequest(db, email, params.hostId);
  if (existing !== null) {
    return { request: existing, inserted: false };
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO access_token_requests
       (id, email, host_id, status, requested_at_ms, source_app)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
  ).run(id, email, params.hostId, now, params.sourceApp ?? null);
  const request = findAccessTokenRequest(db, email, params.hostId);
  if (request === null) {
    throw new Error("access token request insert failed");
  }
  return { request, inserted: true };
}

export function markAccessTokenMinted(
  db: Database,
  requestId: string,
  inviteTokenHash: string,
): void {
  const now = Date.now();
  db.prepare(
    `UPDATE access_token_requests
     SET status = 'minted', invite_token_hash = ?, minted_at_ms = ?
     WHERE id = ?`,
  ).run(inviteTokenHash, now, requestId);
}

export function markAccessTokenSent(db: Database, requestId: string): void {
  const now = Date.now();
  db.prepare(`UPDATE access_token_requests SET status = 'sent', sent_at_ms = ? WHERE id = ?`).run(
    now,
    requestId,
  );
}

export function listAccessTokenRequestsForEmail(db: Database, email: string): AccessTokenRequest[] {
  const rows = db
    .prepare(
      `SELECT id, email, host_id, account_id, membership_id, status, invite_token_hash,
              requested_at_ms, minted_at_ms, sent_at_ms, redeemed_at_ms, source_app
       FROM access_token_requests WHERE email = ? ORDER BY requested_at_ms DESC`,
    )
    .all(normalizeEmail(email)) as AccessTokenRequestRow[];
  return rows.map(mapRequest);
}

export function listAccessTokenRequestsForAccount(
  db: Database,
  accountId: string,
): AccessTokenRequest[] {
  const rows = db
    .prepare(
      `SELECT id, email, host_id, account_id, membership_id, status, invite_token_hash,
              requested_at_ms, minted_at_ms, sent_at_ms, redeemed_at_ms, source_app
       FROM access_token_requests WHERE account_id = ? ORDER BY requested_at_ms DESC`,
    )
    .all(accountId) as AccessTokenRequestRow[];
  return rows.map(mapRequest);
}

export function getAccessTokenRequestById(
  db: Database,
  requestId: string,
): AccessTokenRequest | null {
  const row = db
    .prepare(
      `SELECT id, email, host_id, account_id, membership_id, status, invite_token_hash,
              requested_at_ms, minted_at_ms, sent_at_ms, redeemed_at_ms, source_app
       FROM access_token_requests WHERE id = ? LIMIT 1`,
    )
    .get(requestId) as AccessTokenRequestRow | null;
  return row === null ? null : mapRequest(row);
}
