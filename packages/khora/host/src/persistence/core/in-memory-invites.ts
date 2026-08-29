import { generateInvitePlaintext, hashInviteToken } from "../../invites/crypto";
import type {
  InvitePreviewResult,
  KhoraInviteAdminListRow,
  KhoraInviteListRow,
  KhoraInvitesRepo,
} from "./port";
import { KHORA_INVITE_KIND } from "./schema/invites-ddl";

type InviteRow = {
  tokenHash: string;
  createdAtMs: number;
  consumedAtMs: number | null;
  consumedByDid: string | null;
  mintedByDid: string | null;
  kind: string;
};

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

export function createInMemoryKhoraInvitesRepo(pepper: string): KhoraInvitesRepo {
  const byHash = new Map<string, InviteRow>();

  return {
    insertSeedInviteTokens(plaintexts) {
      const now = Date.now();
      let inserted = 0;
      for (const t of plaintexts) {
        const tokenHash = hashInviteToken(pepper, t);
        if (byHash.has(tokenHash)) continue;
        byHash.set(tokenHash, {
          tokenHash,
          createdAtMs: now,
          consumedAtMs: null,
          consumedByDid: null,
          mintedByDid: null,
          kind: KHORA_INVITE_KIND.seed,
        });
        inserted++;
      }
      return inserted;
    },

    ensureRootInviteIfAbsent() {
      for (const row of byHash.values()) {
        if (row.kind === KHORA_INVITE_KIND.root) return undefined;
      }
      const plaintext = generateInvitePlaintext();
      const tokenHash = hashInviteToken(pepper, plaintext);
      byHash.set(tokenHash, {
        tokenHash,
        createdAtMs: Date.now(),
        consumedAtMs: null,
        consumedByDid: null,
        mintedByDid: null,
        kind: KHORA_INVITE_KIND.root,
      });
      return plaintext;
    },

    tryConsumeInviteToken(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = byHash.get(tokenHash);
      if (row === undefined || row.consumedAtMs !== null) return false;
      row.consumedAtMs = Date.now();
      row.consumedByDid = consumerDid;
      return true;
    },

    rollbackInviteConsumption(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = byHash.get(tokenHash);
      if (row === undefined || row.consumedByDid !== consumerDid) return;
      row.consumedAtMs = null;
      row.consumedByDid = null;
    },

    mintStandardInviteTokens(mintedByDid, count) {
      const plaintexts: string[] = [];
      const now = Date.now();
      for (let i = 0; i < count; i++) {
        const plaintext = generateInvitePlaintext();
        const tokenHash = hashInviteToken(pepper, plaintext);
        byHash.set(tokenHash, {
          tokenHash,
          createdAtMs: now,
          consumedAtMs: null,
          consumedByDid: null,
          mintedByDid,
          kind: KHORA_INVITE_KIND.standard,
        });
        plaintexts.push(plaintext);
      }
      return plaintexts;
    },

    listInvitesMintedForDid(minterDid): KhoraInviteListRow[] {
      return [...byHash.values()]
        .filter((r) => r.mintedByDid === minterDid)
        .sort((a, b) => a.createdAtMs - b.createdAtMs)
        .map((r) => ({
          preview: previewFromHash(r.tokenHash),
          consumed: r.consumedAtMs !== null,
          consumedByDid: r.consumedByDid ?? undefined,
          createdAtMs: r.createdAtMs,
          kind: r.kind,
        }));
    },

    listAllInviteTokens(params): KhoraInviteAdminListRow[] {
      const limit = params?.limit ?? 100;
      let rows = [...byHash.values()];
      if (params?.mintedByDid !== undefined && params.mintedByDid.length > 0) {
        rows = rows.filter((r) => r.mintedByDid === params.mintedByDid);
      }
      return rows
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, limit)
        .map((r) => ({
          preview: previewFromHash(r.tokenHash),
          consumed: r.consumedAtMs !== null,
          consumedByDid: r.consumedByDid ?? undefined,
          createdAtMs: r.createdAtMs,
          kind: r.kind,
          mintedByDid: r.mintedByDid,
        }));
    },

    deleteTokensForPrincipal(did: string): void {
      for (const [hash, row] of byHash) {
        if (row.mintedByDid === did || row.consumedByDid === did) {
          byHash.delete(hash);
        }
      }
    },

    previewInviteToken(plaintext, loadProfileForDid): InvitePreviewResult {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = byHash.get(tokenHash);
      if (row === undefined || row.consumedAtMs !== null) {
        return { ok: false };
      }
      if (row.mintedByDid !== null && row.mintedByDid.length > 0) {
        const profile = loadProfileForDid(row.mintedByDid);
        return {
          ok: true,
          inviter: { did: row.mintedByDid, profile: profile ?? null },
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
