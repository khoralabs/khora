import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createSwarmHostEntitySqlitePersistence } from "./entity-sqlite.ts";
import { migrateAtriumHostDb } from "./migrate-atrium-host-db.ts";
import { listProbePostsForProfileId } from "./probe-posts-sqlite.ts";

describe("listProbePostsForProfileId", () => {
  test("returns probes for profile ordered newest first", () => {
    const db = new Database(":memory:");
    migrateAtriumHostDb(db);
    const posts = createSwarmHostEntitySqlitePersistence(db, "post");
    const probe = {
      id: "probe1",
      kind: "probe" as const,
      authorProfileId: "prof-a",
      body: "watch",
    };
    posts.upsert({
      id: "probe1",
      memoryId: null,
      bodyJson: JSON.stringify(probe),
    });
    posts.upsert({
      id: "post1",
      memoryId: null,
      bodyJson: JSON.stringify({
        id: "post1",
        kind: "post",
        authorProfileId: "prof-a",
        body: "hello",
      }),
    });
    const got = listProbePostsForProfileId(db, "prof-a", 10);
    expect(got).toHaveLength(1);
    expect(got[0]?.id).toBe("probe1");
  });
});
