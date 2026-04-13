import { describe, expect, test } from "bun:test";
import {
  createMemoriesPersistence,
  openMemoriesDatabase,
} from "@cfd/memories-core-persistence/sqlite";
import { mergeMemory } from "./api/merge-memory";
import { search } from "./api/search";
import { ids } from "./models/ids";
import { MEMORY_NODE_LABEL_PROPS_KEY_PREFIX } from "./search-meta-constants";

function openTestDb() {
  return openMemoriesDatabase(":memory:");
}

describe("label props search features", () => {
  test("lexical search finds text only indexed on label props chunk", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const unique = "lexpropunique767";
    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "c", text: "boring generic content alpha" }],
        labels: [
          {
            kind: "person",
            props: {
              name: "Pat",
              role: unique,
            },
          },
        ],
        edges: [],
      },
    );

    const hits = search(
      { persistence },
      { namespace: "ns", content: { text: unique }, options: { topK: 10 } },
    );
    expect(
      hits.some(
        (h) => h.memory.key === "m1" && h.source_key.startsWith(MEMORY_NODE_LABEL_PROPS_KEY_PREFIX),
      ),
    ).toBe(true);
  });

  test("supersession removes prior label props source map when label value changes", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const v1 = "supersedeone999";
    const v2 = "supersedetwo999";

    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "c", text: "body" }],
        labels: [{ kind: "person", props: { name: "A", role: v1 } }],
        edges: [],
      },
    );

    const memId = ids.memory("ns", "m1");
    const countMaps = () =>
      db
        .query<{ n: number }, [string]>(
          `SELECT COUNT(*) AS n FROM source_maps WHERE memory_id = ? AND source_key LIKE '__mem_nl_props__%'`,
        )
        .get(memId)?.n;

    expect(countMaps()).toBe(1);
    expect(
      search({ persistence }, { namespace: "ns", content: { text: v1 }, options: { topK: 3 } })
        .length,
    ).toBeGreaterThanOrEqual(1);

    mergeMemory(
      { persistence },
      {
        key: "m1",
        namespace: "ns",
        content: [{ key: "c", text: "body" }],
        labels: [{ kind: "person", props: { name: "A", role: v2 } }],
        edges: [],
      },
    );

    expect(countMaps()).toBe(1);
    expect(
      search({ persistence }, { namespace: "ns", content: { text: v1 }, options: { topK: 3 } }),
    ).toEqual([]);
    expect(
      search({ persistence }, { namespace: "ns", content: { text: v2 }, options: { topK: 3 } })
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("edge label props chunk is searchable from focal memory", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const edgeToken = "edgeproptok888";

    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "c", text: "neighbor blob" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "c", text: "focal blob" }],
        labels: [],
        edges: [
          {
            memory_key: "nb",
            direction: "out",
            label: { kind: "causes", props: { mechanism: edgeToken } },
          },
        ],
      },
    );

    const hits = search(
      { persistence },
      { namespace: "ns", content: { text: edgeToken }, options: { topK: 10 } },
    );
    expect(
      hits.some((h) => h.memory.key === "focal" && h.source_key.startsWith("__mem_edge_props__/")),
    ).toBe(true);
  });

  test("edge label props sync on neighbor memory after focal merge", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    const edgeToken = "neighborfind999";

    mergeMemory(
      { persistence },
      {
        key: "nb",
        namespace: "ns",
        content: [{ key: "c", text: "nb only" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "focal",
        namespace: "ns",
        content: [{ key: "c", text: "focal only" }],
        labels: [],
        edges: [
          {
            memory_key: "nb",
            direction: "out",
            label: { kind: "describes", props: { facet: edgeToken } },
          },
        ],
      },
    );

    const nbHits = search(
      { persistence },
      { namespace: "ns", content: { text: edgeToken }, options: { topK: 10 } },
    );
    expect(
      nbHits.some((h) => h.memory.key === "nb" && h.source_key.startsWith("__mem_edge_props__/")),
    ).toBe(true);
  });
});
