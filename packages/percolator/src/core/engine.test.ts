import { describe, expect, test } from "bun:test";
import { createInMemoryPercolatorPersistence } from "../persistence/core";
import { createPercolator } from "./engine";

describe("createPercolator", () => {
  test("filter-only empty query matches candidate with required label", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: {
        content: {},
        options: { labels: { some: ["post"] } },
      },
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-b",
      namespace: "global",
      labelKinds: ["post"],
      content: { text: "hello" },
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchMode).toBe("filter-only");
    expect(matches[0]?.score).toBe(1);
  });

  test("filter-only rejects candidate missing label", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: {
        content: {},
        options: { labels: { some: ["post"] } },
      },
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-b",
      namespace: "global",
      labelKinds: ["profile"],
      content: {},
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(0);
  });

  test("namespace scope excludes out-of-scope candidate", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: {
        namespace: "global/agents/alice",
        content: {},
        options: { labels: { some: ["post"] } },
      },
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-b",
      namespace: "global/agents/bob/posts",
      labelKinds: ["post"],
      content: {},
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(0);
  });

  test("semantic mode returns all queries above threshold exhaustively", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: { content: { text: "platform beta" }, options: { minScore: 0.001 } },
    });
    await percolator.registerQuery({
      id: "q2",
      ownerId: "owner-b",
      ownerOrdinal: 2,
      search: { content: { text: "platform partners" }, options: { minScore: 0.001 } },
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-x",
      namespace: "global",
      labelKinds: ["post"],
      content: { text: "Seeking platform beta partners" },
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.queryId).sort()).toEqual(["q1", "q2"]);
    expect(matches.every((m) => m.matchMode === "semantic")).toBe(true);
  });

  test("semantic mode excludes query below minScore", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: { content: { text: "platform" } },
      minScore: 10,
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-x",
      namespace: "global",
      labelKinds: ["post"],
      content: { text: "platform tooling" },
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(0);
  });

  test("minScore on create overrides search.options.minScore", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    const q = await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: { content: { text: "alpha" }, options: { minScore: 0.5 } },
      minScore: 0.001,
    });
    expect(q.minScore).toBe(0.001);
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "author-x",
      namespace: "global",
      labelKinds: ["post"],
      content: { text: "alpha beta" },
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(1);
  });

  test("expired and deactivated queries are excluded", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    const now = 1_000_000;
    await percolator.registerQuery(
      {
        id: "expired",
        ownerId: "owner-a",
        ownerOrdinal: 1,
        search: { content: {} },
        expiresAtMs: now - 1,
      },
      now,
    );
    await percolator.registerQuery(
      {
        id: "active",
        ownerId: "owner-b",
        ownerOrdinal: 2,
        search: { content: {} },
      },
      now,
    );
    await percolator.deactivateQuery("active", now);
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

  test("does not match query owned by candidate author", async () => {
    const persistence = createInMemoryPercolatorPersistence();
    const percolator = createPercolator({ persistence });
    await percolator.registerQuery({
      id: "q1",
      ownerId: "owner-a",
      ownerOrdinal: 1,
      search: { content: {} },
    });
    const matches = await percolator.evaluateCandidate({
      candidateId: "c1",
      authorId: "owner-a",
      namespace: "global",
      labelKinds: ["post"],
      content: {},
      createdAtMs: Date.now(),
    });
    expect(matches).toHaveLength(0);
  });

  test("streams one ordinal-sorted aggregate per owner across modes and pages", async () => {
    const percolator = createPercolator({ persistence: createInMemoryPercolatorPersistence() });
    await percolator.registerQuery({
      id: "semantic",
      ownerId: "owner-b",
      ownerOrdinal: 2,
      search: { content: { text: "hello", vector: [1] } },
      minScore: 0,
    });
    for (const id of ["filter-b", "filter-a"]) {
      await percolator.registerQuery({
        id,
        ownerId: id === "filter-a" ? "owner-a" : "owner-b",
        ownerOrdinal: id === "filter-a" ? 1 : 2,
        search: { content: {} },
      });
    }
    const owners = [];
    for await (const owner of percolator.evaluateCandidateStream(
      {
        candidateId: "candidate",
        authorId: "author",
        namespace: "global",
        labelKinds: ["post"],
        content: { vector: [1] },
        createdAtMs: 1,
      },
      { pageSize: 1, now: 1 },
    )) {
      owners.push(owner);
    }
    expect(owners.map((owner) => owner.ownerOrdinal)).toEqual([1, 2]);
    expect(owners[1]?.matches.map((match) => match.queryId).sort()).toEqual([
      "filter-b",
      "semantic",
    ]);
  });
});
