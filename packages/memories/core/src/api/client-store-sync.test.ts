import { describe, expect, test } from "bun:test";
import { createMemoriesPersistence, openMemoriesDatabase } from "@khoralabs/memories-sqlite";
import { canonicalOntology } from "../ontologies/cannonical";
import type { TextFeatureExportRow } from "../persistence/row-schemas";
import { MemoriesClient } from "./client";
import type { Store } from "./resolve-sourcemap";

function openTestPersistence() {
  const db = openMemoriesDatabase(":memory:");
  return createMemoriesPersistence(db);
}

describe("MemoriesClient store sync", () => {
  test("mergeMemory forwards listTextFeatureExportRowsForMemory to store.syncFromTextExportRows", () => {
    const persistence = openTestPersistence();
    const syncCalls: TextFeatureExportRow[][] = [];
    const store: Store = {
      async resolve() {
        return { kind: "string", string: "" };
      },
      syncFromTextExportRows(rows) {
        syncCalls.push([...rows]);
      },
    };
    const client = new MemoriesClient(persistence, canonicalOntology, { store });
    client.mergeMemory({
      key: "m1",
      namespace: "ns",
      content: [{ key: "chunk", text: "hello sync" }],
      labels: [{ kind: "fact", props: { subject: "s", predicate: "p", object: "o" } }],
      edges: [],
    });
    const memoryId = persistence.findMemoryIdByKey("ns", "m1");
    expect(memoryId).toBeDefined();
    const expected = persistence.listTextFeatureExportRowsForMemory(memoryId!);
    expect(syncCalls.length).toBe(1);
    expect([...syncCalls[0]!]).toEqual(expected);
  });

  test("resolveSourcesForMemory uses store.resolve per source map", async () => {
    const persistence = openTestPersistence();
    const store: Store = {
      async resolve(sm) {
        return { kind: "string", string: `ok:${sm.source_key}` };
      },
    };
    const client = new MemoriesClient(persistence, canonicalOntology, { store });
    client.mergeMemory({
      key: "m1",
      namespace: "ns",
      content: [{ key: "chunk", text: "body text here" }],
      labels: [{ kind: "fact", props: { subject: "x", predicate: "y", object: "z" } }],
      edges: [],
    });
    const memoryId = persistence.findMemoryIdByKey("ns", "m1");
    expect(memoryId).toBeDefined();
    const rows = await client.resolveSourcesForMemory("ns", memoryId!, 10);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.content?.kind).toBe("string");
      if (r.content?.kind === "string") {
        expect(r.content.string).toBe(`ok:${r.sourceKey}`);
      }
    }
  });

  test("resolveSourcesForMemory throws when no store configured", async () => {
    const persistence = openTestPersistence();
    const client = new MemoriesClient(persistence, canonicalOntology);
    await expect(client.resolveSourcesForMemory("ns", "any-id", 5)).rejects.toThrow(/store/);
  });
});
