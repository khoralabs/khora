import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { migrateMatchmakingDomainDb } from "./migrate-domain-db.ts";
import { DOMAIN_SCHEMA_V1 } from "./schema.ts";

function listTables(db: Database): Set<string> {
  return new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name),
  );
}

describe("migrateMatchmakingDomainDb", () => {
  test("legacy V1-shaped DB is upgraded in place and tracking rows recorded", () => {
    const db = new Database(":memory:");
    db.run(DOMAIN_SCHEMA_V1);

    migrateMatchmakingDomainDb(db);

    const tables = listTables(db);
    expect(tables.has("profiles")).toBe(true);
    expect(tables.has("invites")).toBe(true);
    expect(tables.has("goals")).toBe(true);
    expect(tables.has("run_summaries")).toBe(true);
    expect(tables.has("_schema_migrations")).toBe(true);

    const rows = db
      .query<{ from_version: string; to_version: string; name: string }, []>(
        "SELECT from_version, to_version, name FROM _schema_migrations ORDER BY from_version, to_version, name",
      )
      .all();
    expect(rows).toEqual([
      { from_version: "0.0.0", to_version: "0.1.0", name: "001-initial" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-add-goals" },
      { from_version: "0.2.0", to_version: "0.3.0", name: "001-add-run-summaries" },
    ]);
  });

  test("running again is a no-op", () => {
    const db = new Database(":memory:");
    migrateMatchmakingDomainDb(db);
    const firstRows = db.query("SELECT * FROM _schema_migrations").all();
    migrateMatchmakingDomainDb(db);
    const secondRows = db.query("SELECT * FROM _schema_migrations").all();
    expect(secondRows).toEqual(firstRows);
  });
});
