import { describe, expect, test } from "bun:test";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite/sqlite";
import { mergeMemory } from "./api/merge-memory";
import { MAX_ADDITIONAL_NAMESPACES, search } from "./api/search";
import type { HydratedSourceMapHit } from "./models/neighbor-search-types";
import type { MemoriesPersistence } from "./persistence/types";

function openTestDb() {
  return openMemoriesDatabase(":memory:");
}

describe("cross-namespace search", () => {
  test("union scope returns hits from each namespace", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "a",
        namespace: "ns1",
        content: [{ key: "x", text: "unique alpha snickerdoodle" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "b",
        namespace: "ns2",
        content: [{ key: "y", text: "unique beta snickerdoodle" }],
        labels: [],
        edges: [],
      },
    );

    const hits = search(
      { persistence },
      {
        namespace: "ns1",
        additionalNamespaces: ["ns2"],
        content: { text: "snickerdoodle" },
        options: { topK: 10 },
      },
    );
    const keys = new Set(hits.map((h) => `${h.memory.namespace}:${h.memory.key}`));
    expect(keys.has("ns1:a")).toBe(true);
    expect(keys.has("ns2:b")).toBe(true);
  });

  test("searchEntireDatabase finds memories across namespaces", () => {
    const db = openTestDb();
    const persistence = createMemoriesPersistence(db);
    mergeMemory(
      { persistence },
      {
        key: "p",
        namespace: "z1",
        content: [{ key: "c", text: "whole db marker xyzzy" }],
        labels: [],
        edges: [],
      },
    );
    mergeMemory(
      { persistence },
      {
        key: "q",
        namespace: "z2",
        content: [{ key: "c", text: "whole db marker plugh" }],
        labels: [],
        edges: [],
      },
    );

    const hits = search(
      { persistence },
      {
        namespace: "z1",
        searchEntireDatabase: true,
        content: { text: "whole db marker" },
        options: { topK: 10 },
      },
    );
    const keys = new Set(hits.map((h) => `${h.memory.namespace}:${h.memory.key}`));
    expect(keys.has("z1:p")).toBe(true);
    expect(keys.has("z2:q")).toBe(true);
  });
});

describe("cross-namespace search (validation + fallback)", () => {
  test("searchEntireDatabase throws when unscopedSearch is false", () => {
    const persistence = {
      capabilities: {
        lexicalSearch: true,
        vectorSearch: false,
        neighborIndex: false,
        multiNamespaceSearch: true,
        unscopedSearch: false,
      },
      searchLexicalSourceMapIds() {
        return [];
      },
      searchVectorSourceMapIds() {
        return [];
      },
      hydrateSourceMapHits() {
        return [];
      },
    } as unknown as MemoriesPersistence;
    expect(() =>
      search(
        { persistence },
        {
          namespace: "ns",
          searchEntireDatabase: true,
          content: { text: "x" },
        },
      ),
    ).toThrow(/unscoped search not supported/);
  });

  test("empty namespace string throws", () => {
    const persistence = {
      capabilities: {
        lexicalSearch: true,
        vectorSearch: false,
        neighborIndex: false,
      },
      searchLexicalSourceMapIds() {
        return [];
      },
      searchVectorSourceMapIds() {
        return [];
      },
      hydrateSourceMapHits() {
        return [];
      },
    } as unknown as MemoriesPersistence;
    expect(() => search({ persistence }, { namespace: "", content: { text: "x" } })).toThrow(
      /non-empty/,
    );
  });

  test("too many additional namespaces throws", () => {
    const persistence = {
      capabilities: {
        lexicalSearch: true,
        vectorSearch: false,
        neighborIndex: false,
      },
      searchLexicalSourceMapIds() {
        return [];
      },
      searchVectorSourceMapIds() {
        return [];
      },
      hydrateSourceMapHits() {
        return [];
      },
    } as unknown as MemoriesPersistence;
    const extra = Array.from({ length: MAX_ADDITIONAL_NAMESPACES + 1 }, (_, i) => `n${i}`);
    expect(() =>
      search(
        { persistence },
        {
          namespace: "root",
          additionalNamespaces: extra,
          content: { text: "x" },
        },
      ),
    ).toThrow(/exceeds max/);
  });

  test("multiNamespaceSearch false runs per-namespace retrieval and merges", () => {
    const lexicalCalls: { scope: unknown }[] = [];
    const persistence = {
      capabilities: {
        lexicalSearch: true,
        vectorSearch: false,
        neighborIndex: false,
        multiNamespaceSearch: false,
        unscopedSearch: false,
      },
      searchLexicalSourceMapIds(input: {
        scope: { kind: string; namespaces?: string[] };
        text: string;
        limit: number;
      }) {
        lexicalCalls.push({ scope: input.scope });
        if (input.scope.kind === "union" && input.scope.namespaces?.[0] === "a") {
          return ["sm-a"];
        }
        if (input.scope.kind === "union" && input.scope.namespaces?.[0] === "b") {
          return ["sm-b"];
        }
        return [];
      },
      searchVectorSourceMapIds() {
        return [];
      },
      hydrateSourceMapHits(ids: string[]): HydratedSourceMapHit[] {
        return ids.map((id) => {
          const isA = id === "sm-a";
          const memoryId = isA ? "m-a" : "m-b";
          return {
            _id: id,
            _ts_created: 0,
            memory_id: memoryId,
            source_key: "k",
            memory: {
              _id: memoryId,
              _ts_created: 0,
              namespace: isA ? "a" : "b",
              key: isA ? "ka" : "kb",
            },
            labels: [],
          };
        });
      },
    } as unknown as MemoriesPersistence;

    const hits = search(
      { persistence },
      {
        namespace: "a",
        additionalNamespaces: ["b"],
        content: { text: "q" },
        options: { topK: 10 },
      },
    );
    expect(lexicalCalls).toHaveLength(2);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const ids = hits.map((h) => h._id).sort();
    expect(ids).toContain("sm-a");
    expect(ids).toContain("sm-b");
  });
});
