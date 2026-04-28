import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { migrateMatchmakingDomainDb } from "../persistence/migrate-domain-db.ts";
import { SqliteLexicalStore } from "./sqlite-lexical-store.ts";

const ns = "obp_demo/matchmaking/subjects/t/sub/personas/mira-patel";

let db: Database;

beforeAll(() => {
  db = new Database(":memory:", { create: true });
  migrateMatchmakingDomainDb(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* best effort */
  }
});

test("SqliteLexicalStore resolve after syncFromTextExportRows (last write wins)", async () => {
  const store = new SqliteLexicalStore(db, ns);
  store.syncFromTextExportRows([{ memory_id: "m1", source_key: "k0", text: "first" }]);
  const a = await store.resolve({ memory_id: "m1", source_key: "k0" } as {
    memory_id: string;
    source_key: string;
  });
  expect(a.kind).toBe("string");
  if (a.kind === "string") {
    expect(a.string).toBe("first");
  }
  store.syncFromTextExportRows([{ memory_id: "m1", source_key: "k0", text: "second" }]);
  const b = await store.resolve({ memory_id: "m1", source_key: "k0" } as {
    memory_id: string;
    source_key: string;
  });
  expect(b.kind).toBe("string");
  if (b.kind === "string") {
    expect(b.string).toBe("second");
  }
});

test("SqliteLexicalStore two namespaces do not cross-pollute", async () => {
  const s1 = new SqliteLexicalStore(db, "ns/a");
  const s2 = new SqliteLexicalStore(db, "ns/b");
  s1.syncFromTextExportRows([{ memory_id: "m", source_key: "k", text: "a" }]);
  s2.syncFromTextExportRows([{ memory_id: "m", source_key: "k", text: "b" }]);
  const a = await s1.resolve({ memory_id: "m", source_key: "k" } as {
    memory_id: string;
    source_key: string;
  });
  expect((a as { kind: "string" }).string).toBe("a");
});
