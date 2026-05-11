import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createProbeSubscribersRepo } from "./probe-subscribers-sqlite.ts";

describe("probe_subscribers SQLite", () => {
  test("upsert, list, delete round-trip", () => {
    const db = new Database(":memory:");
    const repo = createProbeSubscribersRepo(db);
    const vec = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    repo.upsert({
      probePostId: "p1",
      ownerProfileId: "owner-a",
      embeddingF32: vec,
      minHitScore: 0.6,
      topicSlugs: ["ai", "rust"],
      matchPostKinds: ["post"],
      expiresAtMs: null,
    });

    const rows = repo.listActive(Date.now());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("expected row");
    expect(row.probePostId).toBe("p1");
    expect(row.ownerProfileId).toBe("owner-a");
    expect(row.minHitScore).toBe(0.6);
    expect(row.topicSlugs).toEqual(["ai", "rust"]);
    expect(row.matchPostKinds).toEqual(["post"]);
    expect(row.embeddingF32).not.toBeNull();
    expect(Array.from(row.embeddingF32 as Float32Array)).toEqual([...vec]);

    repo.delete("p1");
    expect(repo.listActive(Date.now())).toHaveLength(0);
  });

  test("expired probes are excluded", () => {
    const db = new Database(":memory:");
    const repo = createProbeSubscribersRepo(db);
    const now = Date.now();
    repo.upsert({
      probePostId: "expired",
      ownerProfileId: "owner-a",
      embeddingF32: null,
      minHitScore: null,
      topicSlugs: null,
      matchPostKinds: null,
      expiresAtMs: now - 1,
    });
    repo.upsert({
      probePostId: "future",
      ownerProfileId: "owner-a",
      embeddingF32: null,
      minHitScore: null,
      topicSlugs: null,
      matchPostKinds: null,
      expiresAtMs: now + 60_000,
    });
    repo.upsert({
      probePostId: "no-expiry",
      ownerProfileId: "owner-a",
      embeddingF32: null,
      minHitScore: null,
      topicSlugs: null,
      matchPostKinds: null,
      expiresAtMs: null,
    });
    const rows = repo.listActive(now);
    const ids = rows.map((r) => r.probePostId).sort();
    expect(ids).toEqual(["future", "no-expiry"]);
  });

  test("upsert overwrites prior row", () => {
    const db = new Database(":memory:");
    const repo = createProbeSubscribersRepo(db);
    repo.upsert({
      probePostId: "p1",
      ownerProfileId: "owner-a",
      embeddingF32: null,
      minHitScore: 0.5,
      topicSlugs: null,
      matchPostKinds: null,
      expiresAtMs: null,
    });
    repo.upsert({
      probePostId: "p1",
      ownerProfileId: "owner-b",
      embeddingF32: null,
      minHitScore: 0.9,
      topicSlugs: ["x"],
      matchPostKinds: null,
      expiresAtMs: null,
    });
    const rows = repo.listActive(Date.now());
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("expected row");
    expect(row.ownerProfileId).toBe("owner-b");
    expect(row.minHitScore).toBe(0.9);
    expect(row.topicSlugs).toEqual(["x"]);
  });
});
