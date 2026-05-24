import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCachedProfile,
  resolveProfileSyncPath,
  serializeProfileSyncStateFile,
} from "./cached-profile.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atrium-cached-profile-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadCachedProfile", () => {
  test("happy path returns parsed snapshot", () => {
    const path = join(dir, "profile.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        syncedAtMs: 123,
        did: "did:key:a",
        profile: { id: "p1", username: "ada", displayName: "Ada" },
        topicSlugs: ["rust"],
        subscriptions: [],
      }),
    );
    const snap = loadCachedProfile(path);
    expect(snap?.did).toBe("did:key:a");
    expect(snap?.profile.username).toBe("ada");
    expect(snap?.syncedAtMs).toBe(123);
    expect(snap?.topicSlugs).toEqual(["rust"]);
    expect(snap?.authorTopics).toEqual([]);
  });

  test("missing file returns undefined", () => {
    expect(loadCachedProfile(join(dir, "nope.json"))).toBeUndefined();
  });

  test("malformed JSON returns undefined", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json");
    expect(loadCachedProfile(path)).toBeUndefined();
  });

  test("wrong version returns undefined", () => {
    const path = join(dir, "v2.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        syncedAtMs: 1,
        did: "did:key:a",
        profile: { id: "p1", username: "ada" },
        topicSlugs: [],
        subscriptions: [],
      }),
    );
    expect(loadCachedProfile(path)).toBeUndefined();
  });

  test("missing required fields returns undefined", () => {
    const path = join(dir, "partial.json");
    writeFileSync(path, JSON.stringify({ version: 1, syncedAtMs: 1, did: "did:key:a" }));
    expect(loadCachedProfile(path)).toBeUndefined();
  });
});

describe("resolveProfileSyncPath", () => {
  test("returns absolute path joined with dataDir", () => {
    const p = resolveProfileSyncPath({
      dataDir: "/tmp/at2",
      plugins: { "at2.plugin.profile-sync": { filePath: "profile.json" } },
    });
    expect(p).toBe("/tmp/at2/profile.json");
  });

  test("absolute filePath wins over dataDir", () => {
    const p = resolveProfileSyncPath({
      dataDir: "/tmp/at2",
      plugins: { "at2.plugin.profile-sync": { filePath: "/abs/state.json" } },
    });
    expect(p).toBe("/abs/state.json");
  });

  test("returns undefined when plugin disabled", () => {
    expect(
      resolveProfileSyncPath({
        plugins: { "at2.plugin.profile-sync": false },
      }),
    ).toBeUndefined();
  });

  test("returns undefined when plugin missing", () => {
    expect(resolveProfileSyncPath({})).toBeUndefined();
  });
});

describe("serializeProfileSyncStateFile round-trip", () => {
  test("write then load returns the same snapshot", () => {
    const path = join(dir, "round.json");
    const snap = {
      did: "did:key:a",
      profile: { id: "p1", username: "ada", displayName: "Ada" },
      topicSlugs: ["rust"],
      authorTopics: [],
      subscriptions: [],
      syncedAtMs: 9999,
    };
    writeFileSync(path, serializeProfileSyncStateFile(snap));
    expect(loadCachedProfile(path)).toEqual(snap);
  });

  test("accepts subscription posts in snapshot", () => {
    const path = join(dir, "subscriptions.json");
    const snap = {
      did: "did:key:a",
      profile: { id: "p1", username: "ada" },
      topicSlugs: [],
      authorTopics: [],
      subscriptions: [
        {
          id: "sub-1",
          kind: "subscription" as const,
          title: "Intros",
          body: "Looking",
          authorProfileId: "p1",
          authorSignature: "test-post-sig",
          search: { content: { text: "intros" } },
        },
      ],
      syncedAtMs: 1,
    };
    writeFileSync(path, serializeProfileSyncStateFile(snap));
    expect(loadCachedProfile(path)?.subscriptions[0]?.kind).toBe("subscription");
  });
});
