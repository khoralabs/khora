import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createPercolator } from "@khoralabs/percolator";
import { createPercolatorSqlitePersistence } from "./index";

describe("createPercolatorSqlitePersistence", () => {
  test("persists and reloads standing query with search json round-trip", () => {
    const db = new Database(":memory:");
    const persistence = createPercolatorSqlitePersistence(db);
    const percolator = createPercolator({ persistence });
    const search = {
      namespace: "global/agents/alice",
      content: { text: "platform beta" },
      options: { labels: { some: ["post"] }, minScore: 0.01 },
    };
    percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      search,
      minScore: 0.005,
    });
    const loaded = persistence.getQuery("q1");
    expect(loaded?.search).toEqual(search);
    expect(loaded?.minScore).toBe(0.005);
  });

  test("filter-only and semantic evaluation via sqlite persistence", async () => {
    const db = new Database(":memory:");
    const persistence = createPercolatorSqlitePersistence(db);
    const percolator = createPercolator({ persistence });
    percolator.registerQuery({
      id: "filter",
      ownerId: "owner-a",
      search: { content: {}, options: { labels: { some: ["post"] } } },
    });
    percolator.registerQuery({
      id: "semantic-a",
      ownerId: "owner-b",
      search: { content: { text: "platform" } },
      minScore: 0.001,
    });
    percolator.registerQuery({
      id: "semantic-b",
      ownerId: "owner-c",
      search: { content: { text: "beta" } },
      minScore: 0.001,
    });

    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-x",
      namespace: "global",
      labelKinds: ["post"],
      content: { text: "platform beta program" },
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(3);
    expect(matches.some((m) => m.queryId === "filter" && m.matchMode === "filter-only")).toBe(true);
    expect(matches.filter((m) => m.matchMode === "semantic")).toHaveLength(2);
  });

  test("deactivated query excluded from active list", async () => {
    const db = new Database(":memory:");
    const persistence = createPercolatorSqlitePersistence(db);
    const percolator = createPercolator({ persistence });
    const now = 5_000;
    percolator.registerQuery({ id: "q1", ownerId: "owner-a", search: { content: {} } }, now);
    percolator.deactivateQuery("q1", now);
    const matches = await percolator.evaluateCandidate(
      {
        candidateId: "c1",
        authorId: "author-x",
        namespace: "global",
        labelKinds: ["post"],
        content: {},
        createdAtMs: now,
      },
      now,
    );
    expect(matches).toHaveLength(0);
  });
});
