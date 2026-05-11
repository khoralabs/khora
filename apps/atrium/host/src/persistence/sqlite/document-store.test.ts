import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { SourceMap } from "@cfd/memories-core";
import { createSwarmHostDocumentStore } from "./document-store.ts";
import { createSwarmHostEntitySqlitePersistence } from "./entity-sqlite.ts";

function upsertProfile(
  db: Database,
  row: { id: string; memoryId: string | null; bodyJson: string },
): void {
  createSwarmHostEntitySqlitePersistence(db, "profile").upsert(row);
}

function sm(memory_id: string, source_key: string): SourceMap {
  return {
    memory_id,
    source_key,
    _id: "sm1",
    _ts_created: 1,
  } as SourceMap;
}

type ProfileBody = { name: string; bio: string };

describe("createSwarmHostDocumentStore", () => {
  test("profile:id resolves whole document as record", async () => {
    type EM = { profile: ProfileBody };
    const db = new Database(":memory:");
    upsertProfile(db, {
      id: "p1",
      memoryId: "m1",
      bodyJson: JSON.stringify({ name: "Ada", bio: "Builder" }),
    });
    const store = createSwarmHostDocumentStore<EM>(db, {
      parsers: {
        profile: (raw) => raw as EM["profile"],
      },
    });
    const r = await store.resolve(sm("m1", "profile:p1"));
    expect(r.kind).toBe("record");
    if (r.kind === "record" && r.domain === "profile") {
      expect(r.entityId).toBe("p1");
      expect(r.value).toEqual({ name: "Ada", bio: "Builder" });
    }
  });

  test("profile:id:field resolves string slice from body_json", async () => {
    type EM = { profile: ProfileBody };
    const db = new Database(":memory:");
    upsertProfile(db, {
      id: "p1",
      memoryId: "m1",
      bodyJson: JSON.stringify({ name: "Ada", bio: "Builder" }),
    });
    const store = createSwarmHostDocumentStore<EM>(db, {
      parsers: {
        profile: (raw) => raw as EM["profile"],
      },
    });
    const nameR = await store.resolve(sm("m1", "profile:p1:name"));
    expect(nameR.kind).toBe("string");
    if (nameR.kind === "string") {
      expect(nameR.string).toBe("Ada");
    }
    const bioR = await store.resolve(sm("m1", "profile:p1:bio"));
    expect(bioR.kind).toBe("string");
    if (bioR.kind === "string") {
      expect(bioR.string).toBe("Builder");
    }
  });

  test("syncFromTextExportRows merges field paths into profile body_json", async () => {
    type EM = { profile: ProfileBody };
    const db = new Database(":memory:");
    const store = createSwarmHostDocumentStore<EM>(db, {
      parsers: {
        profile: (raw) => raw as EM["profile"],
      },
    });
    store.syncFromTextExportRows?.([
      { memory_id: "m1", source_key: "profile:p1:name", text: "Bob" },
      { memory_id: "m1", source_key: "profile:p1:bio", text: "Coder" },
    ]);
    const whole = await store.resolve(sm("m1", "profile:p1"));
    expect(whole.kind).toBe("record");
    if (whole.kind === "record" && whole.domain === "profile") {
      expect(whole.value).toEqual({ name: "Bob", bio: "Coder" });
    }
  });

  test("rejects unknown source_key shape", async () => {
    const db = new Database(":memory:");
    const store = createSwarmHostDocumentStore(db);
    await expect(store.resolve(sm("m1", "chunk:a"))).rejects.toThrow(/unrecognized/);
  });

  test("rejects when entity row missing for memory", async () => {
    type EM = { profile: ProfileBody };
    const db = new Database(":memory:");
    upsertProfile(db, {
      id: "p1",
      memoryId: "m1",
      bodyJson: JSON.stringify({ name: "Ada", bio: "x" }),
    });
    const store = createSwarmHostDocumentStore<EM>(db, {
      parsers: { profile: (raw) => raw as EM["profile"] },
    });
    await expect(store.resolve(sm("other-memory", "profile:p1"))).rejects.toThrow(/no profile/);
  });
});
