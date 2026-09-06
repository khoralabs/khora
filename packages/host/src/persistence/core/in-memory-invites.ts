import { generateInvitePlaintext, hashInviteToken } from "../../invites/crypto";
import type {
  InvitePreviewResult,
  KhoraInviteAdminListRow,
  KhoraInviteListRow,
  KhoraInvitesRepo,
  KhoraInviteTreeNode,
} from "./port";
import { KHORA_INVITE_KIND } from "./schema/invites-ddl";

type InviteRow = {
  tokenHash: string;
  createdAtMs: number;
  consumedAtMs: number | null;
  consumedByDid: string | null;
  mintedByDid: string | null;
  kind: string;
  parentTokenHash: string | null;
};

type LineageRow = {
  tokenHash: string;
  parentTokenHash: string | null;
  inviterDid: string | null;
  inviteeDid: string;
  consumedAtMs: number;
  kind: string;
};

function previewFromHash(tokenHash: string): string {
  if (tokenHash.length <= 12) return `${tokenHash.slice(0, 4)}…`;
  return `${tokenHash.slice(0, 6)}…${tokenHash.slice(-4)}`;
}

export function createInMemoryKhoraInvitesRepo(pepper: string): KhoraInvitesRepo {
  const byHash = new Map<string, InviteRow>();
  /** Append-only; not cleared by deleteTokensForPrincipal. */
  const lineage = new Map<string, LineageRow>();

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
          parentTokenHash: null,
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
        parentTokenHash: null,
      });
      return plaintext;
    },

    tryConsumeInviteToken(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = byHash.get(tokenHash);
      if (row === undefined || row.consumedAtMs !== null) return false;
      const now = Date.now();
      row.consumedAtMs = now;
      row.consumedByDid = consumerDid;
      lineage.set(tokenHash, {
        tokenHash,
        parentTokenHash: row.parentTokenHash,
        inviterDid: row.mintedByDid,
        inviteeDid: consumerDid,
        consumedAtMs: now,
        kind: row.kind,
      });
      return true;
    },

    rollbackInviteConsumption(plaintext, consumerDid) {
      const tokenHash = hashInviteToken(pepper, plaintext);
      const row = byHash.get(tokenHash);
      if (row === undefined || row.consumedByDid !== consumerDid) return;
      row.consumedAtMs = null;
      row.consumedByDid = null;
      lineage.delete(tokenHash);
    },

    mintStandardInviteTokens(mintedByDid, count, opts) {
      const plaintexts: string[] = [];
      const now = Date.now();
      const parentTokenHash =
        opts?.parentPlaintext !== undefined ? hashInviteToken(pepper, opts.parentPlaintext) : null;
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
          parentTokenHash,
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

    inviteDescendants(did, opts): KhoraInviteTreeNode[] {
      const out: KhoraInviteTreeNode[] = [];
      const visited = new Set<string>([did]);
      let frontier: Array<{ did: string; depth: number }> = [{ did, depth: 0 }];
      while (frontier.length > 0 && out.length < opts.maxNodes) {
        const next: Array<{ did: string; depth: number }> = [];
        for (const cur of frontier) {
          if (cur.depth >= opts.maxDepth) continue;
          for (const edge of lineage.values()) {
            if (edge.inviterDid !== cur.did) continue;
            if (visited.has(edge.inviteeDid)) continue;
            visited.add(edge.inviteeDid);
            const depth = cur.depth + 1;
            out.push({
              did: edge.inviteeDid,
              depth,
              inviterDid: edge.inviterDid,
              invitedAtMs: edge.consumedAtMs,
              kind: edge.kind,
            });
            if (out.length >= opts.maxNodes) return out;
            next.push({ did: edge.inviteeDid, depth });
          }
        }
        frontier = next;
      }
      return out;
    },

    inviteAncestors(did, opts): KhoraInviteTreeNode[] {
      const out: KhoraInviteTreeNode[] = [];
      const visited = new Set<string>([did]);
      let currentDid: string | null = did;
      let depth = 0;
      while (currentDid !== null && depth < opts.maxDepth) {
        let parent: LineageRow | undefined;
        for (const edge of lineage.values()) {
          if (edge.inviteeDid === currentDid) {
            parent = edge;
            break;
          }
        }
        if (parent === undefined || parent.inviterDid === null) break;
        if (visited.has(parent.inviterDid)) break;
        visited.add(parent.inviterDid);
        depth += 1;
        out.push({
          did: parent.inviterDid,
          depth,
          inviterDid: null,
          invitedAtMs: parent.consumedAtMs,
          kind: parent.kind,
        });
        currentDid = parent.inviterDid;
      }
      return out;
    },

    inviteRootFrontier(maxNodes): KhoraInviteTreeNode[] {
      return [...lineage.values()]
        .filter((e) => e.inviterDid === null)
        .sort((a, b) => a.consumedAtMs - b.consumedAtMs)
        .slice(0, maxNodes)
        .map((e) => ({
          did: e.inviteeDid,
          depth: 1,
          inviterDid: null,
          invitedAtMs: e.consumedAtMs,
          kind: e.kind,
        }));
    },
  };
}
