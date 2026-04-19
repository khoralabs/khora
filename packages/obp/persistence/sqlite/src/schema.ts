/** Idempotent DDL for OBP relational store (`bun:sqlite`). */
export const OBP_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS obp_parties (
  id TEXT PRIMARY KEY NOT NULL,
  ts_created INTEGER NOT NULL,
  name TEXT NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_offers (
  id TEXT PRIMARY KEY NOT NULL,
  ts_created INTEGER NOT NULL,
  ts_expired INTEGER NOT NULL,
  type TEXT NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_ports (
  id TEXT PRIMARY KEY NOT NULL,
  ts_created INTEGER NOT NULL,
  ts_expired INTEGER NOT NULL,
  type TEXT NOT NULL,
  max_bindings INTEGER NOT NULL,
  terminal INTEGER NOT NULL CHECK (terminal IN (0, 1)),
  ref TEXT NOT NULL DEFAULT '',
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_extends (
  edge_id TEXT PRIMARY KEY NOT NULL,
  party_id TEXT NOT NULL REFERENCES obp_parties(id),
  offer_id TEXT NOT NULL UNIQUE REFERENCES obp_offers(id),
  ts_created INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS obp_exposes (
  edge_id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES obp_offers(id),
  port_id TEXT NOT NULL REFERENCES obp_ports(id),
  ts_created INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_obp_exposes_port ON obp_exposes(port_id);

CREATE TABLE IF NOT EXISTS obp_binds (
  edge_id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL REFERENCES obp_offers(id),
  port_id TEXT NOT NULL REFERENCES obp_ports(id),
  ts_created INTEGER NOT NULL,
  sourcemaps_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE(offer_id, port_id)
);

CREATE INDEX IF NOT EXISTS idx_obp_binds_port ON obp_binds(port_id);
CREATE INDEX IF NOT EXISTS idx_obp_binds_offer ON obp_binds(offer_id);
`;
