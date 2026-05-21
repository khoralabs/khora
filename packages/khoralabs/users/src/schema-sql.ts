export const USERS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_emails (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  verified_at_ms INTEGER,
  PRIMARY KEY (account_id, email)
);

CREATE TABLE IF NOT EXISTS auth_links (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (account_id, provider)
);

CREATE TABLE IF NOT EXISTS atrium_hosts (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  opted_in_at_ms INTEGER,
  capabilities TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES atrium_hosts(id) ON DELETE CASCADE,
  invite_token_hash TEXT,
  agent_did TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(account_id, host_id)
);

CREATE TABLE IF NOT EXISTS access_token_requests (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES atrium_hosts(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  membership_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_token_hash TEXT,
  requested_at_ms INTEGER NOT NULL,
  minted_at_ms INTEGER,
  sent_at_ms INTEGER,
  redeemed_at_ms INTEGER,
  source_app TEXT,
  UNIQUE(email, host_id)
);

CREATE TABLE IF NOT EXISTS marketing_consents (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  list_slug TEXT NOT NULL,
  opted_in_at_ms INTEGER NOT NULL,
  opted_out_at_ms INTEGER,
  source_app TEXT,
  UNIQUE(email, list_slug)
);

CREATE INDEX IF NOT EXISTS idx_access_token_requests_account_id
  ON access_token_requests (account_id);
CREATE INDEX IF NOT EXISTS idx_marketing_consents_account_id
  ON marketing_consents (account_id);
CREATE INDEX IF NOT EXISTS idx_memberships_account_id
  ON memberships (account_id);
`;
