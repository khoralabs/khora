import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { ensureSwarmHostSqliteSchema } from "../persistence/sqlite/schema.ts";

export const ATRIUM_INVITE_KIND = {
  root: "root",
  seed: "seed",
  standard: "standard",
} as const;

export type AtriumInviteKind = (typeof ATRIUM_INVITE_KIND)[keyof typeof ATRIUM_INVITE_KIND];

export function hashInviteToken(pepper: string, plaintext: string): string {
  return createHash("sha256")
    .update(pepper, "utf8")
    .update("\0", "utf8")
    .update(plaintext, "utf8")
    .digest("hex");
}

export function generateInvitePlaintext(): string {
  return randomBytes(24).toString("base64url");
}

export function parseInviteSeedTokens(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readInvitePepper(): string | undefined {
  const p = process.env.ATRIUM_INVITE_PEPPER?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

export function inviteRequiredFromEnv(): boolean {
  return process.env.ATRIUM_INVITE_REQUIRED?.trim() === "1";
}

export function invitesPerRegistrationFromEnv(): number {
  const raw = process.env.ATRIUM_INVITES_PER_REGISTRATION?.trim();
  if (raw === undefined || raw.length === 0) return 10;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 10;
}

/** Require pepper when invites are mandatory or seed env is non-empty. */
export function validateInviteEnvConfig(seedTokens: string[]): void {
  if (inviteRequiredFromEnv() || seedTokens.length > 0) {
    const pepper = readInvitePepper();
    if (pepper === undefined || pepper.length === 0) {
      throw new Error(
        "Set ATRIUM_INVITE_PEPPER when ATRIUM_INVITE_REQUIRED=1 or ATRIUM_INVITE_SEED_TOKENS is non-empty.",
      );
    }
  }
}

export function insertSeedInviteTokens(db: Database, pepper: string, plaintexts: string[]): number {
  ensureSwarmHostSqliteSchema(db);
  const now = Date.now();
  let inserted = 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  );
  for (const t of plaintexts) {
    const hash = hashInviteToken(pepper, t);
    const r = stmt.run(hash, now, ATRIUM_INVITE_KIND.seed);
    if (r.changes > 0) inserted++;
  }
  return inserted;
}

/**
 * If no root row exists and pepper is set, mint one root token and return plaintext (caller logs once).
 * If a root row already exists, return undefined.
 */
export function ensureRootInviteIfAbsent(db: Database, pepper: string): string | undefined {
  ensureSwarmHostSqliteSchema(db);
  const exists = db
    .query(`SELECT COUNT(1) AS c FROM atrium_invite_tokens WHERE kind = ?`)
    .get(ATRIUM_INVITE_KIND.root) as { c: number } | null;
  if (exists !== null && exists.c > 0) {
    return undefined;
  }
  const plaintext = generateInvitePlaintext();
  const hash = hashInviteToken(pepper, plaintext);
  const now = Date.now();
  try {
    db.run(
      `INSERT INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
       VALUES (?, ?, NULL, NULL, NULL, ?)`,
      [hash, now, ATRIUM_INVITE_KIND.root],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return undefined;
    }
    throw e;
  }
  return plaintext;
}

export function tryConsumeInviteToken(
  db: Database,
  pepper: string,
  plaintext: string,
  consumerDid: string,
): boolean {
  ensureSwarmHostSqliteSchema(db);
  const tokenHash = hashInviteToken(pepper, plaintext);
  const now = Date.now();
  const r = db.run(
    `UPDATE atrium_invite_tokens SET consumed_at_ms = ?, consumed_by_did = ?
     WHERE token_hash = ? AND consumed_at_ms IS NULL`,
    [now, consumerDid, tokenHash],
  );
  return r.changes === 1;
}

export function rollbackInviteConsumption(
  db: Database,
  pepper: string,
  plaintext: string,
  consumerDid: string,
): void {
  ensureSwarmHostSqliteSchema(db);
  const tokenHash = hashInviteToken(pepper, plaintext);
  db.run(
    `UPDATE atrium_invite_tokens SET consumed_at_ms = NULL, consumed_by_did = NULL
     WHERE token_hash = ? AND consumed_by_did = ?`,
    [tokenHash, consumerDid],
  );
}

export function mintStandardInviteTokens(
  db: Database,
  pepper: string,
  mintedByDid: string,
  count: number,
): string[] {
  ensureSwarmHostSqliteSchema(db);
  const now = Date.now();
  const plaintexts: string[] = [];
  const insert = db.prepare(
    `INSERT INTO atrium_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, ?, ?)`,
  );
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const plaintext = generateInvitePlaintext();
      const hash = hashInviteToken(pepper, plaintext);
      insert.run(hash, now, mintedByDid, ATRIUM_INVITE_KIND.standard);
      plaintexts.push(plaintext);
    }
  })();
  return plaintexts;
}

export type AtriumInviteListRow = {
  preview: string;
  consumed: boolean;
  consumedByDid: string | undefined;
  createdAtMs: number;
  kind: string;
};

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

export function listInvitesMintedForDid(db: Database, minterDid: string): AtriumInviteListRow[] {
  ensureSwarmHostSqliteSchema(db);
  const rows = db
    .query(
      `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, kind
       FROM atrium_invite_tokens
       WHERE minted_by_did = ?
       ORDER BY created_at_ms ASC`,
    )
    .all(minterDid) as {
    token_hash: string;
    created_at_ms: number;
    consumed_at_ms: number | null;
    consumed_by_did: string | null;
    kind: string;
  }[];
  return rows.map((r) => ({
    preview: previewFromHash(r.token_hash),
    consumed: r.consumed_at_ms !== null,
    consumedByDid: r.consumed_by_did ?? undefined,
    createdAtMs: r.created_at_ms,
    kind: r.kind,
  }));
}

export type InvitePreviewResult =
  | {
      ok: true;
      inviter: { did: string; profile: unknown } | null;
      source: "inviter" | "root" | "seed";
    }
  | { ok: false };

export function previewInviteToken(
  db: Database,
  pepper: string,
  plaintext: string,
  loadProfileForDid: (did: string) => unknown | null | undefined,
): InvitePreviewResult {
  ensureSwarmHostSqliteSchema(db);
  const tokenHash = hashInviteToken(pepper, plaintext);
  const row = db
    .query(
      `SELECT consumed_at_ms, minted_by_did, kind FROM atrium_invite_tokens WHERE token_hash = ?`,
    )
    .get(tokenHash) as {
    consumed_at_ms: number | null;
    minted_by_did: string | null;
    kind: string;
  } | null;
  if (row === undefined || row === null || row.consumed_at_ms !== null) {
    return { ok: false };
  }
  if (row.minted_by_did !== null && row.minted_by_did.length > 0) {
    const profile = loadProfileForDid(row.minted_by_did);
    return {
      ok: true,
      inviter: { did: row.minted_by_did, profile: profile ?? null },
      source: "inviter",
    };
  }
  if (row.kind === ATRIUM_INVITE_KIND.root) {
    return { ok: true, inviter: null, source: "root" };
  }
  return { ok: true, inviter: null, source: "seed" };
}
