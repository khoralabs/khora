import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { zAtriumPost } from "@khoralabs/atrium-contracts";
import { SWARM_EVENT_KIND } from "@khoralabs/swarm-host";
import { deleteOtherStatusPostsForAuthor } from "./atrium-status-posts.ts";
import type { AtriumHostContext } from "./create-atrium-host.ts";
import { createSwarmHostPostSqlitePersistence } from "./persistence/sqlite/entity-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./persistence/sqlite/schema.ts";

describe("deleteOtherStatusPostsForAuthor", () => {
  test("notifies POST_DELETED for every other status row", async () => {
    const db = new Database(":memory:");
    ensureSwarmHostSqliteSchema(db);
    const posts = createSwarmHostPostSqlitePersistence(db);
    const status1 = zAtriumPost.parse({
      id: "st-1",
      kind: "status",
      body: "first",
      authorProfileId: "prof-a",
    });
    const status2 = zAtriumPost.parse({
      id: "st-2",
      kind: "status",
      body: "second",
      authorProfileId: "prof-a",
    });
    posts.upsert({
      id: status1.id,
      memoryId: null,
      bodyJson: JSON.stringify(status1),
    });
    posts.upsert({
      id: status2.id,
      memoryId: null,
      bodyJson: JSON.stringify(status2),
    });

    const notified: Array<{ kind: string; payload: { post: unknown } }> = [];
    const ctx = {
      host: {
        persistenceClient: {
          listPostRowsByAuthorProfileIdAndKind: posts.listRowsByAuthorProfileIdAndKind.bind(posts),
        },
        notify: async (e: { kind: string; payload: { post: unknown } }) => {
          notified.push(e);
        },
      },
    } as unknown as AtriumHostContext;

    await deleteOtherStatusPostsForAuthor(ctx, "prof-a", "st-2");

    expect(notified).toHaveLength(1);
    expect(notified[0]?.kind).toBe(SWARM_EVENT_KIND.POST_DELETED);
    expect((notified[0]?.payload.post as { id: string }).id).toBe("st-1");
  });
});
