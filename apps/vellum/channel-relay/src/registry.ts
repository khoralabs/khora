import type { Database } from "bun:sqlite";
import {
  DEFAULT_VELLUM_MAX_CHAINS,
  type VellumAdmissionMode,
  type VellumChannelPolicy,
  type VellumMaxChains,
} from "@khoralabs/vellum-contracts";

import { hashInviteToken } from "./invites";
import {
  DEFAULT_WS_UPGRADE_NONCE_TTL_MS,
  hashWsUpgradeNonce,
  randomWsUpgradeNonce,
} from "./ws-upgrade-nonce";

export type ChannelRow = {
  channelId: string;
  creatorDid: string;
  admissionMode: VellumAdmissionMode;
  maxPopulation: number | null;
  maxChains: VellumMaxChains;
  expiresAtMs: number;
  createdAtMs: number;
};

export function isRosterAtCapacity(memberCount: number, maxPopulation: number | null): boolean {
  return maxPopulation !== null && memberCount >= maxPopulation;
}

function rowToMaxChains(mode: string, measure: number | null): VellumMaxChains {
  if (mode === "global") {
    return { mode: "global", measure: measure ?? 1 };
  }
  return { mode: "principal", measure: measure ?? 1 };
}

function maxChainsToDb(maxChains: VellumMaxChains): { mode: string; measure: number | null } {
  return { mode: maxChains.mode, measure: maxChains.measure };
}

function initialChainQuota(maxChains: VellumMaxChains): number | null {
  if (maxChains.mode === "principal") return maxChains.measure;
  return null;
}

export function createChannelRegistry(db: Database) {
  const insertChannelStmt = db.prepare(
    `INSERT INTO channels (
      channel_id, creator_did, admission_mode, max_population,
      chain_limit_mode, chain_limit_measure, expires_at_ms, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMemberStmt = db.prepare(
    `INSERT INTO channel_members (channel_id, principal_did, role, status, chain_quota, joined_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, principal_did) DO UPDATE SET
       status = excluded.status,
       chain_quota = excluded.chain_quota,
       joined_at_ms = excluded.joined_at_ms`,
  );
  const insertInviteStmt = db.prepare(
    `INSERT INTO channel_invites (token_hash, channel_id, creator_did, expires_at_ms)
     VALUES (?, ?, ?, ?)`,
  );
  const redeemInviteStmt = db.prepare(
    `UPDATE channel_invites SET redeemed_at_ms = ?, redeemed_by_did = ? WHERE token_hash = ?`,
  );
  const insertChainStmt = db.prepare(
    `INSERT INTO channel_chains (session_id, channel_id, party_a_did, party_b_did, status, created_at_ms)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  );
  const releaseChainStmt = db.prepare(
    `UPDATE channel_chains SET status = 'released' WHERE channel_id = ? AND session_id = ?`,
  );
  const insertWsNonceStmt = db.prepare(
    `INSERT INTO ws_upgrade_nonces (nonce_hash, channel_id, expires_at_ms, created_at_ms)
     VALUES (?, ?, ?, ?)`,
  );
  const consumeWsNonceStmt = db.prepare(
    `UPDATE ws_upgrade_nonces SET consumed_at_ms = ?
     WHERE nonce_hash = ? AND channel_id = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`,
  );

  return {
    countActiveChannels(nowMs: number): number {
      const row = db
        .query<{ c: number }, [number]>(
          `SELECT COUNT(*) AS c FROM channels WHERE expires_at_ms > ?`,
        )
        .get(nowMs);
      return row?.c ?? 0;
    },

    insertChannel(input: {
      channelId: string;
      creatorDid: string;
      admissionMode: VellumAdmissionMode;
      maxPopulation: number | null;
      maxChains: VellumMaxChains;
      expiresAtMs: number;
      createdAtMs: number;
    }): void {
      const { mode, measure } = maxChainsToDb(input.maxChains);
      insertChannelStmt.run(
        input.channelId,
        input.creatorDid,
        input.admissionMode,
        input.maxPopulation,
        mode,
        measure,
        input.expiresAtMs,
        input.createdAtMs,
      );
      const quota = initialChainQuota(input.maxChains);
      insertMemberStmt.run(
        input.channelId,
        input.creatorDid,
        "creator",
        "active",
        quota,
        input.createdAtMs,
      );
    },

    getChannel(channelId: string, nowMs: number): ChannelRow | undefined {
      const row = db
        .query<
          {
            channel_id: string;
            creator_did: string;
            admission_mode: string;
            max_population: number | null;
            chain_limit_mode: string;
            chain_limit_measure: number | null;
            expires_at_ms: number;
            created_at_ms: number;
          },
          [string, number]
        >(
          `SELECT channel_id, creator_did, admission_mode, max_population,
                  chain_limit_mode, chain_limit_measure, expires_at_ms, created_at_ms
           FROM channels WHERE channel_id = ? AND expires_at_ms > ?`,
        )
        .get(channelId, nowMs);
      if (row === undefined || row === null) return undefined;
      return {
        channelId: row.channel_id,
        creatorDid: row.creator_did,
        admissionMode: row.admission_mode as VellumAdmissionMode,
        maxPopulation: row.max_population,
        maxChains: rowToMaxChains(row.chain_limit_mode, row.chain_limit_measure),
        expiresAtMs: row.expires_at_ms,
        createdAtMs: row.created_at_ms,
      };
    },

    channelPolicy(channel: ChannelRow): VellumChannelPolicy {
      return {
        admissionMode: channel.admissionMode,
        ...(channel.maxPopulation !== null ? { maxPopulation: channel.maxPopulation } : {}),
        maxChains: channel.maxChains,
      };
    },

    isActiveMember(channelId: string, principalDid: string): boolean {
      const row = db
        .query<{ c: number }, [string, string]>(
          `SELECT COUNT(*) AS c FROM channel_members
           WHERE channel_id = ? AND principal_did = ? AND status = 'active'`,
        )
        .get(channelId, principalDid);
      return (row?.c ?? 0) > 0;
    },

    countActiveMembers(channelId: string): number {
      const row = db
        .query<{ c: number }, [string]>(
          `SELECT COUNT(*) AS c FROM channel_members WHERE channel_id = ? AND status = 'active'`,
        )
        .get(channelId);
      return row?.c ?? 0;
    },

    addMember(input: {
      channelId: string;
      principalDid: string;
      maxChains: VellumMaxChains;
      joinedAtMs: number;
    }): void {
      const quota = initialChainQuota(input.maxChains);
      insertMemberStmt.run(
        input.channelId,
        input.principalDid,
        "member",
        "active",
        quota,
        input.joinedAtMs,
      );
    },

    putInvite(
      token: string,
      input: {
        channelId: string;
        creatorDid: string;
        expiresAtMs: number;
      },
    ): void {
      insertInviteStmt.run(
        hashInviteToken(token),
        input.channelId,
        input.creatorDid,
        input.expiresAtMs,
      );
    },

    redeemInvite(
      token: string,
      consumerDid: string,
      nowMs: number,
    ): { channelId: string; creatorDid: string } | undefined {
      const hash = hashInviteToken(token);
      const row = db
        .query<
          {
            channel_id: string;
            creator_did: string;
            expires_at_ms: number;
            redeemed_at_ms: number | null;
          },
          [string]
        >(
          `SELECT channel_id, creator_did, expires_at_ms, redeemed_at_ms FROM channel_invites WHERE token_hash = ?`,
        )
        .get(hash);
      if (row === undefined || row === null) return undefined;
      if (row.expires_at_ms <= nowMs) return undefined;
      if (row.redeemed_at_ms !== null) return undefined;
      redeemInviteStmt.run(nowMs, consumerDid, hash);
      return { channelId: row.channel_id, creatorDid: row.creator_did };
    },

    getMemberChainQuota(channelId: string, principalDid: string): number | null | undefined {
      const row = db
        .query<{ chain_quota: number | null }, [string, string]>(
          `SELECT chain_quota FROM channel_members
           WHERE channel_id = ? AND principal_did = ? AND status = 'active'`,
        )
        .get(channelId, principalDid);
      if (row === undefined || row === null) return undefined;
      return row.chain_quota;
    },

    countActiveChains(channelId: string): number {
      const row = db
        .query<{ c: number }, [string]>(
          `SELECT COUNT(*) AS c FROM channel_chains WHERE channel_id = ? AND status = 'active'`,
        )
        .get(channelId);
      return row?.c ?? 0;
    },

    countActiveChainsForMember(channelId: string, principalDid: string): number {
      const row = db
        .query<{ c: number }, [string, string, string]>(
          `SELECT COUNT(*) AS c FROM channel_chains
           WHERE channel_id = ? AND status = 'active'
             AND (party_a_did = ? OR party_b_did = ?)`,
        )
        .get(channelId, principalDid, principalDid);
      return row?.c ?? 0;
    },

    allocateChain(input: {
      channelId: string;
      sessionId: string;
      partyADid: string;
      partyBDid: string;
      maxChains: VellumMaxChains;
      createdAtMs: number;
    }): { ok: true } | { ok: false; reason: string } {
      const [a, b] =
        input.partyADid < input.partyBDid
          ? [input.partyADid, input.partyBDid]
          : [input.partyBDid, input.partyADid];

      if (input.maxChains.mode === "global") {
        const total = this.countActiveChains(input.channelId);
        if (total >= input.maxChains.measure) {
          return { ok: false, reason: "channel chain capacity reached" };
        }
      } else {
        for (const did of [a, b]) {
          const quota = this.getMemberChainQuota(input.channelId, did);
          if (quota === undefined) {
            return { ok: false, reason: "member not found" };
          }
          if (quota === null) {
            continue;
          }
          if (quota <= 0) {
            return { ok: false, reason: "member chain budget not allocated" };
          }
          const used = this.countActiveChainsForMember(input.channelId, did);
          if (used >= quota) {
            return { ok: false, reason: "member chain quota exceeded" };
          }
        }
      }

      try {
        insertChainStmt.run(input.sessionId, input.channelId, a, b, input.createdAtMs);
        return { ok: true };
      } catch {
        return { ok: false, reason: "chain slot already allocated" };
      }
    },

    releaseChain(channelId: string, sessionId: string, principalDid: string): boolean {
      const row = db
        .query<{ party_a_did: string; party_b_did: string; status: string }, [string, string]>(
          `SELECT party_a_did, party_b_did, status FROM channel_chains
           WHERE channel_id = ? AND session_id = ?`,
        )
        .get(channelId, sessionId);
      if (row === undefined || row === null || row.status !== "active") return false;
      if (row.party_a_did !== principalDid && row.party_b_did !== principalDid) {
        return false;
      }
      releaseChainStmt.run(channelId, sessionId);
      return true;
    },

    isChainAllocated(channelId: string, sessionId: string): boolean {
      const row = db
        .query<{ c: number }, [string, string]>(
          `SELECT COUNT(*) AS c FROM channel_chains
           WHERE channel_id = ? AND session_id = ? AND status = 'active'`,
        )
        .get(channelId, sessionId);
      return (row?.c ?? 0) > 0;
    },

    mintWsUpgradeNonce(
      channelId: string,
      channelExpiresAtMs: number,
      nowMs: number,
    ): { nonce: string; expiresAtMs: number } {
      db.run(`DELETE FROM ws_upgrade_nonces WHERE expires_at_ms <= ?`, [nowMs]);
      const nonce = randomWsUpgradeNonce();
      const expiresAtMs = Math.min(channelExpiresAtMs, nowMs + DEFAULT_WS_UPGRADE_NONCE_TTL_MS);
      insertWsNonceStmt.run(hashWsUpgradeNonce(nonce), channelId, expiresAtMs, nowMs);
      return { nonce, expiresAtMs };
    },

    consumeWsUpgradeNonce(channelId: string, nonce: string, nowMs: number): boolean {
      const result = consumeWsNonceStmt.run(nowMs, hashWsUpgradeNonce(nonce), channelId, nowMs);
      return result.changes > 0;
    },
  };
}

export type ChannelRegistry = ReturnType<typeof createChannelRegistry>;

export function parseCreateChannelPolicy(body: {
  maxPopulation?: number | undefined;
  maxChains?: VellumMaxChains | undefined;
}): {
  admissionMode: VellumAdmissionMode;
  maxPopulation: number | null;
  maxChains: VellumMaxChains;
} {
  return {
    admissionMode: "invite_only",
    maxPopulation: body.maxPopulation ?? null,
    maxChains: body.maxChains ?? DEFAULT_VELLUM_MAX_CHAINS,
  };
}
