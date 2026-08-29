import { describe, expect, test } from "bun:test";
import type { StandingQuery } from "../../core/types";
import type { PercolatorPersistence } from "./port";

export type PercolatorPersistenceContractFactory = () =>
  | PercolatorPersistence
  | Promise<PercolatorPersistence>;

function filterQuery(
  id: string,
  ownerId: string,
  now: number,
  overrides: Partial<StandingQuery> = {},
): StandingQuery {
  return {
    id,
    ownerId,
    search: { content: {}, options: { labels: { some: ["post"] } } },
    minScore: 0,
    active: true,
    createdAtMs: now,
    updatedAtMs: now,
    ...overrides,
  };
}

function semanticQuery(
  id: string,
  ownerId: string,
  now: number,
  text: string,
  overrides: Partial<StandingQuery> = {},
): StandingQuery {
  return {
    id,
    ownerId,
    search: { content: { text }, options: { minScore: 0.01 } },
    minScore: 0.01,
    active: true,
    createdAtMs: now,
    updatedAtMs: now,
    ...overrides,
  };
}

/**
 * Shared persistence-port contract suite. Call from each backend test file
 * (in-memory, sqlite, turso) so adapters stay aligned.
 */
export function runPercolatorPersistenceContractTests(
  name: string,
  create: PercolatorPersistenceContractFactory,
): void {
  describe(`percolator persistence contract: ${name}`, () => {
    test("upsert + get round-trips filter and semantic queries", async () => {
      const p = await create();
      const now = 1_000;
      const filter = filterQuery("f1", "owner-a", now);
      const semantic = semanticQuery("s1", "owner-b", now, "platform beta", {
        search: {
          content: { text: "platform beta", vector: [1, 0, -1] },
          options: { minScore: 0.01 },
        },
      });

      await p.upsertQuery(filter);
      await p.upsertQuery(semantic);

      expect(await p.getQuery("f1")).toEqual(filter);
      const loadedSemantic = await p.getQuery("s1");
      expect(loadedSemantic?.id).toBe("s1");
      expect(loadedSemantic?.search.content.text).toBe("platform beta");
      expect(loadedSemantic?.search.content.vector).toEqual([1, 0, -1]);
      expect(await p.getQuery("missing")).toBeUndefined();
    });

    test("listQueriesByOwner returns only that owner's queries", async () => {
      const p = await create();
      const now = 2_000;
      await p.upsertQuery(filterQuery("a1", "owner-a", now));
      await p.upsertQuery(semanticQuery("a2", "owner-a", now, "hello"));
      await p.upsertQuery(filterQuery("b1", "owner-b", now));

      const a = await p.listQueriesByOwner("owner-a");
      expect(a.map((q) => q.id).sort()).toEqual(["a1", "a2"]);
      const b = await p.listQueriesByOwner("owner-b");
      expect(b.map((q) => q.id)).toEqual(["b1"]);
    });

    test("active filter vs semantic lists are partitioned", async () => {
      const p = await create();
      const now = 3_000;
      await p.upsertQuery(filterQuery("f1", "owner-a", now));
      await p.upsertQuery(semanticQuery("s1", "owner-b", now, "lex"));

      const filters = await p.listActiveFilterQueries(now);
      const semantics = await p.listActiveSemanticQueries(now);
      expect(filters.map((q) => q.id)).toEqual(["f1"]);
      expect(semantics.map((q) => q.id)).toEqual(["s1"]);
    });

    test("deactivate excludes from active lists but get still returns row", async () => {
      const p = await create();
      const now = 4_000;
      await p.upsertQuery(filterQuery("f1", "owner-a", now));
      await p.deactivateQuery("f1", now + 1);

      expect((await p.listActiveFilterQueries(now + 1)).map((q) => q.id)).toEqual([]);
      const got = await p.getQuery("f1");
      expect(got?.active).toBe(false);
      expect(got?.updatedAtMs).toBe(now + 1);
    });

    test("delete removes the query entirely", async () => {
      const p = await create();
      const now = 5_000;
      await p.upsertQuery(semanticQuery("s1", "owner-a", now, "x"));
      await p.deleteQuery("s1");
      expect(await p.getQuery("s1")).toBeUndefined();
      expect(await p.listActiveSemanticQueries(now)).toEqual([]);
      expect(await p.listQueriesByOwner("owner-a")).toEqual([]);
    });

    test("expired queries are excluded from active lists", async () => {
      const p = await create();
      const now = 6_000;
      await p.upsertQuery(filterQuery("f1", "owner-a", now, { expiresAtMs: now + 100 }));
      expect((await p.listActiveFilterQueries(now + 50)).map((q) => q.id)).toEqual(["f1"]);
      expect((await p.listActiveFilterQueries(now + 100)).map((q) => q.id)).toEqual([]);
      expect((await p.listActiveFilterQueries(now + 101)).map((q) => q.id)).toEqual([]);
    });

    test("upsert relocates filter↔semantic when mode changes", async () => {
      const p = await create();
      const now = 7_000;
      await p.upsertQuery(filterQuery("q1", "owner-a", now));
      expect((await p.listActiveFilterQueries(now)).map((q) => q.id)).toEqual(["q1"]);

      await p.upsertQuery(semanticQuery("q1", "owner-a", now + 1, "moved"));
      expect(await p.listActiveFilterQueries(now + 1)).toEqual([]);
      expect((await p.listActiveSemanticQueries(now + 1)).map((q) => q.id)).toEqual(["q1"]);
      expect((await p.getQuery("q1"))?.search.content.text).toBe("moved");
    });
  });
}
