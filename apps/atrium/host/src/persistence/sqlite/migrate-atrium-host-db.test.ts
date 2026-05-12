import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { SWARM_HOST_SCHEMA_STATEMENTS } from "./schema.ts";

function listTables(db: Database): Set<string> {
  return new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name),
  );
}

describe("migrateAtriumHostDb", () => {
  test("legacy DB with topic_subscriptions is upgraded and tracking rows recorded", () => {
    const db = new Database(":memory:");
    for (const sql of SWARM_HOST_SCHEMA_STATEMENTS) {
      db.run(sql);
    }
    db.run(
      `INSERT INTO topic_subscriptions (did, topic_slug, created_at) VALUES ('did:key:sub', 'alpha', 1)`,
    );
    db.run(
      `INSERT INTO agent_notifications (did, created_at, kind, payload_json, read_at_ms)
       VALUES ('did:key:sub', 1, 'topic_post', '{}', NULL)`,
    );

    migrateAtriumHostDb(db);

    const tables = listTables(db);
    expect(tables.has("agent_subscriptions")).toBe(true);
    expect(tables.has("topic_subscriptions")).toBe(false);
    expect(tables.has("atrium_host_schema_migrations")).toBe(true);

    const sub = db
      .query<{ subject: string }, []>(
        `SELECT subject FROM agent_subscriptions WHERE did = 'did:key:sub'`,
      )
      .get();
    expect(sub?.subject).toBe("topic:alpha");

    const notifCount = db
      .query<{ c: number }, []>(
        `SELECT COUNT(1) AS c FROM agent_notifications WHERE kind IN ('topic_post','probe_hit')`,
      )
      .get()?.c;
    expect(notifCount).toBe(0);

    const rows = db
      .query<{ from_version: string; to_version: string; name: string }, []>(
        "SELECT from_version, to_version, name FROM atrium_host_schema_migrations ORDER BY from_version, to_version, name",
      )
      .all();
    expect(rows).toEqual([
      { from_version: "0.0.0", to_version: "0.1.0", name: "001-initial" },
      { from_version: "0.1.0", to_version: "0.2.0", name: "001-subjects" },
    ]);
  });

  test("running again is a no-op", () => {
    const db = new Database(":memory:");
    migrateAtriumHostDb(db);
    const firstRows = db.query("SELECT * FROM atrium_host_schema_migrations").all();
    migrateAtriumHostDb(db);
    const secondRows = db.query("SELECT * FROM atrium_host_schema_migrations").all();
    expect(secondRows).toEqual(firstRows);
  });
});
