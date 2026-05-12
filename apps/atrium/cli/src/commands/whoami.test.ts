import { describe, expect, test } from "bun:test";
import { AtriumClientError, type CachedProfileSnapshot } from "@khoralabs/atrium-client";
import { runWhoamiWith, type WhoamiIo } from "./whoami.ts";

class TestExit extends Error {
  constructor(public code: number) {
    super(`exit ${code}`);
  }
}

function makeIo(): { lines: string[]; errs: string[]; exitCodes: number[]; io: WhoamiIo } {
  const lines: string[] = [];
  const errs: string[] = [];
  const exitCodes: number[] = [];
  const io: WhoamiIo = {
    log: (l) => lines.push(l),
    err: (l) => errs.push(l),
    exit: (c) => {
      exitCodes.push(c);
      throw new TestExit(c);
    },
  };
  return { lines, errs, exitCodes, io };
}

function cached(): CachedProfileSnapshot {
  return {
    did: "did:key:a",
    profile: { id: "p1", username: "ada", displayName: "Ada" },
    topicSlugs: [],
    probes: [],
    syncedAtMs: 1_000,
  };
}

describe("runWhoamiWith", () => {
  test("cache hit prints offline without fetching", async () => {
    const { lines, io } = makeIo();
    let fetched = false;
    await runWhoamiWith(
      {
        did: "did:key:a",
        cachePath: "/tmp/profile.json",
        noFetch: false,
        loadCache: () => cached(),
        nowMs: () => 60_000,
        fetchLive: async () => {
          fetched = true;
          throw new Error("should not fetch");
        },
      },
      false,
      io,
    );
    expect(fetched).toBe(false);
    expect(lines.some((l) => l.includes("did:key:a"))).toBe(true);
    expect(lines.some((l) => l.includes("ada"))).toBe(true);
    expect(lines.some((l) => l.includes("cache"))).toBe(true);
  });

  test("cache miss fetches live and writes cache", async () => {
    const { lines, io } = makeIo();
    const writes: { path: string; contents: string }[] = [];
    await runWhoamiWith(
      {
        did: "did:key:a",
        cachePath: "/tmp/profile.json",
        noFetch: false,
        loadCache: () => undefined,
        nowMs: () => 5_000,
        fetchLive: async () => ({
          did: "did:key:a",
          profile: { id: "p1", username: "alice", displayName: "Alice" },
          topicSlugs: ["rust"],
          probes: [],
          syncedAtMs: 5_000,
        }),
        writeCache: (path, contents) => writes.push({ path, contents }),
      },
      false,
      io,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe("/tmp/profile.json");
    expect(JSON.parse(writes[0]?.contents ?? "")).toMatchObject({
      version: 1,
      did: "did:key:a",
      profile: { username: "alice" },
    });
    expect(lines.some((l) => l.includes("alice"))).toBe(true);
    expect(lines.some((l) => l.includes("live"))).toBe(true);
  });

  test("cache miss + unreachable host exits 3 with identity-only output", async () => {
    const { lines, exitCodes, io } = makeIo();
    await expect(
      runWhoamiWith(
        {
          did: "did:key:a",
          cachePath: "/tmp/profile.json",
          noFetch: false,
          loadCache: () => undefined,
          nowMs: () => 5_000,
          fetchLive: async () => {
            throw new Error("ECONNREFUSED");
          },
        },
        false,
        io,
      ),
    ).rejects.toBeInstanceOf(TestExit);
    expect(exitCodes).toEqual([3]);
    expect(lines.some((l) => l.includes("did:key:a"))).toBe(true);
    expect(lines.some((l) => l.includes("host unreachable"))).toBe(true);
  });

  test("--no-fetch with no cache exits 3", async () => {
    const { lines, exitCodes, io } = makeIo();
    await expect(
      runWhoamiWith(
        {
          did: "did:key:a",
          cachePath: "/tmp/profile.json",
          noFetch: true,
          loadCache: () => undefined,
          nowMs: () => 5_000,
          fetchLive: async () => {
            throw new Error("should not fetch");
          },
        },
        false,
        io,
      ),
    ).rejects.toBeInstanceOf(TestExit);
    expect(exitCodes).toEqual([3]);
    expect(lines.some((l) => l.includes("host unreachable"))).toBe(true);
  });

  test("not-registered surfaces 'Run atrium register' and exit 3", async () => {
    const { errs, exitCodes, io } = makeIo();
    await expect(
      runWhoamiWith(
        {
          did: "did:key:a",
          cachePath: undefined,
          noFetch: false,
          loadCache: () => undefined,
          nowMs: () => 5_000,
          fetchLive: async () => {
            throw new AtriumClientError("not registered", 400);
          },
        },
        false,
        io,
      ),
    ).rejects.toBeInstanceOf(TestExit);
    expect(exitCodes).toEqual([3]);
    expect(errs.some((l) => l.includes("atrium register"))).toBe(true);
  });

  test("--json emits machine-readable cache snapshot", async () => {
    const { lines, io } = makeIo();
    await runWhoamiWith(
      {
        did: "did:key:a",
        cachePath: "/tmp/profile.json",
        noFetch: false,
        loadCache: () => cached(),
        nowMs: () => 60_000,
        fetchLive: async () => {
          throw new Error("should not fetch");
        },
      },
      true,
      io,
    );
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed).toMatchObject({
      did: "did:key:a",
      username: "ada",
      source: "cache",
    });
  });

  test("cache hit for a different DID forces refetch", async () => {
    const { lines, io } = makeIo();
    await runWhoamiWith(
      {
        did: "did:key:b",
        cachePath: "/tmp/profile.json",
        noFetch: false,
        loadCache: () => cached(), // belongs to did:key:a
        nowMs: () => 5_000,
        fetchLive: async () => ({
          did: "did:key:b",
          profile: { id: "p2", username: "bob" },
          topicSlugs: [],
          probes: [],
          syncedAtMs: 5_000,
        }),
        writeCache: () => {},
      },
      false,
      io,
    );
    expect(lines.some((l) => l.includes("bob"))).toBe(true);
    expect(lines.some((l) => l.includes("live"))).toBe(true);
  });
});
