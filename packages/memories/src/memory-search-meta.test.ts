import { describe, expect, test } from "bun:test";
import {
  createSqliteMemoriesPersistence,
  createSqliteMemoriesVisualizationPersistence,
  openMemoriesDatabase,
} from "@cfd/memories-persistence/sqlite";
import {
  buildCanonicalMemorySearchMetaText,
  mergeMemory,
  zMergeMemoryContentItem,
  zUserSourceKey,
} from "./api/merge-memory";
import { search } from "./api/search";
import { loadMeanEmbeddingsForNamespace } from "./graph/graph-projection";
import {
  buildCanonicalMemorySearchMetaTextForMerge,
  MEMORY_SEARCH_META_SOURCE_KEY,
} from "./models/memory-search-meta";

function openTestDb() {
  return openMemoriesDatabase(":memory:");
}

const vec512 = (): number[] => Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));

describe("memory search meta", () => {
  test("zUserSourceKey rejects reserved prefix and meta key", () => {
    expect(zUserSourceKey.safeParse("__mem_search_meta__").success).toBe(false);
    expect(zUserSourceKey.safeParse("__x").success).toBe(false);
    expect(zUserSourceKey.safeParse("chunk-1").success).toBe(true);
  });

  test("zMergeMemoryContentItem rejects reserved content key", () => {
    const r = zMergeMemoryContentItem.safeParse({
      key: "__bad",
      text: "hi",
    });
    expect(r.success).toBe(false);
  });

  test("buildCanonicalMemorySearchMetaTextForMerge matches DB after merge", () => {
    const db = openTestDb();
    const persistence = createSqliteMemoriesPersistence(db);
    const now = Date.now();
    const op = { now };
    mergeMemory(
      { persistence },
      {
        key: "a",
        namespace: "ns",
        content: [{ key: "c1", text: "hello world" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "b",
        namespace: "ns",
        content: [{ key: "c1", text: "other" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "a",
        namespace: "ns",
        content: [{ key: "c1", text: "hello world" }],
        labels: ["topic"],
        edges: [{ memory_key: "b", direction: "out", label: "references" }],
        searchMetaVector: vec512(),
      },
    );

    const fromDb = buildCanonicalMemorySearchMetaText(persistence, op, "ns", "a");
    const fromMerge = buildCanonicalMemorySearchMetaTextForMerge({
      labels: ["topic"],
      edges: [{ memory_key: "b", direction: "out", label: "references" }],
    });
    expect(fromDb).toBe(fromMerge);
  });

  test("lexical search hits meta source_map for node label", () => {
    const db = openTestDb();
    const persistence = createSqliteMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "body", text: "zzz unrelated body text" }],
        labels: ["fact"],
        edges: [],
      },
    );

    const hits = search(
      { persistence },
      {
        namespace: "ns",
        content: { text: "fact" },
        options: { topK: 5 },
      },
    );
    expect(hits.some((h) => h.source_key === MEMORY_SEARCH_META_SOURCE_KEY)).toBe(true);
  });

  test("neighbor meta updates when focal memory adds edge", () => {
    const db = openTestDb();
    const persistence = createSqliteMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "b", text: "neighbor" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "focal body" }],
        labels: [],
        edges: [{ memory_key: "nb", direction: "out", label: "references" }],
      },
    );

    const nbMeta = buildCanonicalMemorySearchMetaText(persistence, { now: Date.now() }, "ns", "nb");
    expect(nbMeta).toContain("edge in:focal:");
    expect(nbMeta).toContain("references");
  });

  test("neighbor meta clears when focal removes edge", () => {
    const db = openTestDb();
    const persistence = createSqliteMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "b", text: "neighbor" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "focal" }],
        labels: [],
        edges: [{ memory_key: "nb", direction: "out", label: "references" }],
      },
    );
    expect(
      buildCanonicalMemorySearchMetaText(persistence, { now: Date.now() }, "ns", "nb").length,
    ).toBeGreaterThan(0);

    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "b", text: "focal" }],
        labels: [],
        edges: [],
      },
    );
    expect(buildCanonicalMemorySearchMetaText(persistence, { now: Date.now() }, "ns", "nb")).toBe(
      "",
    );
  });

  test("loadMeanEmbeddingsForNamespace excludes system __ source_maps", () => {
    const db = openTestDb();
    const persistence = createSqliteMemoriesPersistence(db);
    const visualization = createSqliteMemoriesVisualizationPersistence(db);
    const v = vec512();
    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "body", text: "x", vector: v }],
        labels: ["t"],
        edges: [],
        searchMetaVector: v.map((x, i) => (i === 1 ? 99 : x)),
      },
    );

    const means = loadMeanEmbeddingsForNamespace({ persistence: visualization }, "ns");
    expect(means).toHaveLength(1);
    expect(means[0]?.embedding[0]).toBe(1);
    expect(means[0]?.embedding[1]).toBe(0);
  });
});
