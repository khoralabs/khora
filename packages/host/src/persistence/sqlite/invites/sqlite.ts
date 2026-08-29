import type { Database } from "bun:sqlite";
import { generateInvitePlaintext, hashInviteToken } from "../../../invites";
import type {
  InvitePreviewResult,
  KhoraInviteAdminListRow,
  KhoraInviteListRow,
  KhoraInvitesRepo,
} from "../../core/port";
import { ensureKhoraInviteSchema, KHORA_INVITE_KIND } from "./schema";

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

export function createKhoraInvitesSqliteRepo(db: Database, pepper: string): KhoraInvitesRepo {
  ensureKhoraInviteSchema(db);

  const insertSeed = db.prepare(
    `INSERT OR IGNORE INTO khora_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  );
  const countByKind = db.query<{ c: number }, [string]>(
    `SELECT COUNT(1) AS c FROM khora_invite_tokens WHERE kind = ?`,
  );
  const insertRoot = db.prepare(
    `INSERT INTO khora_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
     VALUES (?, ?, NULL, NULL, NULL, ?)`,
  );
  const consumeToken = db.prepare(
    `UPDATE khora_invite_tokens SET consumed_at_ms = ?, consumed_by_did = ?
     WHERE token_hash = ? AND consumed_at_ms IS NULL`,
  );
  const rollbackToken = db.prepare(
    `UPDATE khora_invite_tokens SET consumed_at_ms = NULL, consumed_by_did = NULL
     WHERE token_hash = ? AND consumed_by_did = ?`,
  );
  const insertStandard = db.prepare(
    `INSERT INTO khora_invite_tokens (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind)
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
     FROM khora_invite_tokens
     WHERE minted_by_did = ?
     ORDER BY created_at_ms ASC`,
  );
  const selectAllInvites = db.query<
    {
      token_hash: string;
      created_at_ms: number;
      consumed_at_ms: number | null;
      consumed_by_did: string | null;
      minted_by_did: string | null;
      kind: string;
    },
    [number]
  >(
    `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind
     FROM khora_invite_tokens
     ORDER BY created_at_ms DESC
     LIMIT ?`,
  );
  const selectAllInvitesForMinter = db.query<
    {
      token_hash: string;
      created_at_ms: number;
      consumed_at_ms: number | null;
      consumed_by_did: string | null;
      minted_by_did: string | null;
      kind: string;
    },
    [string, number]
  >(
    `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind
     FROM khora_invite_tokens
     WHERE minted_by_did = ?
     ORDER BY created_at_ms DESC
     LIMIT ?`,
  );
  const deleteForPrincipal = db.prepare(
    `DELETE FROM khora_invite_tokens WHERE minted_by_did = ? OR consumed_by_did = ?`,
  );

  const selectByHashForPreview = db.query<
    {
      consumed_at_ms: number | null;
      minted_by_did: string | null;
      kind: string;
    },
    [string]
  >(`SELECT consumed_at_ms, minted_by_did, kind FROM khora_invite_tokens WHERE token_hash = ?`);

  return {
    insertSeedInviteTokens(plaintexts) {
      const now = Date.now();
      let inserted = 0;
      for (const t of plaintexts) {
        const hash = hashInviteToken(pepper, t);
        const r = insertSeed.run(hash, now, KHORA_INVITE_KIND.seed);
        if (r.changes > 0) inserted++;
      }
      return inserted;
    },

    ensureRootInviteIfAbsent() {
      const exists = countByKind.get(KHORA_INVITE_KIND.root);
      if (exists !== null && exists !== undefined && exists.c > 0) {
        return undefined;
      }
      const plaintext = generateInvitePlaintext();
      const hash = hashInviteToken(pepper, plaintext);
      try {
        insertRoot.run(hash, Date.now(), KHORA_INVITE_KIND.root);
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
          insertStandard.run(hash, now, mintedByDid, KHORA_INVITE_KIND.standard);
          plaintexts.push(plaintext);
        }
      })();
      return plaintexts;
    },

    listInvitesMintedForDid(minterDid): KhoraInviteListRow[] {
      const rows = selectMintedForDid.all(minterDid);
      return rows.map((r) => ({
        preview: previewFromHash(r.token_hash),
        consumed: r.consumed_at_ms !== null,
        consumedByDid: r.consumed_by_did ?? undefined,
        createdAtMs: r.created_at_ms,
        kind: r.kind,
      }));
    },

    listAllInviteTokens(params): KhoraInviteAdminListRow[] {
      const limit = params?.limit ?? 100;
      const rows =
        params?.mintedByDid !== undefined && params.mintedByDid.length > 0
          ? selectAllInvitesForMinter.all(params.mintedByDid, limit)
          : selectAllInvites.all(limit);
      return rows.map((r) => ({
        preview: previewFromHash(r.token_hash),
        consumed: r.consumed_at_ms !== null,
        consumedByDid: r.consumed_by_did ?? undefined,
        createdAtMs: r.created_at_ms,
        kind: r.kind,
        mintedByDid: r.minted_by_did,
      }));
    },

    deleteTokensForPrincipal(did: string): void {
      deleteForPrincipal.run(did, did);
    },

    previewInviteToken(plaintext, loadProfileForDid): InvitePreviewResult {
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
      if (row.kind === KHORA_INVITE_KIND.root) {
        return { ok: true, inviter: null, source: "root" };
      }
      return { ok: true, inviter: null, source: "seed" };
    },
  };
}
