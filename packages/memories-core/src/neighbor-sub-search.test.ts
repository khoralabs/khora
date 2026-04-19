import { describe, expect, test } from "bun:test";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import { mergeMemory } from "./api/merge-memory";
import { search } from "./api/search";

function openTestDb() {
  return openMemoriesDatabase(":memory:");
}

const vec512 = (i: number, v = 1): number[] =>
  Array.from({ length: 512 }, (_, j) => (j === i ? v : 0));

describe("scoped search helpers", () => {
  test("searchLexicalSourceMapIds respects memoryIds allowlist", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "a", text: "hello unique alpha" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "m2",
        namespace: "ns",
        content: [{ key: "b", text: "hello unique beta" }],
        labels: [],
        edges: [],
      },
    );

    const mem1 = db
      .query<{ _id: string }, [string, string]>(
        `SELECT _id FROM memories WHERE namespace = ? AND key = ?`,
      )
      .get("ns", "m1");
    const mem2 = db
      .query<{ _id: string }, [string, string]>(
        `SELECT _id FROM memories WHERE namespace = ? AND key = ?`,
      )
      .get("ns", "m2");
    if (!mem1?._id || !mem2?._id) throw new Error("expected memories");

    const onlyM1 = persistence.searchLexicalSourceMapIds({
      scope: { kind: "union", namespaces: ["ns"] },
      text: "hello",
      limit: 25,
      memoryIds: [mem1._id],
    });
    const sm1 = db
      .query<{ id: string }, [string]>(`SELECT _id AS id FROM source_maps WHERE memory_id = ?`)
      .get(mem1._id);
    const sm2 = db
      .query<{ id: string }, [string]>(`SELECT _id AS id FROM source_maps WHERE memory_id = ?`)
      .get(mem2._id);
    if (!sm1?.id || !sm2?.id) throw new Error("expected source maps");

    expect(onlyM1).toContain(sm1.id);
    expect(onlyM1).not.toContain(sm2.id);
  });

  test("searchLexicalSourceMapIds with empty memoryIds returns []", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const r = persistence.searchLexicalSourceMapIds({
      scope: { kind: "union", namespaces: ["ns"] },
      text: "x",
      limit: 10,
      memoryIds: [],
    });
    expect(r).toEqual([]);
  });

  test("searchVectorSourceMapIds with empty memoryIds returns []", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const r = persistence.searchVectorSourceMapIds({
      scope: { kind: "union", namespaces: ["ns"] },
      vector: vec512(0),
      limit: 10,
      memoryIds: [],
    });
    expect(r).toEqual([]);
  });
});

describe("neighbor sub-search", () => {
  test("omits graph neighbor when sub-search does not match query (strict)", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "b", text: "only unrelated zzz content here" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "focal unique marker alpha root" }],
        labels: [],
        edges: [{ memory_key: "nb", direction: "out", label: { kind: "references", props: {} } }],
      },
    );

    const noMatch = search(
      { persistence },
      {
        namespace: "ns",
        content: { text: "marker alpha root" },
        options: {
          topK: 5,
          neighbors: true,
          maxNeighbors: 5,
        },
      },
    );
    const focalHit = noMatch.find((h) => h.memory.key === "focal");
    expect(focalHit).toBeDefined();
    expect(focalHit?.neighbors ?? []).toHaveLength(0);
  });

  test("includes graph neighbor when sub-search matches same query", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "b", text: "ripe bananas bunch detail" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "bananas bananas bananas hub focal" }],
        labels: [],
        edges: [{ memory_key: "nb", direction: "out", label: { kind: "references", props: {} } }],
      },
    );

    const withMatch = search(
      { persistence },
      {
        namespace: "ns",
        content: { text: "bananas" },
        options: {
          topK: 5,
          neighbors: true,
          maxNeighbors: 5,
        },
      },
    );
    const focal2 = withMatch.find((h) => h.memory.key === "focal");
    expect(focal2?.neighbors?.some((n) => n.key === "nb")).toBe(true);
  });

  test("maxNeighbors caps after ranking; neighborScore and matchedSourceMapId set", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "nb1",
        namespace: "ns",
        content: [{ key: "b", text: "first neighbor rocket ship alpha" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "nb2",
        namespace: "ns",
        content: [{ key: "b", text: "second neighbor rocket ship beta gamma" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "focal hub rocket ship" }],
        labels: [{ kind: "rootonly", props: {} }],
        edges: [
          { memory_key: "nb1", direction: "out", label: { kind: "r1", props: {} } },
          { memory_key: "nb2", direction: "out", label: { kind: "r2", props: {} } },
        ],
      },
    );

    const hits = search(
      { persistence },
      {
        namespace: "ns",
        content: { text: "rocket ship" },
        options: {
          topK: 10,
          neighbors: true,
          maxNeighbors: 1,
          labels: { some: ["rootonly"] },
        },
      },
    );
    const focal = hits.find((h) => h.memory.key === "focal");
    expect(focal?.neighbors).toHaveLength(1);
    const n0 = focal?.neighbors?.[0];
    expect(n0?.neighborScore).toBeDefined();
    expect(n0?.matchedSourceMapId).toBeDefined();
    expect(n0?.key === "nb1" || n0?.key === "nb2").toBe(true);
  });
});
