import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { ATRIUM_INVITE_KIND, ensureAtriumInviteSchema } from "./schema.ts";

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

export type AtriumInviteListRow = {
  preview: string;
  consumed: boolean;
  consumedByDid: string | undefined;
  createdAtMs: number;
  kind: string;
};

export type InvitePreviewResult =
  | {
      ok: true;
      inviter: { did: string; profile: unknown } | null;
      source: "inviter" | "root" | "seed";
    }
  | { ok: false };

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

export type AtriumInvitesRepo = {
  insertSeedInviteTokens(plaintexts: string[]): number;
  ensureRootInviteIfAbsent(): string | undefined;
  tryConsumeInviteToken(plaintext: string, consumerDid: string): boolean;
  rollbackInviteConsumption(plaintext: string, consumerDid: string): void;
  mintStandardInviteTokens(mintedByDid: string, count: number): string[];
  listInvitesMintedForDid(minterDid: string): AtriumInviteListRow[];
  previewInviteToken(
    plaintext: string,
    loadProfileForDid: (did: string) => unknown | null | undefined,
  ): InvitePreviewResult;
};

export function createAtriumInvitesRepo(db: Database, pepper: string): AtriumInvitesRepo {
  ensureAtriumInviteSchema(db);

  const insertSeed = db.prepare(
    `INSERT OR IGNORE INTO at2_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  );
  const countByKind = db.query<{ c: number }, [string]>(
    `SELECT COUNT(1) AS c FROM at2_invite_tokens WHERE kind = ?`,
  );
  const insertRoot = db.prepare(
    `INSERT INTO at2_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  );
  const consumeToken = db.prepare(
    `UPDATE at2_invite_tokens SET consumed_at_ms = ?, consumed_by_did = ?
     WHERE token_hash = ? AND consumed_at_ms IS NULL`,
  );
  const rollbackToken = db.prepare(
    `UPDATE at2_invite_tokens SET consumed_at_ms = NULL, consumed_by_did = NULL
     WHERE token_hash = ? AND consumed_by_did = ?`,
  );
  const insertStandard = db.prepare(
    `INSERT INTO at2_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, ?, ?)`,
  );
  const selectMintedForDid = db.query<
    {
      token_hash: string;
      created_at_ms: number;
      consumed_at_ms: number | null;
      consumed_by_did: string | null;
      kind: string;
    },
    [string]
  >(
    `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, kind
     FROM at2_invite_tokens
     WHERE minted_by_did = ?
     ORDER BY created_at_ms ASC`,
  );
  const selectByHashForPreview = db.query<
    {
      consumed_at_ms: number | null;
      minted_by_did: string | null;
      kind: string;
    },
    [string]
  >(`SELECT consumed_at_ms, minted_by_did, kind FROM at2_invite_tokens WHERE token_hash = ?`);

  return {
    insertSeedInviteTokens(plaintexts) {
      const now = Date.now();
      let inserted = 0;
      for (const t of plaintexts) {
        const hash = hashInviteToken(pepper, t);
        const r = insertSeed.run(hash, now, ATRIUM_INVITE_KIND.seed);
        if (r.changes > 0) inserted++;
      }
      return inserted;
    },

    ensureRootInviteIfAbsent() {
      const exists = countByKind.get(ATRIUM_INVITE_KIND.root);
      if (exists !== null && exists !== undefined && exists.c > 0) {
        return undefined;
      }
      const plaintext = generateInvitePlaintext();
      const hash = hashInviteToken(pepper, plaintext);
      try {
        insertRoot.run(hash, Date.now(), ATRIUM_INVITE_KIND.root);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE")) {
          return undefined;
        }
        throw e;
      }
      return plaintext;
    },

    tryConsumeInviteToken(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const r = consumeToken.run(Date.now(), consumerDid, tokenHash);
      return r.changes === 1;
    },

    rollbackInviteConsumption(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      rollbackToken.run(tokenHash, consumerDid);
    },

    mintStandardInviteTokens(mintedByDid, count) {
      const plaintexts: string[] = [];
      const now = Date.now();
      db.transaction(() => {
        for (let i = 0; i < count; i++) {
          const plaintext = generateInvitePlaintext();
          const hash = hashInviteToken(pepper, plaintext);
          insertStandard.run(hash, now, mintedByDid, ATRIUM_INVITE_KIND.standard);
          plaintexts.push(plaintext);
        }
      })();
      return plaintexts;
    },

    listInvitesMintedForDid(minterDid) {
      const rows = selectMintedForDid.all(minterDid);
      return rows.map((r) => ({
        preview: previewFromHash(r.token_hash),
        consumed: r.consumed_at_ms !== null,
        consumedByDid: r.consumed_by_did ?? undefined,
        createdAtMs: r.created_at_ms,
        kind: r.kind,
      }));
    },

    previewInviteToken(plaintext, loadProfileForDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = selectByHashForPreview.get(tokenHash);
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
    },
  };
}
