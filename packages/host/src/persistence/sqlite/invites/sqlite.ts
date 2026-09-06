import type { Database } from "bun:sqlite";
import { generateInvitePlaintext, hashInviteToken } from "../../../invites";
import type {
  InvitePreviewResult,
  KhoraInviteAdminListRow,
  KhoraInviteListRow,
  KhoraInvitesRepo,
  KhoraInviteTreeNode,
} from "../../core/port";
import { ensureKhoraInviteSchema, KHORA_INVITE_KIND } from "./schema";

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

type TokenRow = {
  token_hash: string;
  created_at_ms: number;
  consumed_at_ms: number | null;
  consumed_by_did: string | null;
  minted_by_did: string | null;
  kind: string;
  parent_token_hash: string | null;
};

export function createKhoraInvitesSqliteRepo(db: Database, pepper: string): KhoraInvitesRepo {
  ensureKhoraInviteSchema(db);

  const insertSeed = db.prepare(
    `INSERT OR IGNORE INTO khora_invite_tokens
       (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind, parent_token_hash)
     VALUES (?, ?, NULL, NULL, NULL, ?, NULL)`,
  );
  const countByKind = db.query<{ c: number }, [string]>(
    `SELECT COUNT(1) AS c FROM khora_invite_tokens WHERE kind = ?`,
  );
  const insertRoot = db.prepare(
    `INSERT INTO khora_invite_tokens
       (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind, parent_token_hash)
     VALUES (?, ?, NULL, NULL, NULL, ?, NULL)`,
  );
  const selectByHash = db.query<
    {
      consumed_at_ms: number | null;
      minted_by_did: string | null;
      kind: string;
      parent_token_hash: string | null;
    },
    [string]
  >(
    `SELECT consumed_at_ms, minted_by_did, kind, parent_token_hash
     FROM khora_invite_tokens WHERE token_hash = ?`,
  );
  const consumeToken = db.prepare(
    `UPDATE khora_invite_tokens SET consumed_at_ms = ?, consumed_by_did = ?
     WHERE token_hash = ? AND consumed_at_ms IS NULL`,
  );
  const insertLineage = db.prepare(
    `INSERT OR IGNORE INTO khora_invite_lineage
       (token_hash, parent_token_hash, inviter_did, invitee_did, consumed_at_ms, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const rollbackToken = db.prepare(
    `UPDATE khora_invite_tokens SET consumed_at_ms = NULL, consumed_by_did = NULL
     WHERE token_hash = ? AND consumed_by_did = ?`,
  );
  const deleteLineage = db.prepare(
    `DELETE FROM khora_invite_lineage WHERE token_hash = ? AND invitee_did = ?`,
  );
  const insertStandard = db.prepare(
    `INSERT INTO khora_invite_tokens
       (token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind, parent_token_hash)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
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
  const selectAllInvites = db.query<TokenRow, [number]>(
    `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind, parent_token_hash
     FROM khora_invite_tokens
     ORDER BY created_at_ms DESC
     LIMIT ?`,
  );
  const selectAllInvitesForMinter = db.query<TokenRow, [string, number]>(
    `SELECT token_hash, created_at_ms, consumed_at_ms, consumed_by_did, minted_by_did, kind, parent_token_hash
     FROM khora_invite_tokens
     WHERE minted_by_did = ?
     ORDER BY created_at_ms DESC
     LIMIT ?`,
  );
  const deleteForPrincipal = db.prepare(
    `DELETE FROM khora_invite_tokens WHERE minted_by_did = ? OR consumed_by_did = ?`,
  );

  const selectDescendants = db.query<
    {
      invitee_did: string;
      depth: number;
      inviter_did: string | null;
      consumed_at_ms: number;
      kind: string;
    },
    [string, number, number]
  >(
    `WITH RECURSIVE walk(invitee_did, depth, inviter_did, consumed_at_ms, kind) AS (
       SELECT l.invitee_did, 1, l.inviter_did, l.consumed_at_ms, l.kind
       FROM khora_invite_lineage l
       WHERE l.inviter_did = ?
       UNION
       SELECT l.invitee_did, w.depth + 1, l.inviter_did, l.consumed_at_ms, l.kind
       FROM khora_invite_lineage l
       JOIN walk w ON l.inviter_did = w.invitee_did
       WHERE w.depth < ?
     )
     SELECT invitee_did, depth, inviter_did, consumed_at_ms, kind
     FROM walk
     ORDER BY depth ASC, consumed_at_ms ASC
     LIMIT ?`,
  );

  const selectAncestors = db.query<
    {
      inviter_did: string;
      depth: number;
      consumed_at_ms: number;
      kind: string;
    },
    [string, number, number]
  >(
    `WITH RECURSIVE walk(inviter_did, depth, consumed_at_ms, kind, child_did) AS (
       SELECT l.inviter_did, 1, l.consumed_at_ms, l.kind, l.invitee_did
       FROM khora_invite_lineage l
       WHERE l.invitee_did = ? AND l.inviter_did IS NOT NULL
       UNION
       SELECT l.inviter_did, w.depth + 1, l.consumed_at_ms, l.kind, l.invitee_did
       FROM khora_invite_lineage l
       JOIN walk w ON l.invitee_did = w.inviter_did
       WHERE w.depth < ? AND l.inviter_did IS NOT NULL
     )
     SELECT inviter_did, depth, consumed_at_ms, kind
     FROM walk
     ORDER BY depth ASC
     LIMIT ?`,
  );

  const selectRootFrontier = db.query<
    {
      invitee_did: string;
      consumed_at_ms: number;
      kind: string;
    },
    [number]
  >(
    `SELECT invitee_did, consumed_at_ms, kind
     FROM khora_invite_lineage
     WHERE inviter_did IS NULL
     ORDER BY consumed_at_ms ASC
     LIMIT ?`,
  );

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
      const existing = selectByHash.get(tokenHash);
      if (existing === undefined || existing === null || existing.consumed_at_ms !== null) {
        return false;
      }
      const now = Date.now();
      const consumeAndLineage = db.transaction(() => {
        const r = consumeToken.run(now, consumerDid, tokenHash);
        if (r.changes !== 1) return false;
        insertLineage.run(
          tokenHash,
          existing.parent_token_hash,
          existing.minted_by_did,
          consumerDid,
          now,
          existing.kind,
        );
        return true;
      });
      return consumeAndLineage();
    },

    rollbackInviteConsumption(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      db.transaction(() => {
        const r = rollbackToken.run(tokenHash, consumerDid);
        if (r.changes === 1) {
          deleteLineage.run(tokenHash, consumerDid);
        }
      })();
    },

    mintStandardInviteTokens(mintedByDid, count, opts) {
      const plaintexts: string[] = [];
      const now = Date.now();
      const parentTokenHash =
        opts?.parentPlaintext !== undefined ? hashInviteToken(pepper, opts.parentPlaintext) : null;
      db.transaction(() => {
        for (let i = 0; i < count; i++) {
          const plaintext = generateInvitePlaintext();
          const hash = hashInviteToken(pepper, plaintext);
          insertStandard.run(hash, now, mintedByDid, KHORA_INVITE_KIND.standard, parentTokenHash);
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
      const row = selectByHash.get(tokenHash);
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

    inviteDescendants(did, opts): KhoraInviteTreeNode[] {
      const rows = selectDescendants.all(did, opts.maxDepth, opts.maxNodes);
      return rows.map((r) => ({
        did: r.invitee_did,
        depth: r.depth,
        inviterDid: r.inviter_did,
        invitedAtMs: r.consumed_at_ms,
        kind: r.kind,
      }));
    },

    inviteAncestors(did, opts): KhoraInviteTreeNode[] {
      const rows = selectAncestors.all(did, opts.maxDepth, opts.maxDepth);
      return rows.map((r) => ({
        did: r.inviter_did,
        depth: r.depth,
        inviterDid: null,
        invitedAtMs: r.consumed_at_ms,
        kind: r.kind,
      }));
    },

    inviteRootFrontier(maxNodes): KhoraInviteTreeNode[] {
      return selectRootFrontier.all(maxNodes).map((r) => ({
        did: r.invitee_did,
        depth: 1,
        inviterDid: null,
        invitedAtMs: r.consumed_at_ms,
        kind: r.kind,
      }));
    },
  };
}
