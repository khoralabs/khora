/** Frozen DDL for OBP v2 relational store — collapsed from legacy migrations (`bun:sqlite`). */
export const OBP_V2_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS obp_parties (
  id TEXT PRIMARY KEY NOT NULL,
  created_seq INTEGER NOT NULL,
  name TEXT NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_offers (
  id TEXT PRIMARY KEY NOT NULL,
  created_seq INTEGER NOT NULL,
  expires_seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_ports (
  id TEXT PRIMARY KEY NOT NULL,
  created_seq INTEGER NOT NULL,
  expires_seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  promise TEXT NOT NULL DEFAULT '',
  max_bindings INTEGER NOT NULL,
  terminal INTEGER NOT NULL CHECK (terminal IN (0, 1)),
  ref TEXT NOT NULL DEFAULT '',
  sourcemaps_json TEXT NOT NULL DEFAULT '[]',
  ttl_basis TEXT,
  ttl_measure INTEGER,
  expose_seq INTEGER,
  bind_policy_json TEXT
);

CREATE TABLE IF NOT EXISTS obp_extends (
  edge_id TEXT PRIMARY KEY NOT NULL,
  party_id TEXT NOT NULL REFERENCES obp_parties(id),
  offer_id TEXT NOT NULL UNIQUE REFERENCES obp_offers(id),
  created_seq INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_exposes (
  edge_id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES obp_offers(id),
  port_id TEXT NOT NULL REFERENCES obp_ports(id),
  created_seq INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_obp_exposes_port ON obp_exposes(port_id);

CREATE TABLE IF NOT EXISTS obp_binds (
  edge_id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES obp_offers(id),
  port_id TEXT NOT NULL REFERENCES obp_ports(id),
  created_seq INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]',
  counterparty_bind_json TEXT,
  bind_policy_json TEXT,
  content_receipts_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(offer_id, port_id)
);

CREATE INDEX IF NOT EXISTS idx_obp_binds_port ON obp_binds(port_id);
CREATE INDEX IF NOT EXISTS idx_obp_binds_offer ON obp_binds(offer_id);
`;
