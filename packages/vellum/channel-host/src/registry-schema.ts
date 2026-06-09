import type { Database } from "bun:sqlite";

export function ensureChannelRegistrySchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      channel_id TEXT PRIMARY KEY NOT NULL,
      creator_did TEXT NOT NULL,
      admission_mode TEXT NOT NULL CHECK(admission_mode IN ('invite_only')),
      max_population INTEGER,
      chain_limit_mode TEXT NOT NULL CHECK(chain_limit_mode IN ('global', 'principal')),
      chain_limit_measure INTEGER,
      expires_at_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
      principal_did TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('creator', 'member')),
      status TEXT NOT NULL CHECK(status IN ('active', 'pending')),
      chain_quota INTEGER,
      joined_at_ms INTEGER NOT NULL,
      PRIMARY KEY (channel_id, principal_did)
    );

    CREATE TABLE IF NOT EXISTS channel_chains (
      session_id TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
      party_a_did TEXT NOT NULL,
      party_b_did TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'released')),
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (channel_id, session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_channel_chains_party_a
      ON channel_chains (channel_id, party_a_did, status);
    CREATE INDEX IF NOT EXISTS idx_channel_chains_party_b
      ON channel_chains (channel_id, party_b_did, status);

    CREATE TABLE IF NOT EXISTS channel_invites (
      token_hash TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
      creator_did TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      redeemed_at_ms INTEGER,
      redeemed_by_did TEXT
    );

    CREATE TABLE IF NOT EXISTS ws_upgrade_nonces (
      nonce_hash TEXT PRIMARY KEY NOT NULL,
      channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
      expires_at_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      consumed_at_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_ws_upgrade_nonces_channel
      ON ws_upgrade_nonces (channel_id, consumed_at_ms);
  `);
}
