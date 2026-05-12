import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { initObpSchema } from "./connection";

function tableColumns(db: Database, table: string): Set<string> {
  return new Set(
    db
      .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name),
  );
}

describe("obp sqlite migrations", () => {
  test("legacy obp_ports without ttl/expose/bind_policy columns gets columns added", () => {
    const db = new Database(":memory:");
    db.run(`
      CREATE TABLE obp_ports (
        id TEXT PRIMARY KEY NOT NULL,
        created_seq INTEGER NOT NULL,
        expires_seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        promise TEXT NOT NULL DEFAULT '',
        max_bindings INTEGER NOT NULL,
        terminal INTEGER NOT NULL CHECK (terminal IN (0, 1)),
        ref TEXT NOT NULL DEFAULT '',
        sourcemaps_json TEXT NOT NULL DEFAULT '[]'
      );
    `);

    initObpSchema(db);

    const cols = tableColumns(db, "obp_ports");
    expect(cols.has("ttl_basis")).toBe(true);
    expect(cols.has("ttl_measure")).toBe(true);
    expect(cols.has("expose_seq")).toBe(true);
    expect(cols.has("bind_policy_json")).toBe(true);

    const tracked = db
      .query<{ from_version: string; to_version: string; name: string }, []>(
        "SELECT from_version, to_version, name FROM _schema_migrations ORDER BY from_version, to_version, name",
      )
      .all();
    expect(tracked).toEqual([
      { from_version: "0.0.0", to_version: "0.1.0", name: "001-initial" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-ports-ttl-columns" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "002-binds-counterparty-columns" },
    ]);
  });

  test("fresh DB ends up with the same final shape and tracking rows", () => {
    const db = new Database(":memory:");
    initObpSchema(db);
    const ports = tableColumns(db, "obp_ports");
    const binds = tableColumns(db, "obp_binds");
    expect(ports.has("ttl_basis")).toBe(true);
    expect(binds.has("counterparty_bind_json")).toBe(true);
    expect(binds.has("content_receipts_json")).toBe(true);
  });
});
