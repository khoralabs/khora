import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlStore } from "@cfd/memories-stores";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, initObpSchema } from "@cfd/obp-sqlite";
import { createLoggingObpPersistence } from "./obp-persistence-jsonl-log.ts";

test("LoggingObpPersistence appends one JSONL row per mutation", () => {
  const dir = mkdtempSync(join(tmpdir(), "obp-log-test-"));
  const stepsPath = join(dir, "obp-steps.jsonl");
  try {
    const db = new Database(":memory:");
    initObpSchema(db);
    const now = () => 99;
    const inner = createObpSqlitePersistence(db, { now });
    const store = new JsonlStore(stepsPath);
    const persistence = createLoggingObpPersistence(inner, {
      store,
      memoryId: "test/obp",
      nowMs: now,
    });
    const client = new ObpClient(persistence, { now });

    client.registerParty({ name: "Alice", sourcemaps: [] });

    const raw = readFileSync(stepsPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    const stored = JSON.parse(lines[0]!);
    expect(stored.kind).toBe("string");
    const row = JSON.parse(stored.string) as {
      kind: string;
      op: string;
      ts: number;
      output: { partyId: string };
    };
    expect(row.kind).toBe("obp");
    expect(row.op).toBe("registerParty");
    expect(row.ts).toBe(99);
    expect(row.output.partyId).toBeDefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
