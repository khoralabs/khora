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

CREATE TABLE IF NOT EXISTS khora_hosts (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  opted_in_at_ms INTEGER,
  capabilities TEXT,
  health_ready_path TEXT NOT NULL DEFAULT '/ready',
  health_path TEXT NOT NULL DEFAULT '/health',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  health_checked_at_ms INTEGER,
  health_latency_ms INTEGER,
  health_probed_endpoint TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES khora_hosts(id) ON DELETE CASCADE,
  invite_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(account_id, host_id)
);

CREATE TABLE IF NOT EXISTS access_token_requests (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES khora_hosts(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS device_authorizations (
  id TEXT PRIMARY KEY NOT NULL,
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  session_token TEXT,
  expires_at_ms INTEGER NOT NULL,
  approved_at_ms INTEGER,
  consumed_at_ms INTEGER,
  source_app TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_authorizations_user_code
  ON device_authorizations (user_code);

CREATE TABLE IF NOT EXISTS cli_link_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  agent_did TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cli_link_challenges_agent_did
  ON cli_link_challenges (agent_did);

CREATE TABLE IF NOT EXISTS account_agent_links (
  id TEXT PRIMARY KEY NOT NULL,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL REFERENCES khora_hosts(id) ON DELETE CASCADE,
  agent_did TEXT NOT NULL,
  linked_at_ms INTEGER NOT NULL,
  UNIQUE(membership_id, agent_did),
  UNIQUE(host_id, agent_did)
);

CREATE INDEX IF NOT EXISTS idx_account_agent_links_account_id
  ON account_agent_links (account_id);
CREATE INDEX IF NOT EXISTS idx_account_agent_links_membership_id
  ON account_agent_links (membership_id);

CREATE TABLE IF NOT EXISTS agent_account_bindings (
  agent_did TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bound_at_ms INTEGER NOT NULL,
  bound_via_host_id TEXT REFERENCES khora_hosts(id)
);
`;
