import { describe, expect, test } from "bun:test";
import { mergeMemory, namespacePath } from "@cfd/memories-core";
import { openMemoriesDatabase } from "../connection";
import { createMemoriesPersistence } from "../persistence";
import { searchLexicalSourceMapIds } from "./search";

describe("searchLexicalSourceMapIds namespace index", () => {
  test("EXPLAIN QUERY PLAN uses idx_memories_ns_levels for subtree filter", () => {
    const db = openMemoriesDatabase(":memory:");
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "k",
        namespace: "a/b/c",
        content: [{ key: "body", text: "plan test token" }],
        labels: [],
        edges: [],
      },
    );

    const matchExpr = "plan";
    const rows = db
      .query<{ detail: string }, string[]>(
        `EXPLAIN QUERY PLAN
         SELECT source_map_id AS sourceMapId
         FROM text_features_fts
         WHERE text_features_fts MATCH ?
           AND memory_id IN (SELECT _id FROM memories WHERE (ns_l0 = ? AND ns_l1 = ?))
         ORDER BY bm25(text_features_fts)
         LIMIT ?`,
      )
      .all(matchExpr, "a", "b", "1");

    const detail = rows.map((r) => r.detail).join(" ");
    expect(detail.includes("idx_memories_ns_levels")).toBe(true);
  });

  test("subtree scope returns hits under prefix path", () => {
    const db = openMemoriesDatabase(":memory:");
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "leaf",
        namespace: "org/team/ns",
        content: [{ key: "x", text: "sqlite subtree xyzzy123" }],
        labels: [],
        edges: [],
      },
    );
    const ids = searchLexicalSourceMapIds(
      { db, now: Date.now() },
      {
        scope: { kind: "union", namespaces: [namespacePath("org/team")] },
        text: "xyzzy123",
        limit: 10,
      },
    );
    expect(ids.length).toBeGreaterThan(0);
  });
});
