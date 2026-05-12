import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { startSqliteMaintenance } from "./maintenance.ts";

describe("startSqliteMaintenance", () => {
  test("runNow executes wal_checkpoint + ANALYZE without throwing", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA journal_mode = WAL;");
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);");
    db.run("INSERT INTO t (v) VALUES ('a'), ('b'), ('c');");

    const h = startSqliteMaintenance(db, {
      walCheckpointIntervalMs: 60_000,
      analyzeIntervalMs: 60_000,
    });
    try {
      expect(() => h.runNow()).not.toThrow();
      const row = db.query("SELECT count(*) AS n FROM sqlite_stat1").get() as { n: number };
      expect(row.n).toBeGreaterThan(0);
    } finally {
      h.stop();
    }
  });

  test("stop is idempotent and clears timers", () => {
    const db = new Database(":memory:");
    const h = startSqliteMaintenance(db, {
      walCheckpointIntervalMs: 1,
      analyzeIntervalMs: 1,
    });
    h.stop();
    expect(() => h.stop()).not.toThrow();
  });

  test("non-positive intervals disable that task", () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY);");
    const h = startSqliteMaintenance(db, {
      walCheckpointIntervalMs: 0,
      analyzeIntervalMs: 0,
    });
    try {
      expect(() => h.runNow()).not.toThrow();
      const row = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'")
        .get();
      expect(row).toBeNull();
    } finally {
      h.stop();
    }
  });

  test("checkpoint/analyze failures are swallowed and logged", () => {
    const db = new Database(":memory:");
    db.close();
    const warnings: string[] = [];
    const h = startSqliteMaintenance(db, {
      walCheckpointIntervalMs: 60_000,
      analyzeIntervalMs: 60_000,
      logger: { warn: (msg) => warnings.push(String(msg)), debug: () => {} },
    });
    try {
      expect(() => h.runNow()).not.toThrow();
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    } finally {
      h.stop();
    }
  });
});
