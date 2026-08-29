/** Shared DDL for host projection store, social channel index, and agent account status. */
export const KHORA_HOST_PROJECTIONS_DDL = `
CREATE TABLE IF NOT EXISTS khora_host_projections (
  tenant_key TEXT NOT NULL,
  namespace TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  projection JSON NOT NULL CHECK (json_valid(projection)),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (tenant_key, namespace, entry_key)
);
CREATE INDEX IF NOT EXISTS idx_khora_username_to_principal
  ON khora_host_projections (
    tenant_key,
    json_extract(projection, '$.principalId')
  )
  WHERE namespace = 'khora:social:username-to-principal';
CREATE TABLE IF NOT EXISTS khora_social_principal_channels (
  tenant_key TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  PRIMARY KEY (tenant_key, principal_id, channel_id)
);
CREATE TABLE IF NOT EXISTS agent_account_status (
  did TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('suspended', 'deleted')),
  created_at_ms INTEGER NOT NULL
);
`.trim();
